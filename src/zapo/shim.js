// Pengganti helper 'baileys' di atas zapo-js.
// Semua file lama yang tadinya `from 'baileys'` sekarang impor dari sini.
import crypto from 'node:crypto'
import { Readable } from 'node:stream'
import { proto, downloadMediaMessage as zapoDownload } from 'zapo-js'

export { proto }

export const delay = (ms) => new Promise((r) => setTimeout(r, ms))

/* ───────── JID ───────── */
export function jidDecode(jid) {
  if (!jid || typeof jid !== 'string' || !jid.includes('@')) return undefined
  const [left, server] = jid.split('@')
  const [userAgent, device] = left.split(':')
  const [user, agent] = userAgent.split('_')
  return { server, user, agent: agent ? +agent : undefined, device: device ? +device : undefined }
}

export function jidNormalizedUser(jid = '') {
  const d = jidDecode(jid)
  if (!d) return jid || ''
  const server = d.server === 'c.us' ? 's.whatsapp.net' : d.server
  return `${d.user}@${server}`
}

export const areJidsSameUser = (a, b) => jidNormalizedUser(a) === jidNormalizedUser(b)

// String.prototype.decodeJid dipakai beberapa plugin lama
if (!String.prototype.decodeJid) {
  Object.defineProperty(String.prototype, 'decodeJid', {
    value() { return jidNormalizedUser(String(this)) },
    configurable: true
  })
}

/* ───────── message helpers ───────── */
const SKIP = new Set(['senderKeyDistributionMessage', 'messageContextInfo'])

export function getContentType(content) {
  if (!content || typeof content !== 'object') return undefined
  return Object.keys(content).find(
    (k) => !SKIP.has(k) && content[k] != null && (k === 'conversation' || k.endsWith('Message') || k.endsWith('MessageV2') || k.endsWith('V2'))
  )
}

export function generateMessageIDV2(userJid = '') {
  return '3EB0' + crypto.randomBytes(14).toString('hex').toUpperCase()
}

export function generateWAMessageFromContent(jid, content, options = {}) {
  let message = content
  if (options.quoted?.key && options.quoted?.message) {
    const type = getContentType(message)
    if (type && message[type] && typeof message[type] === 'object') {
      message = {
        ...message,
        [type]: {
          ...message[type],
          contextInfo: {
            ...(message[type].contextInfo || {}),
            stanzaId: options.quoted.key.id,
            participant: options.quoted.key.participant || options.quoted.key.remoteJid,
            quotedMessage: options.quoted.message
          }
        }
      }
    }
  }
  return {
    key: {
      remoteJid: jid,
      fromMe: true,
      id: options.messageId || generateMessageIDV2(options.userJid)
    },
    message,
    messageTimestamp: Math.floor(Date.now() / 1000),
    status: 1
  }
}

export const generateWAMessage = async (jid, content, options = {}) =>
  generateWAMessageFromContent(jid, content, options)

export const generateForwardMessageContent = (message, forceForward = false) => {
  const content = message?.message ?? message
  const type = getContentType(content)
  if (!type) return content
  return {
    [type]: {
      ...content[type],
      contextInfo: { ...(content[type]?.contextInfo || {}), isForwarded: true, forwardingScore: forceForward ? 1 : 0 }
    }
  }
}

/* ───────── media ───────── */
async function toBuffer(src) {
  if (!src) return null
  if (Buffer.isBuffer(src) || src instanceof Uint8Array) return Buffer.from(src)
  const url = src.url ?? src
  if (typeof url === 'string' && /^https?:\/\//.test(url)) {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Gagal download media: ${res.status}`)
    return Buffer.from(await res.arrayBuffer())
  }
  if (typeof url === 'string') return (await import('node:fs/promises')).readFile(url)
  if (url instanceof Readable) {
    const chunks = []
    for await (const c of url) chunks.push(c)
    return Buffer.concat(chunks)
  }
  throw new Error('Sumber media tidak dikenali')
}
export { toBuffer as mediaToBuffer }

export async function streamToBuffer(stream) {
  const chunks = []
  for await (const c of stream) chunks.push(Buffer.from(c))
  return Buffer.concat(chunks)
}

const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker']

export async function downloadContentFromMessage(message, type) {
  return zapoDownload({ [`${type}Message`]: message })
}

export async function downloadMediaMessage(m, type = 'buffer') {
  const stream = await zapoDownload(m?.message ?? m)
  return type === 'stream' ? stream : streamToBuffer(stream)
}

// prepareWAMessageMedia: upload lewat client zapo (global.conn diisi saat boot)
export async function prepareWAMessageMedia(content = {}) {
  const conn = global.conn
  if (!conn) throw new Error('conn belum siap')
  const kind = MEDIA_TYPES.find((k) => content[k])
  if (!kind) throw new Error('prepareWAMessageMedia: tipe media tidak ditemukan')
  const buf = await toBuffer(content[kind])
  const mimetype =
    content.mimetype ||
    (kind === 'image' ? 'image/jpeg' : kind === 'video' ? 'video/mp4' : kind === 'audio' ? 'audio/mpeg' : kind === 'sticker' ? 'image/webp' : 'application/octet-stream')
  const up = await conn.message.upload(buf, { type: kind, mimetype })
  const base = {
    url: up.url,
    directPath: up.directPath,
    mediaKey: up.mediaKey,
    fileSha256: up.fileSha256,
    fileEncSha256: up.fileEncSha256,
    fileLength: up.fileLength,
    mediaKeyTimestamp: up.mediaKeyTimestamp,
    mimetype
  }
  const extra = {}
  if (content.caption) extra.caption = content.caption
  if (content.fileName) extra.fileName = content.fileName
  if (content.ptt) extra.ptt = true
  if (content.gifPlayback) extra.gifPlayback = true
  return { [`${kind}Message`]: { ...base, ...extra } }
}

/* ───────── stub ───────── */
export const WAMessageStubType = proto?.WebMessageInfo?.StubType ?? {}
export const getBinaryNodeChild = () => undefined
