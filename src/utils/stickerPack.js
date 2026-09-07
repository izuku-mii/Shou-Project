import crypto from 'node:crypto'
import https from 'node:https'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import zlib from 'node:zlib'
import JSZip from 'jszip'
import {
    generateWAMessageFromContent
} from 'baileys'

function toBuffer(value) {
    if (Buffer.isBuffer(value)) return value

    if (
        value &&
        value.type === 'Buffer' &&
        Array.isArray(value.data)
    ) {
        return Buffer.from(value.data)
    }

    if (typeof value === 'string') {
        return Buffer.from(value, 'base64')
    }

    throw new Error('Format buffer tidak dikenali')
}

function sha256(buffer) {
    return crypto
        .createHash('sha256')
        .update(buffer)
        .digest()
}

function toB64Url(buffer) {
    return Buffer.from(buffer)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '')
}

function isWebP(buffer) {
    return (
        buffer.length >= 12 &&
        buffer.toString('ascii', 0, 4) === 'RIFF' &&
        buffer.toString('ascii', 8, 12) === 'WEBP'
    )
}

function isAnimatedWebP(buffer) {
    if (!isWebP(buffer)) return false

    let offset = 12

    while (offset < buffer.length - 8) {
        const chunk = buffer.toString(
            'ascii',
            offset,
            offset + 4
        )

        const size = buffer.readUInt32LE(offset + 4)

        if (
            chunk === 'VP8X' &&
            buffer[offset + 8] & 0x02
        ) {
            return true
        }

        if (
            chunk === 'ANIM' ||
            chunk === 'ANMF'
        ) {
            return true
        }

        offset += 8 + size + (size % 2)
    }

    return false
}

function classifySticker(buffer) {
    // Lottie JSON
    if (buffer[0] === 0x7B) {
        return {
            ext: 'json',
            mimetype: 'application/json',
            isAnimated: true,
            isLottie: true
        }
    }

    return {
        ext: 'webp',
        mimetype: 'image/webp',
        isAnimated: isAnimatedWebP(buffer),
        isLottie: false
    }
}

function fetchUrl(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(
            url,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0'
                }
            },
            res => {
                if (
                    res.statusCode >= 300 &&
                    res.statusCode < 400 &&
                    res.headers.location
                ) {
                    return fetchUrl(res.headers.location)
                        .then(resolve)
                        .catch(reject)
                }

                if (
                    res.statusCode < 200 ||
                    res.statusCode >= 300
                ) {
                    return reject(
                        new Error(
                            `Fetch gagal ${res.statusCode}: ${url}`
                        )
                    )
                }

                const chunks = []

                res.on('data', chunk => {
                    chunks.push(chunk)
                })

                res.on('end', () => {
                    resolve(Buffer.concat(chunks))
                })
            }
        )

        req.on('error', reject)
        req.end()
    })
}

function detectMime(buffer) {
    if (!buffer || buffer.length < 4) {
        return 'application/octet-stream'
    }

    // GZIP / TGS
    if (
        buffer[0] === 0x1F &&
        buffer[1] === 0x8B
    ) {
        try {
            const decompressed = zlib.gunzipSync(buffer)
            return detectMime(decompressed)
        } catch {}
    }

    // JSON / Lottie
    if (buffer[0] === 0x7B) {
        return 'application/json'
    }

    // WebP
    if (isWebP(buffer)) {
        return 'image/webp'
    }

    // JPEG
    if (
        buffer[0] === 0xFF &&
        buffer[1] === 0xD8 &&
        buffer[2] === 0xFF
    ) {
        return 'image/jpeg'
    }

    // PNG
    if (
        buffer[0] === 0x89 &&
        buffer[1] === 0x50 &&
        buffer[2] === 0x4E &&
        buffer[3] === 0x47
    ) {
        return 'image/png'
    }

    // GIF
    if (
        buffer.toString('ascii', 0, 6) === 'GIF87a' ||
        buffer.toString('ascii', 0, 6) === 'GIF89a'
    ) {
        return 'image/gif'
    }

    // MP4 / MOV
    if (
        buffer.length >= 8 &&
        buffer.toString('ascii', 4, 8) === 'ftyp'
    ) {
        return 'video/mp4'
    }

    // WebM
    if (
        buffer[0] === 0x1A &&
        buffer[1] === 0x45 &&
        buffer[2] === 0xDF &&
        buffer[3] === 0xA3
    ) {
        return 'video/webm'
    }

    // 3GP
    if (
        buffer.length >= 12 &&
        /^3g/i.test(
            buffer.toString('ascii', 8, 12)
        )
    ) {
        return 'video/3gpp'
    }

    return 'application/octet-stream'
}

