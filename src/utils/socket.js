'use strict'

import fs from 'fs'
import path from 'path'
import util from 'util'
import { fileURLToPath } from 'url'
import { createHash } from 'crypto'
import chalk from 'chalk'
import PhoneNumber from 'awesome-phonenumber'
import { fileTypeFromBuffer } from 'file-type'
import sharp from 'sharp'
import { LRUCache } from 'lru-cache'

import { sendStickerPack as createStickerPack } from "./stickerPack.js"

import {
    toAudio
} from './converter.js'

import MakeWASocket, {
    proto,
    delay,
    downloadContentFromMessage,
    areJidsSameUser,
    generateForwardMessageContent,
    generateWAMessageFromContent,
    generateWAMessage,
    getBinaryNodeChild,
    WAMessageStubType,
    prepareWAMessageMedia
} from 'baileys'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default async function makeWASocket(connectionOptions, options = {}) {
    const conn = MakeWASocket(connectionOptions)
    
    Object.defineProperty(conn, 'decodeJid', {
        value(jid) {
            if (!jid || typeof jid !== 'string')
                return (!nullish(jid) && jid) || null

            return typeof jid.decodeJid === 'function'
                ? jid.decodeJid()
                : jid
        }
    })

    conn.resize = async (buffer, width = 720, height = 720) => {
        return await sharp(buffer)
            .resize(width, height, {
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({
                quality: 85
            })
            .toBuffer()
    }

    const mediaCache = new LRUCache({
        maxSize: 150 * 1024 * 1024,
        ttl: 1000 * 60 * 10,
        ttlAutopurge: true,
        updateAgeOnGet: true,
        updateAgeOnHas: false,
        allowStale: false,
        sizeCalculation: value =>
            value == null
                ? 0
                : Buffer.isBuffer(value)
                    ? value.length
                    : Buffer.byteLength(
                        typeof value === 'object'
                            ? JSON.stringify(value) || ''
                            : String(value)
                    )
    })

    conn.chats = conn.ev

    const originalSendMessage =
        conn.sendMessage.bind(conn)

    conn.sendMessage = async function (
        jid,
        content,
        options = {}
    ) {
        return await originalSendMessage(
            jid,
            content,
            options
        )
    }

    conn.getJid = function (jid = '') {
        return conn.decodeJid(jid)
    }

    conn.logger = function (...args) {
        console.log(
            chalk.cyan('[CONN]'),
            ...args
        )
    }

    const originalProfilePictureUrl =
        conn.profilePictureUrl?.bind(conn)

    conn.profilePictureUrl = async function (
        jid,
        type = 'image',
        timeoutMs = 5000
    ) {
        try {
            if (originalProfilePictureUrl)
                return await originalProfilePictureUrl(
                    jid,
                    type,
                    timeoutMs
                )
        } catch {}

        try {
            if (originalProfilePictureUrl)
                return await originalProfilePictureUrl(
                    conn.decodeJid(jid),
                    type,
                    timeoutMs
                )
        } catch {}

        return `${__dirname}/../media/avatar.png`
    }

    conn.getFile = async function (
        input,
        saveToFile = false
    ) {
        let data
        let filename
        let mimetype

        if (Buffer.isBuffer(input)) {
            data = input
        } else if (input instanceof ArrayBuffer) {
            data = Buffer.from(input)
        } else if (
            typeof input === 'string' &&
            /^data:.*?\/.*?;base64,/i.test(input)
        ) {
            data = Buffer.from(
                input.split(',')[1],
                'base64'
            )
        } else if (
            typeof input === 'string' &&
            /^https?:\/\//i.test(input)
        ) {
            if (mediaCache.has(input)) {
                data = mediaCache.get(input)
            } else {
                const response = await fetch(input)

                if (!response.ok)
                    throw new Error(
                        `HTTP ${response.status}`
                    )

                data = Buffer.from(
                    await response.arrayBuffer()
                )

                mimetype =
                    response.headers.get(
                        'content-type'
                    )?.split(';')[0] || ''

                mediaCache.set(
                    input,
                    data
                )
            }
        } else if (
            typeof input === 'string' &&
            fs.existsSync(input)
        ) {
            data =
                await fs.promises.readFile(
                    input
                )

            filename = input
        } else if (
            typeof input === 'string'
        ) {
            data = Buffer.from(input)
        } else {
            throw new Error(
                'Invalid file input'
            )
        }

        if (!mimetype) {
            const type =
                await fileTypeFromBuffer(data)

            if (type) {
                mimetype = type.mime

                if (!filename)
                    filename =
                        `file.${type.ext}`
            }
        }

        mimetype =
            mimetype ||
            'application/octet-stream'

        const ext =
            mimetype.split('/')[1] ||
            'bin'

        const result = {
            filename,
            mimetype,
            ext,
            size: data.length,
            data
        }

        if (saveToFile) {
            const tmp =
                path.join(
                    process.cwd(),
                    'tmp'
                )

            await fs.promises.mkdir(
                tmp,
                {
                    recursive: true
                }
            )

            const name =
                `${Date.now()}-${Math.random()
                    .toString(36)
                    .slice(2)}.${ext}`

            filename =
                path.join(
                    tmp,
                    name
                )

            await fs.promises.writeFile(
                filename,
                data
            )

            result.filename = filename
        }

        return result
    }

    conn.sendFile = async function (
        jid,
        input,
        filename = '',
        caption = '',
        quoted,
        ptt = false,
        options = {}
    ) {
        const file =
            await conn.getFile(
                input,
                true
            )

        const mime =
            file.mimetype ||
            'application/octet-stream'

        if (/^image\//i.test(mime)) {
            return await conn.sendMessage(
                jid,
                {
                    image: file.data,
                    caption,
                    ...options
                },
                {
                    quoted
                }
            )
        }

        if (/^video\//i.test(mime)) {
            return await conn.sendMessage(
                jid,
                {
                    video: file.data,
                    caption,
                    fileName:
                        filename ||
                        path.basename(
                            file.filename ||
                            ''
                        ),
                    ...options
                },
                {
                    quoted
                }
            )
        }

        if (/^audio\//i.test(mime)) {
            return await conn.sendMessage(
                jid,
                {
                    audio: file.data,
                    mimetype: mime,
                    ptt,
                    ...options
                },
                {
                    quoted
                }
            )
        }

        return await conn.sendMessage(
            jid,
            {
                document: file.data,
                fileName:
                    filename ||
                    (
                        file.filename
                            ? path.basename(
                                file.filename
                            )
                            : `file.${file.ext}`
                    ),
                mimetype: mime,
                caption,
                ...options
            },
            {
                quoted
            }
        )
    }

    conn.sendSticker = async function (
        jid,
        input,
        quoted,
        options = {}
    ) {
        let buffer = input

        if (!Buffer.isBuffer(buffer)) {
            buffer =
                (
                    await conn.getFile(
                        input
                    )
                ).data
        }

        return await conn.sendMessage(
            jid,
            {
                sticker: buffer,
                ...options
            },
            {
                quoted
            }
        )
    }

    conn.sendMedia = async function (
        jid,
        input,
        fileName = '',
        caption = '',
        quoted,
        options = {}
    ) {
        const file =
            await conn.getFile(input)

        return await conn.sendFile(
            jid,
            file.data,
            fileName ||
                file.filename,
            caption,
            quoted,
            false,
            options
        )
    }

    conn.sendAlbum = async function (
        jid,
        medias = [],
        options = {}
    ) {
        if (!Array.isArray(medias))
            throw new TypeError(
                'medias must be an array'
            )

        const results = []

        for (const media of medias) {
            const result =
                await conn.sendMedia(
                    jid,
                    media.input ||
                        media.url ||
                        media,
                    media.fileName ||
                        '',
                    media.caption ||
                        '',
                    options.quoted,
                    media.options ||
                        {}
                )

            results.push(result)

            if (options.delay)
                await delay(options.delay)
        }

        return results
    }

    conn.sendAlbumMessage =
        async function (
            jid,
            medias = [],
            options = {}
        ) {
            const messages = []

            for (const media of medias) {
                let content

                if (
                    media.image ||
                    media.video
                ) {
                    content = {
                        ...media
                    }
                } else {
                    const file =
                        await conn.getFile(
                            media.url ||
                                media.input
                        )

                    content = {
                        image: file.data,
                        caption:
                            media.caption ||
                            '',
                        ...media.options
                    }
                }

                messages.push(
                    await generateWAMessage(
                        jid,
                        content,
                        {
                            userJid:
                                conn.user?.id,
                            upload:
                                conn.waUploadToServer
                        }
                    )
                )
            }

            for (const msg of messages) {
                await conn.relayMessage(
                    jid,
                    msg.message,
                    {
                        messageId:
                            msg.key.id
                    }
                )

                if (options.delay)
                    await delay(
                        options.delay
                    )
            }

            return messages
        }

    conn.sendButton = async function (
        jid,
        text,
        buttons = [],
        quoted,
        options = {}
    ) {
        return await conn.sendMessage(
            jid,
            {
                text,
                buttons,
                ...options
            },
            {
                quoted
            }
        )
    }
    
conn.sendStickerPack = async function (
    jid,
    packName,
    packPublish,
    description,
    pack = [],
    options = {}
) {
    return await createStickerPack(
        conn,
        jid,
        packName,
        packPublish,
        description,
        pack,
        options
    )
}

    conn.sendContact =
        async function (
            jid,
            numbers = [],
            quoted,
            options = {}
        ) {
            const contacts = []

            for (const number of numbers) {
                const phone = number[0]
                const name =
                    number[1] ||
                    phone

                const vcard = [
                    'BEGIN:VCARD',
                    'VERSION:3.0',
                    `FN:${name}`,
                    `TEL;type=CELL;type=VOICE;waid=${phone}:${phone}`,
                    'END:VCARD'
                ].join('\n')

                contacts.push({
                    displayName: name,
                    vcard
                })
            }

            return await conn.sendMessage(
                jid,
                {
                    contacts,
                    ...options
                },
                {
                    quoted
                }
            )
        }

    conn.reply = async function (
        jid,
        text,
        quoted,
        options = {}
    ) {
        return await conn.sendMessage(
            jid,
            {
                text,
                ...options
            },
            {
                quoted
            }
        )
    }

    conn.adReply = async function (
        jid,
        text,
        title = '',
        body = '',
        thumbnail = null,
        sourceUrl = '',
        quoted,
        options = {}
    ) {
        let thumb = thumbnail

        if (
            thumb &&
            !Buffer.isBuffer(thumb)
        ) {
            try {
                thumb =
                    (
                        await conn.getFile(
                            thumb
                        )
                    ).data
            } catch {
                thumb = null
            }
        }

        return await conn.sendMessage(
            jid,
            {
                text,
                contextInfo: {
                    externalAdReply: {
                        title,
                        body,
                        mediaType: 1,
                        thumbnail: thumb,
                        sourceUrl,
                        renderLargerThumbnail:
                            true
                    }
                },
                ...options
            },
            {
                quoted
            }
        )
    }

    conn.cMod = function (
        jid,
        message,
        text = '',
        sender = conn.user?.id,
        options = {}
    ) {
        const copy =
            proto.WebMessageInfo.fromObject(
                message
            )

        if (copy.key) {
            copy.key.remoteJid = jid

            if (copy.key.participant)
                copy.key.participant =
                    sender

            if (copy.key.fromMe)
                copy.key.fromMe =
                    areJidsSameUser(
                        sender,
                        conn.user?.id
                    )
        }

        const msg =
            copy.message

        if (msg) {
            const type =
                Object.keys(msg)[0]

            if (type) {
                if (
                    typeof msg[type] ===
                    'string'
                ) {
                    msg[type] = text
                } else if (
                    msg[type]?.caption
                ) {
                    msg[type].caption =
                        text
                } else if (
                    msg[type]?.text
                ) {
                    msg[type].text =
                        text
                }
            }
        }

        return copy
    }

    conn.copyNForward =
        async function (
            jid,
            message,
            forceForward = false,
            options = {}
        ) {
            const content =
                await generateForwardMessageContent(
                    message,
                    forceForward
                )

            const type =
                Object.keys(content)[0]

            if (
                options.readViewOnce &&
                content?.[type]?.viewOnce
            ) {
                content[type].viewOnce =
                    false
            }

            const msg =
                generateWAMessageFromContent(
                    jid,
                    content,
                    {
                        ...options,
                        userJid:
                            conn.user?.id
                    }
                )

            await conn.relayMessage(
                jid,
                msg.message,
                {
                    messageId:
                        msg.key.id
                }
            )

            return msg
        }

    conn.downloadM =
        async function (
            message,
            type = 'buffer',
            options = {}
        ) {
            const msg =
                message?.message ||
                message

            if (!msg)
                throw new Error(
                    'Message tidak ditemukan'
                )

            const messageType =
                Object.keys(msg)[0]

            if (!messageType)
                throw new Error(
                    'Media tidak ditemukan'
                )

            const media =
                msg[messageType]

            const stream =
                await downloadContentFromMessage(
                    media,
                    messageType.replace(
                        'Message',
                        ''
                    )
                )

            const chunks = []

            for await (
                const chunk of stream
            ) {
                chunks.push(chunk)
            }

            const buffer =
                Buffer.concat(chunks)

            if (type === 'buffer')
                return buffer

            if (type === 'base64')
                return buffer.toString(
                    'base64'
                )

            if (type === 'file') {
                const filename =
                    options.filename ||
                    path.join(
                        process.cwd(),
                        'tmp',
                        `${Date.now()}`
                    )

                await fs.promises.mkdir(
                    path.dirname(filename),
                    {
                        recursive: true
                    }
                )

                await fs.promises.writeFile(
                    filename,
                    buffer
                )

                return filename
            }

            return buffer
        }

    conn.parseMention =
        function (text = '') {
            return [
                ...text.matchAll(
                    /@([0-9]{5,16})/g
                )
            ].map(
                v =>
                    `${v[1]}@s.whatsapp.net`
            )
        }

conn.getName = async (jid) => {
    if (!jid) return ''

    // =========================
    // GROUP
    // =========================
    if (jid.endsWith('@g.us')) {
        try {
            const metadata = await conn.groupMetadata(jid)
            return metadata?.subject || ''
        } catch {
            return conn.store?.chats?.[jid]?.name || ''
        }
    }

    // =========================
    // BOT
    // =========================
    const botJid = conn.user?.id?.split(':')[0] + '@s.whatsapp.net'

    if (
        jid === conn.user?.id ||
        jid === botJid ||
        jid === conn.user?.lid
    ) {
        return (
            conn.user?.name ||
            conn.user?.verifiedName ||
            conn.user?.notify ||
            ''
        )
    }

    // =========================
    // JID -> LID
    // =========================
    let lid = jid

    if (jid.endsWith('@s.whatsapp.net')) {
        try {
            lid = await conn.signalRepository.lidMapping.getLIDForPN(jid)
        } catch {}
    }

    // =========================
    // BOT LID
    // =========================
    if (lid === conn.user?.lid) {
        return (
            conn.user?.name ||
            conn.user?.verifiedName ||
            conn.user?.notify ||
            ''
        )
    }

    // =========================
    // CONTACT LID
    // =========================
    const contact = store.contacts?.[lid]

    if (contact) {
        return (
            contact.notify ||
            contact.name ||
            contact.verifiedName ||
            ''
        )
    }

    // =========================
    // CONTACT JID
    // =========================
    const contactJid = store.contacts?.[jid]

    if (contactJid) {
        return (
            contactJid.notify ||
            contactJid.name ||
            contactJid.verifiedName ||
            ''
        )
    }

    return ''
}
    
    conn.loadMessage =
        async function (
            messageId
        ) {
            try {
                if (
                    typeof conn.store
                        ?.loadMessage ===
                    'function'
                ) {
                    return await conn.store
                        .loadMessage(
                            conn.user?.id,
                            messageId
                        )
                }
            } catch {}

            return null
        }

    conn.sendGroupV4Invite =
        async function (
            jid,
            participant,
            inviteCode,
            inviteExpiration,
            groupName,
            caption = '',
            quoted
        ) {
            return await conn.sendMessage(
                participant,
                {
                    groupInviteMessage: {
                        groupJid: jid,
                        inviteCode,
                        inviteExpiration,
                        groupName,
                        caption
                    }
                },
                {
                    quoted
                }
            )
        }

    conn.insertAllGroup =
        async function (
            groups = []
        ) {
            for (const group of groups) {
                if (!group?.id)
                    continue

                try {
                    await conn.groupMetadata(
                        group.id
                    )
                } catch {}
            }

            return groups
        }

    conn.pushMessage =
        async function (
            jid,
            content,
            options = {}
        ) {
            const message =
                generateWAMessageFromContent(
                    jid,
                    content,
                    {
                        userJid:
                            conn.user?.id,
                        ...options
                    }
                )

            await conn.relayMessage(
                jid,
                message.message,
                {
                    messageId:
                        message.key.id,
                    ...options
                }
            )

            return message
        }

    if (conn.user?.id) {
        conn.user.jid =
            conn.decodeJid(
                conn.user.id
            )
    }

    return conn
}

function getKey(key) {
    return createHash('sha256')
        .update(
            typeof key === 'string'
                ? key
                : JSON.stringify(key)
        )
        .digest('hex')
}

function nullish(value) {
    return (
        value === null ||
        value === undefined
    )
}