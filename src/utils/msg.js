"use strict"

import {
    proto,
    jidNormalizedUser,
    getContentType,
    downloadContentFromMessage
} from "baileys"

const MEDIA_TYPES = new Set([
    "imageMessage",
    "videoMessage",
    "audioMessage",
    "stickerMessage",
    "documentMessage"
])

function unwrapMessage(message = {}) {
    let current = message

    while (current) {
        const type = getContentType(current)

        if (
            type === "ephemeralMessage" ||
            type === "viewOnceMessage" ||
            type === "viewOnceMessageV2" ||
            type === "viewOnceMessageV2Extension" ||
            type === "documentWithCaptionMessage"
        ) {
            current =
                current[type]?.message ||
                current[type] ||
                {}

            continue
        }

        break
    }

    return current || {}
}

function getMedia(message = {}) {
    const unwrapped = unwrapMessage(message)
    const type = getContentType(unwrapped)

    if (!type) {
        return {
            type: null,
            content: null,
            message: unwrapped
        }
    }

    if (!MEDIA_TYPES.has(type)) {
        return {
            type,
            content: null,
            message: unwrapped
        }
    }

    return {
        type,
        content: unwrapped[type],
        message: unwrapped
    }
}

function getMessageText(message = {}) {
    const unwrapped = unwrapMessage(message)
    const type = getContentType(unwrapped)

    if (!type) return ""

    const content = unwrapped[type]

    if (typeof content === "string") {
        return content
    }

    if (!content) return ""

    if (typeof content.text === "string") {
        return content.text
    }

    if (typeof content.caption === "string") {
        return content.caption
    }

    if (typeof content.selectedDisplayText === "string") {
        return content.selectedDisplayText
    }

    if (typeof content.contentText === "string") {
        return content.contentText
    }

    if (typeof content.title === "string") {
        return content.title
    }

    if (typeof content.description === "string") {
        return content.description
    }

    if (content.buttonsResponseMessage?.selectedDisplayText) {
        return content.buttonsResponseMessage.selectedDisplayText
    }

    if (content.listResponseMessage?.title) {
        return content.listResponseMessage.title
    }

    if (content.listResponseMessage?.singleSelectReply?.selectedRowId) {
        return content.listResponseMessage.singleSelectReply.selectedRowId
    }

    if (content.templateButtonReplyMessage?.selectedDisplayText) {
        return content.templateButtonReplyMessage.selectedDisplayText
    }

    if (content.templateButtonReplyMessage?.selectedId) {
        return content.templateButtonReplyMessage.selectedId
    }

    return ""
}

function normalizeTimestamp(timestamp) {
    if (typeof timestamp === "number") {
        return timestamp
    }

    if (
        timestamp &&
        typeof timestamp === "object" &&
        typeof timestamp.low === "number"
    ) {
        return timestamp.low
    }

    const value = Number(timestamp)

    return Number.isFinite(value) ? value : 0
}

export function getDeviceType(id = "") {
    const value = String(id)

    if (!value) return "unknown"

    if (value.startsWith("3EB0")) {
        return "web"
    }

    if (value.startsWith("BAE5")) {
        return "android"
    }

    if (value.length >= 20) {
        return "web"
    }

    return "unknown"
}

async function resolveLid(jid, socket, dStore, chat) {
    if (!jid) return ""

    const normalized = jidNormalizedUser(jid)

    if (!normalized.endsWith("@lid")) {
        return normalized
    }

    try {
        if (typeof socket?.getJid === "function") {
            const result = await socket.getJid(normalized)

            if (
                result &&
                !String(result).endsWith("@lid")
            ) {
                return jidNormalizedUser(result)
            }
        }
    } catch {}

    try {
        const metadata = dStore?.groupMetadata?.[chat]
        const participants = metadata?.participants || []

        const participant = participants.find(item => {
            const ids = [
                item?.id,
                item?.jid,
                item?.lid,
                item?.phoneNumber
            ]
                .filter(Boolean)
                .map(value => jidNormalizedUser(value))

            return ids.includes(normalized)
        })

        if (participant) {
            const result =
                participant.jid ||
                participant.phoneNumber ||
                participant.id

            if (
                result &&
                !String(result).endsWith("@lid")
            ) {
                return jidNormalizedUser(result)
            }
        }
    } catch {}

    try {
        for (const metadata of Object.values(
            dStore?.groupMetadata || {}
        )) {
            const participants = metadata?.participants || []

            const participant = participants.find(
                item =>
                    item?.id === normalized ||
                    item?.lid === normalized ||
                    item?.jid === normalized
            )

            if (participant) {
                const result =
                    participant.jid ||
                    participant.phoneNumber ||
                    participant.id

                if (
                    result &&
                    !String(result).endsWith("@lid")
                ) {
                    return jidNormalizedUser(result)
                }
            }
        }
    } catch {}

    return normalized
}