async function videoToAnimatedWebp(
    media,
    mime = 'video/mp4'
) {
    const ff = (
        await import('fluent-ffmpeg')
    ).default

    const ffmpegInstaller = await import(
        '@ffmpeg-installer/ffmpeg'
    )
        .then(m => m.default)
        .catch(() => null)

    if (ffmpegInstaller?.path) {
        ff.setFfmpegPath(ffmpegInstaller.path)
    }

    const tmpDir = os.tmpdir()

    const ext = mime.includes('webm')
        ? '.webm'
        : mime.includes('gif')
            ? '.gif'
            : '.mp4'

    const randomName = () =>
        crypto
            .randomBytes(8)
            .toString('hex')

    const tmpFileIn = path.join(
        tmpDir,
        `${randomName()}${ext}`
    )

    const tmpFileOut = path.join(
        tmpDir,
        `${randomName()}.webp`
    )

    fs.writeFileSync(tmpFileIn, media)

    try {
        await new Promise((resolve, reject) => {
            ff(tmpFileIn)
                .on('error', reject)
                .on('end', resolve)
                .addOutputOptions([
                    '-vcodec',
                    'libwebp',

                    '-vf',
                    'scale=320:320:force_original_aspect_ratio=decrease,fps=15,pad=320:320:-1:-1:color=white@0.0',

                    '-loop',
                    '0',

                    '-ss',
                    '00:00:00',

                    '-t',
                    '00:00:05',

                    '-preset',
                    'default',

                    '-an',

                    '-vsync',
                    '0'
                ])
                .toFormat('webp')
                .save(tmpFileOut)
        })

        return fs.readFileSync(tmpFileOut)
    } finally {
        fs.unlink(tmpFileIn, () => {})
        fs.unlink(tmpFileOut, () => {})
    }
}

async function imageToWebp(buffer) {
    const sharpMod = await import('sharp')
        .catch(() => null)

    if (!sharpMod?.default) {
        throw new Error(
            'Install sharp dulu:\nnpm i sharp'
        )
    }

    return await sharpMod.default(buffer)
        .webp()
        .toBuffer()
}

async function resolveToStickerBuffer(item) {
    if (!item || typeof item !== 'object') {
        throw new Error('Item sticker tidak valid')
    }

    let raw = item.buffer
        ? toBuffer(item.buffer)
        : null

    if (!raw && item.url) {
        raw = await fetchUrl(item.url)
    }

    if (!raw) {
        throw new Error(
            'Item harus punya buffer atau url'
        )
    }

    // GZIP / TGS
    if (
        raw.length >= 2 &&
        raw[0] === 0x1F &&
        raw[1] === 0x8B
    ) {
        try {
            raw = zlib.gunzipSync(raw)
        } catch {}
    }

    const mime = detectMime(raw)

    // WebP / Lottie
    if (
        mime === 'image/webp' ||
        mime === 'application/json'
    ) {
        return {
            buffer: raw,
            mime
        }
    }

    // Image
    if (mime.startsWith('image/')) {
        return {
            buffer: await imageToWebp(raw),
            mime: 'image/webp'
        }
    }

    // Video
    if (mime.startsWith('video/')) {
        return {
            buffer: await videoToAnimatedWebp(
                raw,
                mime
            ),
            mime: 'image/webp'
        }
    }

    throw new Error(
        `Tipe media tidak didukung: ${mime}`
    )
}

async function makeTrayWebp(buffer) {
    const sharpMod = await import('sharp')
        .catch(() => null)

    if (!sharpMod?.default) {
        throw new Error(
            'Install sharp dulu:\nnpm i sharp'
        )
    }

    return await sharpMod.default(buffer)
        .resize(252, 252, {
            fit: 'cover'
        })
        .webp()
        .toBuffer()
}

async function makeBlankTrayWebp() {
    const sharpMod = await import('sharp')
        .catch(() => null)

    if (!sharpMod?.default) {
        throw new Error(
            'Install sharp dulu:\nnpm i sharp'
        )
    }

    return await sharpMod.default({
        create: {
            width: 252,
            height: 252,
            channels: 4,
            background: {
                r: 0,
                g: 0,
                b: 0,
                alpha: 0
            }
        }
    })
        .webp()
        .toBuffer()
}

async function makeThumbnailJpeg(buffer) {
    const sharpMod = await import('sharp')
        .catch(() => null)

    if (!sharpMod?.default) {
        throw new Error(
            'Install sharp dulu:\nnpm i sharp'
        )
    }

    return await sharpMod.default(buffer)
        .resize(252, 252, {
            fit: 'cover'
        })
        .jpeg()
        .toBuffer()
}

