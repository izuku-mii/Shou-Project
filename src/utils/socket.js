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

import {
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
} from '../zapo/shim.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

export default async function makeWASocket(connectionOptions, options = {}) {
    const conn = connectionOptions // WaClient zapo yang sudah di-wrap (compat.js)
    
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

conn.fakeMesaage = async function (jid, options = {}) {
   try {
      let targetObj = options.id || options.target || options.msg || options.quoted
      let targetId = null

      if (typeof targetObj === 'string') {
         if (
            targetObj.endsWith('@s.whatsapp.net') ||
            targetObj.endsWith('@lid') ||
            /^\d+$/.test(targetObj)
         ) {
            if (/^\d+$/.test(targetObj)) {
               targetObj = `${targetObj}@s.whatsapp.net`
            }

            const storeInstance = conn.store || stores?.default || stores
            let messages = []

            if (typeof conn.loadMessages === 'function') {
               messages = await conn.loadMessages(jid, 100) || []
            } else if (
               storeInstance &&
               typeof storeInstance.loadMessages === 'function'
            ) {
               messages = await storeInstance.loadMessages(jid, 100) || []
            } else if (
               storeInstance &&
               typeof storeInstance.readJidData === 'function'
            ) {
               messages = storeInstance.readJidData(jid) || []
            }

            if (!Array.isArray(messages) || !messages.length) {
               messages = Object.values(
                  conn.store?.messages || {}
               ).flat()
            }

            if (!Array.isArray(messages)) messages = []

            const targetDecoded = conn.decodeJid
               ? conn.decodeJid(targetObj)
               : targetObj.replace(/:.+@/, '@')

            const targetDigits = targetObj.replace(/\D/g, '')

            const targetMatchSet = new Set([
               targetObj,
               targetDecoded,
               targetDecoded.replace(/:.+@/, '@')
            ])

            if (jid.endsWith('@g.us')) {
               const groupMeta = await (
                  conn.resolveGroupMetadata
                     ? conn.resolveGroupMetadata(jid)
                     : conn.groupMetadata(jid)
               ).catch(() => ({}))

               if (groupMeta?.participants) {
                  const found = groupMeta.participants.find(p => {
                     const pId = p?.id
                        ? conn.decodeJid
                           ? conn.decodeJid(p.id)
                           : p.id.replace(/:.+@/, '@')
                        : ''

                     const pLid = p?.lid
                        ? conn.decodeJid
                           ? conn.decodeJid(p.lid)
                           : p.lid.replace(/:.+@/, '@')
                        : ''

                     const phone = p?.phoneNumber
                        ? String(p.phoneNumber).replace(/\D/g, '')
                        : ''

                     return (
                        pId === targetDecoded ||
                        pLid === targetDecoded ||
                        (
                           targetDigits &&
                           (
                              pId.replace(/\D/g, '') === targetDigits ||
                              pLid.replace(/\D/g, '') === targetDigits ||
                              phone === targetDigits
                           )
                        )
                     )
                  })

                  if (found) {
                     if (found.id) {
                        targetMatchSet.add(found.id)
                        if (conn.decodeJid) {
                           targetMatchSet.add(conn.decodeJid(found.id))
                        }
                     }

                     if (found.lid) {
                        targetMatchSet.add(found.lid)
                        if (conn.decodeJid) {
                           targetMatchSet.add(conn.decodeJid(found.lid))
                        }
                     }

                     if (found.phoneNumber) {
                        const phone = String(found.phoneNumber)
                           .replace(/\D/g, '')

                        if (phone) {
                           targetMatchSet.add(
                              `${phone}@s.whatsapp.net`
                           )
                        }
                     }
                  }
               }
            }

            if (global.db?.users) {
               const dbUsers = Array.isArray(global.db.users)
                  ? global.db.users
                  : (
                     typeof global.db.users.values === 'function'
                        ? Array.from(global.db.users.values())
                        : []
                  )

               const foundUser = dbUsers.find(u => {
                  const uJid = u?.jid
                     ? conn.decodeJid
                        ? conn.decodeJid(u.jid)
                        : u.jid
                     : ''

                  const uLid = u?.lid
                     ? conn.decodeJid
                        ? conn.decodeJid(u.lid)
                        : u.lid
                     : ''

                  return (
                     uJid === targetDecoded ||
                     uLid === targetDecoded ||
                     (
                        targetDigits &&
                        (
                           uJid.replace(/\D/g, '') === targetDigits ||
                           uLid.replace(/\D/g, '') === targetDigits
                        )
                     )
                  )
               })

               if (foundUser) {
                  if (foundUser.jid) {
                     targetMatchSet.add(foundUser.jid)
                     if (conn.decodeJid) {
                        targetMatchSet.add(
                           conn.decodeJid(foundUser.jid)
                        )
                     }
                  }

                  if (foundUser.lid) {
                     targetMatchSet.add(foundUser.lid)
                     if (conn.decodeJid) {
                        targetMatchSet.add(
                           conn.decodeJid(foundUser.lid)
                        )
                     }
                  }
               }
            }

            const targetMsg = messages
               .filter(v => {
                  if (!v?.key) return false

                  const participants = [
                     v.key.participant,
                     v.key.participantAlt,
                     v.participant,
                     v.sender
                  ].filter(Boolean)

                  return participants.some(value => {
                     const raw = String(value)

                     const decoded = conn.decodeJid
                        ? conn.decodeJid(raw)
                        : raw.replace(/:.+@/, '@')

                     const clean = decoded.replace(/:.+@/, '@')
                     const digits = clean.replace(/\D/g, '')

                     return (
                        targetMatchSet.has(raw) ||
                        targetMatchSet.has(decoded) ||
                        targetMatchSet.has(clean) ||
                        (
                           targetDigits &&
                           digits === targetDigits
                        )
                     )
                  })
               })
               .sort(
                  (a, b) =>
                     Number(b?.messageTimestamp || 0) -
                     Number(a?.messageTimestamp || 0)
               )[0]

            if (!targetMsg) {
               throw new Error(
                  `Could not find recent message from specified target user ${targetObj} in store.`
               )
            }

            targetId = targetMsg.key?.id
            targetObj = targetMsg
         } else {
            targetId = targetObj
         }
      } else if (targetObj && typeof targetObj === 'object') {
         targetId =
            targetObj.id ||
            targetObj.key?.id ||
            targetObj.fakeObj?.key?.id
      }

      if (!targetId) {
         throw new Error(
            'Target message ID or user target is required for sendFakeMsg (e.g. { id: target }).'
         )
      }

      const resolveBuffer = async (input) => {
         if (!input) return null

         if (Buffer.isBuffer(input)) return input

         if (typeof input === 'string') {
            if (
               Utils &&
               typeof Utils.fetchAsBuffer === 'function'
            ) {
               return await Utils.fetchAsBuffer(input)
                  .catch(() => null)
            }

            return null
         }

         if (typeof input === 'object' && input.url) {
            const urlStr = input.url

            if (Buffer.isBuffer(urlStr)) return urlStr

            if (
               Utils &&
               typeof Utils.fetchAsBuffer === 'function'
            ) {
               return await Utils.fetchAsBuffer(urlStr)
                  .catch(() => null)
            }

            return null
         }

         return null
      }

      const msgObj =
         options.message &&
         typeof options.message === 'object'
            ? options.message
            : options

      let mediaType = null
      let mediaBuffer = null

      if (msgObj.image || options.image) {
         mediaType = 'image'
         mediaBuffer = await resolveBuffer(
            msgObj.image || options.image
         )
      } else if (msgObj.video || options.video) {
         mediaType = 'video'
         mediaBuffer = await resolveBuffer(
            msgObj.video || options.video
         )
      } else if (msgObj.document || options.document) {
         mediaType = 'document'
         mediaBuffer = await resolveBuffer(
            msgObj.document || options.document
         )
      } else if (msgObj.audio || options.audio) {
         mediaType = 'audio'
         mediaBuffer = await resolveBuffer(
            msgObj.audio || options.audio
         )
      } else if (msgObj.sticker || options.sticker) {
         mediaType = 'sticker'
         mediaBuffer = await resolveBuffer(
            msgObj.sticker || options.sticker
         )
      } else if (
         targetObj &&
         typeof targetObj.download === 'function'
      ) {
         const rawType = (targetObj.mtype || '')
            .replace('Message', '')

         if (
            ['image', 'video', 'document', 'audio', 'sticker']
               .includes(rawType)
         ) {
            mediaType = rawType
            mediaBuffer = await targetObj
               .download()
               .catch(() => null)
         }
      }

      const contentText =
         msgObj.text ||
         msgObj.caption ||
         options.text ||
         options.caption ||
         ''

      const mentionedJids = [
         ...new Set(
            options.mentions ||
            options.mentionedJid ||
            msgObj.mentions ||
            msgObj.mentionedJid ||
            []
         )
      ]

      const isMedia = Boolean(
         mediaType && mediaBuffer
      )

      let placeholderMsg = {}
      let editedMsg = {}

      if (isMedia) {
         placeholderMsg = await generateWAMessageContent(
            {
               [mediaType]: mediaBuffer,
               caption: ''
            },
            {
               upload: conn.waUploadToServer
            }
         )

         editedMsg = await generateWAMessageContent(
            {
               [mediaType]: mediaBuffer,
               caption: contentText
            },
            {
               upload: conn.waUploadToServer
            }
         )

         const pKey =
            Object.keys(placeholderMsg)[0]

         const eKey =
            Object.keys(editedMsg)[0]

         if (placeholderMsg[pKey]) {
            placeholderMsg[pKey].contextInfo = {
               isGroupStatus: true
            }
         }

         if (editedMsg[eKey]) {
            editedMsg[eKey].contextInfo = {
               isGroupStatus: false,
               ...(mentionedJids.length > 0
                  ? {
                     mentionedJid: mentionedJids
                  }
                  : {})
            }
         }
      } else {
         placeholderMsg = {
            extendedTextMessage: {
               text: '',
               contextInfo: {
                  isGroupStatus: true
               }
            }
         }

         editedMsg = {
            extendedTextMessage: {
               text: contentText,
               contextInfo: {
                  isGroupStatus: false,
                  ...(mentionedJids.length > 0
                     ? {
                        mentionedJid: mentionedJids
                     }
                     : {})
               }
            }
         }
      }

      const tempId = await conn.relayMessage(
         jid,
         placeholderMsg,
         {}
      )

      const targetKeyId =
         typeof tempId === 'string'
            ? tempId
            : tempId?.key?.id

      const tempId2 = await conn.relayMessage(
         jid,
         {
            protocolMessage: {
               key: {
                  remoteJid: jid,
                  fromMe: true,
                  id: targetKeyId
               },
               type: 14,
               editedMessage: editedMsg
            }
         },
         {
            messageId: targetId
         }
      )

      if (options.delay !== false) {
         const delayMs =
            typeof options.delay === 'number'
               ? options.delay
               : 200

         await new Promise(res =>
            setTimeout(res, delayMs)
         )
      }

      await Promise.allSettled([
         conn.sendMessage(jid, {
            delete: {
               remoteJid: jid,
               id: targetKeyId,
               fromMe: true
            }
         }),

         conn.sendMessage(jid, {
            delete: {
               remoteJid: jid,
               id: tempId2,
               fromMe: true
            }
         })
      ])

      return {
         status: true,
         targetId,
         tempId: targetKeyId,
         tempId2
      }
   } catch (e) {
      throw e
   }
}
  
    // JANGAN pakai nama `logger`: WaClient zapo memakai this.logger.error/warn/info internal
    conn.log = function (...args) {
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