async function resolveSender(
    message,
    socket,
    dStore,
    chat,
    isGroup
) {
    const key = message?.key || {}

    let sender =
        key.participantAlt ||
        key.participant ||
        (isGroup ? "" : key.remoteJid) ||
        ""

    sender = jidNormalizedUser(sender)

    sender = await resolveLid(
        sender,
        socket,
        dStore,
        chat
    )

    let senderName = message?.pushName || ""

    if (isGroup) {
        const metadata = dStore?.groupMetadata?.[chat]
        const participants = metadata?.participants || []

        const participant = participants.find(item => {
            const ids = [
                item?.id,
                item?.jid,
                item?.lid,
                item?.phoneNumber
            ]
                .filter(Boolean)
                .map(value => jidNormalizedUser(value))

            return ids.includes(
                jidNormalizedUser(
                    key.participant || ""
                )
            )
        })

        if (participant) {
            const result =
                participant.jid ||
                participant.phoneNumber ||
                participant.id

            if (result) {
                sender = await resolveLid(
                    result,
                    socket,
                    dStore,
                    chat
                )
            }

            senderName =
                participant.notify ||
                participant.name ||
                senderName
        }
    }

    return {
        sender: jidNormalizedUser(sender),
        senderName
    }
}

async function resolveMetadata(
    chat,
    isGroup,
    socket,
    dStore
) {
    if (!isGroup) return {}

    if (dStore?.groupMetadata?.[chat]) {
        return dStore.groupMetadata[chat]
    }

    try {
        const metadata = await socket.groupMetadata(chat)

        dStore.groupMetadata ??= {}
        dStore.groupMetadata[chat] = metadata

        return metadata || {}
    } catch {
        return {}
    }
}

async function findStoredMessage(chat, id, dStore) {
    if (!id || !dStore) return null

    const direct = dStore.messages?.[chat]

    if (Array.isArray(direct)) {
        const found = direct.find(
            item => item?.key?.id === id
        )

        if (found) return found
    }

    for (const list of Object.values(
        dStore.messages || {}
    )) {
        if (!Array.isArray(list)) continue

        const found = list.find(
            item => item?.key?.id === id
        )

        if (found) return found
    }

    return null
}

async function createQuoted(
    contextInfo,
    socket,
    dStore,
    chat
) {
    const quotedId = contextInfo?.stanzaId

    if (!quotedId) return null

    const stored = await findStoredMessage(
        chat,
        quotedId,
        dStore
    )

    if (stored) {
        return procMsg(
            stored,
            socket,
            dStore
        )
    }

    const quotedMessage =
        contextInfo?.quotedMessage

    if (!quotedMessage) return null

    const fakeMessage = {
        key: {
            remoteJid: chat,
            fromMe:
                contextInfo?.participant ===
                socket?.user?.id,
            id: quotedId,
            participant:
                contextInfo?.participant || ""
        },
        message: quotedMessage,
        messageTimestamp: 0,
        pushName: ""
    }

    return procMsg(
        fakeMessage,
        socket,
        dStore
    )
}

async function downloadMedia(
    m,
    socket,
    saveToFile = false
) {
    const media = getMedia(m.message)

    if (!media.type || !media.content) {
        return Buffer.alloc(0)
    }

    const content = media.content

    const mediaType =
        media.type.replace(
            /Message$/i,
            ""
        )

    try {
        if (
            typeof socket?.downloadM ===
            "function"
        ) {
            const result =
                await socket.downloadM(
                    content,
                    mediaType,
                    saveToFile
                )

            if (
                result &&
                (
                    Buffer.isBuffer(result) ||
                    typeof result === "string"
                )
            ) {
                return result
            }
        }
    } catch {}

    try {
        const stream =
            await downloadContentFromMessage(
                content,
                mediaType
            )

        const chunks = []

        for await (const chunk of stream) {
            chunks.push(
                Buffer.from(chunk)
            )
        }

        return Buffer.concat(chunks)
    } catch {}

    return Buffer.alloc(0)
}