async function uploadToServer(
    client,
    buffer,
    {
        hkdf,
        mediaPath,
        mediaKey = crypto.randomBytes(32)
    }
) {
    const expanded = Buffer.from(
        crypto.hkdfSync(
            'sha256',
            mediaKey,
            Buffer.alloc(32),
            Buffer.from(hkdf),
            112
        )
    )

    const iv = expanded.subarray(0, 16)
    const cipherKey = expanded.subarray(16, 48)
    const macKey = expanded.subarray(48, 80)

    const cipher = crypto.createCipheriv(
        'aes-256-cbc',
        cipherKey,
        iv
    )

    const encrypted = Buffer.concat([
        cipher.update(buffer),
        cipher.final()
    ])

    const mac = crypto
        .createHmac('sha256', macKey)
        .update(iv)
        .update(encrypted)
        .digest()
        .subarray(0, 10)

    const encBuffer = Buffer.concat([
        encrypted,
        mac
    ])

    const fileSha256 = sha256(buffer)
    const fileEncSha256 = sha256(encBuffer)

    const iq = await client.query({
        tag: 'iq',
        attrs: {
            id:
                client.generateMessageTag?.() ??
                Date.now().toString(),

            to: 's.whatsapp.net',

            type: 'set',

            xmlns: 'w:m'
        },

        content: [
            {
                tag: 'media_conn',
                attrs: {}
            }
        ]
    })

    const mediaConn =
        iq.content?.find(
            v => v.tag === 'media_conn'
        )

    if (!mediaConn) {
        throw new Error(
            'media_conn tidak ditemukan'
        )
    }

    const auth = mediaConn.attrs?.auth

    if (!auth) {
        throw new Error(
            'auth media_conn tidak ditemukan'
        )
    }

    const hosts = (mediaConn.content || [])
        .filter(v => v.tag === 'host')
        .map(v => v.attrs?.hostname)
        .filter(Boolean)

    if (!hosts.length) {
        throw new Error(
            'host upload tidak ditemukan'
        )
    }

    const token = encodeURIComponent(
        fileEncSha256
            .toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/g, '')
    )

    let lastError

    for (const host of hosts) {
        try {
            const json = await new Promise(
                (resolve, reject) => {
                    const url = new URL(
                        `https://${host}${mediaPath}/${token}?auth=${encodeURIComponent(auth)}&token=${token}`
                    )

                    const req = https.request(
                        {
                            hostname:
                                url.hostname,

                            port: 443,

                            path:
                                url.pathname +
                                url.search,

                            method: 'POST',

                            headers: {
                                Origin:
                                    'https://web.whatsapp.com',

                                Referer:
                                    'https://web.whatsapp.com/',

                                'Content-Type':
                                    'application/octet-stream',

                                'Content-Length':
                                    encBuffer.length
                            }
                        },

                        res => {
                            let body = ''

                            res.on(
                                'data',
                                c => {
                                    body += c
                                }
                            )

                            res.on(
                                'end',
                                () => {
                                    if (
                                        res.statusCode <
                                            200 ||
                                        res.statusCode >=
                                            300
                                    ) {
                                        return reject(
                                            new Error(
                                                `Upload gagal ${res.statusCode}: ${body}`
                                            )
                                        )
                                    }

                                    try {
                                        resolve(
                                            JSON.parse(
                                                body
                                            )
                                        )
                                    } catch {
                                        reject(
                                            new Error(
                                                `Response bukan JSON: ${body}`
                                            )
                                        )
                                    }
                                }
                            )
                        }
                    )

                    req.on(
                        'error',
                        reject
                    )

                    req.write(encBuffer)
                    req.end()
                }
            )

            const directPath =
                json.direct_path ??
                json.directPath ??
                json.url ??
                json.path

            if (!directPath) {
                throw new Error(
                    'directPath tidak ditemukan'
                )
            }

            return {
                mediaKey,
                fileLength: buffer.length,
                fileSha256,
                fileEncSha256,
                directPath,
                ...json
            }
        } catch (error) {
            lastError = error
        }
    }

    throw (
        lastError ??
        new Error(
            'Semua host upload gagal'
        )
    )
}

/*
 * FIX:
 * Jangan:
 * const sendStickerPack = async (...) {
 *
 * Gunakan arrow function:
 */