export async function procMsg(
    message,
    socket,
    dStore = {}
) {
    if (!message) {
        return createEmptyMessage()
    }

    const key = message.key || {}
    const rawMessage = message.message || {}

    const chat =
        jidNormalizedUser(
            key.remoteJid || ""
        )

    const fromMe =
        key.fromMe === true

    const isGroup =
        chat.endsWith("@g.us")

    const unwrapped =
        unwrapMessage(rawMessage)

    const msgType =
        getContentType(unwrapped) || ""

    const content =
        unwrapped?.[msgType] || {}

    const contextInfo =
        content?.contextInfo || {}

    const media =
        getMedia(rawMessage)

    const body =
        getMessageText(rawMessage)

    const mentionedJids =
        contextInfo?.mentionedJid || []

    const senderData =
        await resolveSender(
            message,
            socket,
            dStore,
            chat,
            isGroup
        )

    const metadata =
        await resolveMetadata(
            chat,
            isGroup,
            socket,
            dStore
        )

    const m = {
        key,
        id: key.id || "",
        chat,
        fromMe,
        isGroup,

        sender:
            senderData.sender,

        senderName:
            message.pushName ||
            senderData.senderName ||
            "Unknown",

        participant:
            senderData.sender,

        pushName:
            message.pushName ||
            senderData.senderName ||
            "Unknown",

        type: msgType,
        metadata,
        message: rawMessage,
        msgType,

        msgTimestamp:
            normalizeTimestamp(
                message.messageTimestamp
            ),

        text: body,
        body,

        mentionedJids,
        mentioned: mentionedJids,

        isMedia:
            Boolean(
                media.type &&
                media.content
            ),

        isQuoted:
            Boolean(
                contextInfo?.stanzaId
            ),

        device:
            getDeviceType(
                key.id
            ),

        isBot:
            fromMe,

        quoted: null,
        quotedType: "",
        quotedMessage: null,
        quotedText: "",
        quotedSender: "",

        msg: content,

        mediaMessage:
            media.content
                ? {
                    [media.type]:
                        media.content
                }
                : null,

        mediaType:
            media.type || null,

        reply: async (
            text,
            options = {}
        ) => {
            const data =
                typeof text === "string"
                    ? { text }
                    : text || { text: "" }

            return socket.sendMessage(
                m.chat,
                data,
                {
                    quoted: message,
                    ...options
                }
            )
        },

        download: async (
            saveToFile = false
        ) => {
            return downloadMedia(
                m,
                socket,
                saveToFile
            )
        },

        edit: async text => {
            return socket.sendMessage(
                m.chat,
                {
                    text:
                        String(
                            text ?? ""
                        ),
                    edit: m.key
                }
            )
        },

        react: async emoji => {
            return socket.sendMessage(
                m.chat,
                {
                    react: {
                        text:
                            String(
                                emoji ?? ""
                            ),
                        key: m.key
                    }
                }
            )
        },

        delete: async () => {
            return socket.sendMessage(
                m.chat,
                {
                    delete: m.key
                }
            )
        },

        copy: async () => {
            return procMsg(
                message,
                socket,
                dStore
            )
        },

        forward: async (
            jid,
            forceForward = false,
            options = {}
        ) => {
            if (
                typeof socket.copyNForward ===
                "function"
            ) {
                return socket.copyNForward(
                    jid,
                    message,
                    forceForward,
                    options
                )
            }

            return null
        },

        copyNForward: async (
            jid,
            forceForward = false,
            options = {}
        ) => {
            if (
                typeof socket.copyNForward ===
                "function"
            ) {
                return socket.copyNForward(
                    jid,
                    message,
                    forceForward,
                    options
                )
            }

            return null
        },

        cMod: async (
            jid,
            text = "",
            senderJid = m.sender,
            options = {}
        ) => {
            if (
                typeof socket.cMod ===
                "function"
            ) {
                return socket.cMod(
                    jid,
                    message,
                    text,
                    senderJid,
                    options
                )
            }

            return null
        },

        getQuotedObj: async () => {
            return m.quoted || null
        },

        getQuotedMessage: async () => {
            return findStoredMessage(
                m.chat,
                m.quoted?.id,
                dStore
            )
        }
    }

    if (m.isQuoted) {
        const quoted =
            await createQuoted(
                contextInfo,
                socket,
                dStore,
                m.chat
            )

        if (quoted) {
            m.quoted = quoted
            m.quotedType = quoted.type
            m.quotedMessage = quoted.message
            m.quotedText =
                quoted.body ||
                quoted.text ||
                ""
            m.quotedSender =
                quoted.sender ||
                ""
        }
    }

    return m
}

export function storeMessage(
    message,
    dStore
) {
    if (!message?.key?.id) {
        return
    }

    const ids = [
        message.key.remoteJid,
        message.key.participant
    ].filter(Boolean)

    dStore.messages ??= {}

    for (const jid of ids) {
        dStore.messages[jid] ??= []

        const list =
            dStore.messages[jid]

        const index =
            list.findIndex(
                item =>
                    item?.key?.id ===
                    message.key.id
            )

        if (index >= 0) {
            list[index] = message
        } else {
            list.push(message)
        }

        if (list.length > 100) {
            list.splice(
                0,
                list.length - 100
            )
        }
    }
}

function createEmptyMessage() {
    return {
        key: {},
        id: "",
        chat: "",
        fromMe: false,
        isGroup: false,
        sender: "",
        senderName: "",
        participant: "",
        pushName: "",
        type: "",
        metadata: {},
        message: {},
        msgType: "",
        msgTimestamp: 0,
        text: "",
        body: "",
        mentionedJids: [],
        mentioned: [],
        isMedia: false,
        isQuoted: false,
        device: "unknown",
        isBot: false,
        quoted: null,
        quotedType: "",
        quotedMessage: null,
        quotedText: "",
        quotedSender: "",
        msg: {},
        mediaMessage: null,
        mediaType: null,

        reply: async () => null,

        download: async () =>
            Buffer.alloc(0),

        edit: async () => null,

        react: async () => null,

        delete: async () => null,

        copy: async () => null,

        forward: async () => null,

        copyNForward: async () => null,

        cMod: async () => null,

        getQuotedObj: async () => null,

        getQuotedMessage: async () => null
    }
}

export default procMsg