const sendStickerPack = async (
    client,
    jid,
    name,
    publisher,
    packDescription,
    pack,
    options = {}
) => {
    if (!client) {
        throw new Error(
            'client WhatsApp tidak ditemukan'
        )
    }

    if (!jid) {
        throw new Error('jid wajib diisi')
    }

    if (!Array.isArray(pack)) {
        throw new Error(
            'pack harus berupa array'
        )
    }

    if (!pack.length) {
        throw new Error(
            'Sticker pack kosong'
        )
    }

    const zip = new JSZip()

    const stickersMetadata = []

    const hydratedResults =
        await Promise.allSettled(
            pack.map(async item => {
                const {
                    buffer
                } =
                    await resolveToStickerBuffer(
                        item
                    )

                const classified =
                    classifySticker(buffer)

                return {
                    buffer,

                    ext:
                        classified.ext,

                    mimetype:
                        classified.mimetype,

                    isAnimated:
                        classified.isAnimated,

                    isLottie:
                        classified.isLottie
                }
            })
        )

    const failed =
        hydratedResults.filter(
            r => r.status === 'rejected'
        )

    if (failed.length) {
        console.warn(
            `[StickerPack] ${failed.length} sticker gagal diproses`
        )

        for (const error of failed) {
            console.warn(
                error.reason?.message ??
                error.reason
            )
        }
    }

    const hydrated =
        hydratedResults
            .filter(
                r =>
                    r.status ===
                        'fulfilled' &&
                    r.value
            )
            .map(r => r.value)

    if (!hydrated.length) {
        throw new Error(
            'Gagal memproses seluruh item sticker.'
        )
    }

    for (const item of hydrated) {
        const fileName =
            `${toB64Url(
                sha256(item.buffer)
            )}.${item.ext}`

        zip.file(
            fileName,
            item.buffer
        )

        stickersMetadata.push({
            fileName,

            isAnimated:
                item.isAnimated,

            emojis: [''],

            accessibilityLabel: '',

            isLottie:
                item.isLottie,

            mimetype:
                item.mimetype
        })
    }

    const trayIconFileName =
        'tray_icon.webp'

    const traySource =
        hydrated.find(
            v => !v.isLottie
        )?.buffer

    const trayBuffer =
        traySource
            ? await makeTrayWebp(
                  traySource
              )
            : await makeBlankTrayWebp()

    zip.file(
        trayIconFileName,
        trayBuffer
    )

    const archive =
        await zip.generateAsync({
            type: 'nodebuffer',
            compression: 'STORE'
        })

    const packUpload =
        await uploadToServer(
            client,
            archive,
            {
                hkdf:
                    'WhatsApp Sticker Pack Keys',

                mediaPath:
                    '/mms/sticker-pack'
            }
        )

    const thumbnailBuffer =
        await makeThumbnailJpeg(
            trayBuffer
        )

    /*
     * Thumbnail pakai mediaKey sendiri.
     * Jangan reuse mediaKey pack.
     */
    const thumbUpload =
        await uploadToServer(
            client,
            thumbnailBuffer,
            {
                hkdf:
                    'WhatsApp Sticker Pack Thumbnail Keys',

                mediaPath:
                    '/mms/thumbnail-sticker-pack'
            }
        )

    const stickerPackMessage = {
        stickerPackId:
            'Pack_' +
            crypto
                .randomBytes(8)
                .toString('hex'),

        name,

        publisher,

        packDescription,

        stickers:
            stickersMetadata,

        fileLength:
            packUpload.fileLength,

        fileSha256:
            packUpload.fileSha256,

        fileEncSha256:
            packUpload.fileEncSha256,

        mediaKey:
            packUpload.mediaKey,

        directPath:
            packUpload.directPath,

        mediaKeyTimestamp:
            Math.floor(
                Date.now() / 1000
            ),

        stickerPackSize:
            packUpload.fileLength,

        stickerPackOrigin: 2,

        trayIconFileName,

        thumbnailDirectPath:
            thumbUpload.directPath,

        thumbnailSha256:
            thumbUpload.fileSha256,

        thumbnailEncSha256:
            thumbUpload.fileEncSha256,

        thumbnailHeight: 252,

        thumbnailWidth: 252,

        imageDataHash:
            thumbUpload.fileSha256
                .toString('base64')
    }

    const fullMsg =
        await generateWAMessageFromContent(
            jid,
            {
                messageContextInfo: {
                    messageSecret:
                        crypto.randomBytes(
                            32
                        )
                },

                stickerPackMessage
            },
            {
                userJid:
                    client.user.id,

                ...(options.quoted
                    ? {
                          quoted:
                              options.quoted
                      }
                    : {})
            }
        )

    await client.relayMessage(
        jid,
        fullMsg.message,
        {
            messageId:
                fullMsg.key.id
        }
    )

    return fullMsg
}

export {
    sendStickerPack
}