// Pelacak media/album sendiri (tidak tergantung store.messages).
// - Disimpan di memori + SQLite (global.db.sqlite) supaya tetap ada setelah bot restart.
// - Album dikelompokkan lewat messageAssociation (parent) atau jendela waktu per pengirim.

const mem = new Map()          // chat -> rows[]
const MAX_PER_CHAT = 200
const WINDOW_MS = 45_000       // batas jarak antar media dalam 1 album (fallback)
const KEEP_MS = 3 * 24 * 3600 * 1000
let ready = false

const sql = () => global.db?.sqlite

function ensure() {
  if (ready) return true
  try {
    sql()?.exec('CREATE TABLE IF NOT EXISTS album_media (id TEXT PRIMARY KEY, chat TEXT, sender TEXT, parent TEXT, ts INTEGER, data TEXT)')
    sql()?.exec('CREATE INDEX IF NOT EXISTS album_media_chat ON album_media (chat, ts)')
    sql()?.prepare('DELETE FROM album_media WHERE ts < ?').run(Date.now() - KEEP_MS)
    ready = Boolean(sql())
  } catch {}
  return ready
}

const replacer = (k, v) => {
  if (k === 'jpegThumbnail') return undefined
  if (v instanceof Uint8Array && !Buffer.isBuffer(v)) return { __b64: Buffer.from(v).toString('base64') }
  if (v && v.type === 'Buffer' && Array.isArray(v.data)) return { __b64: Buffer.from(v.data).toString('base64') }
  return v
}
const reviver = (k, v) => (v && typeof v === 'object' && typeof v.__b64 === 'string' ? Buffer.from(v.__b64, 'base64') : v)

function unwrap(msg) {
  let m = msg
  for (let i = 0; i < 4 && m; i++) {
    const n = m.viewOnceMessage?.message || m.viewOnceMessageV2?.message || m.viewOnceMessageV2Extension?.message ||
      m.ephemeralMessage?.message || m.documentWithCaptionMessage?.message
    if (!n) break
    m = n
  }
  return m
}

export function pickMedia(message) {
  const raw = unwrap(message)
  if (!raw) return null
  if (raw.imageMessage) return { type: 'image', msg: { imageMessage: raw.imageMessage }, raw }
  if (raw.videoMessage) return { type: 'video', msg: { videoMessage: raw.videoMessage }, raw }
  return null
}

/** Panggil untuk setiap pesan masuk. */
export function trackMedia(waMsg) {
  try {
    const key = waMsg?.key
    if (!key?.id || !waMsg.message) return
    const media = pickMedia(waMsg.message)
    if (!media) return

    const sub = media.msg.imageMessage || media.msg.videoMessage
    const assoc = media.raw.messageContextInfo?.messageAssociation ||
      waMsg.message.messageContextInfo?.messageAssociation ||
      sub?.contextInfo?.messageAssociation
    const parent = assoc?.parentMessageKey?.id || ''

    const row = {
      id: key.id,
      chat: key.remoteJid,
      sender: key.participant || key.remoteJid,
      parent,
      ts: Date.now(),
      type: media.type,
      msg: media.msg
    }

    const list = mem.get(row.chat) || []
    if (list.some(r => r.id === row.id)) return
    list.push(row)
    if (list.length > MAX_PER_CHAT) list.splice(0, list.length - MAX_PER_CHAT)
    mem.set(row.chat, list)

    if (ensure()) {
      sql().prepare('INSERT OR REPLACE INTO album_media (id, chat, sender, parent, ts, data) VALUES (?,?,?,?,?,?)')
        .run(row.id, row.chat, row.sender, row.parent, row.ts, JSON.stringify({ type: row.type, msg: row.msg }, replacer))
    }
  } catch (e) {
    console.error('[albumStore] track', e?.message || e)
  }
}

function loadChat(chat) {
  const list = [...(mem.get(chat) || [])]
  if (!ensure()) return list
  try {
    const have = new Set(list.map(r => r.id))
    const rows = sql().prepare('SELECT * FROM album_media WHERE chat = ? ORDER BY ts DESC LIMIT 300').all(chat)
    for (const r of rows) {
      if (have.has(r.id)) continue
      try {
        const d = JSON.parse(r.data, reviver)
        list.push({ id: r.id, chat: r.chat, sender: r.sender, parent: r.parent, ts: r.ts, type: d.type, msg: d.msg })
      } catch {}
    }
  } catch {}
  return list
}

/**
 * Ambil media satu album berdasarkan id pesan yang di-reply.
 * Return { items: [{id,type,msg}], exact: boolean }
 */
export function getAlbum(chat, quotedId, quotedMessage) {
  const rows = loadChat(chat).sort((a, b) => a.ts - b.ts)
  const hit = rows.find(r => r.id === quotedId) || rows.find(r => r.parent === quotedId)

  let group = []
  if (hit) {
    const parent = hit.parent || (rows.some(r => r.parent === quotedId) ? quotedId : '')
    if (parent) group = rows.filter(r => r.parent === parent || r.id === parent)
    if (group.length < 2) {
      group = rows.filter(r => r.sender === hit.sender && (!r.parent || r.parent === hit.parent) && Math.abs(r.ts - hit.ts) <= WINDOW_MS)
      // rapikan: ambil rangkaian yang nyambung (jarak antar media <= WINDOW_MS) di sekitar hit
      const idx = group.findIndex(r => r.id === hit.id)
      let s = idx, e = idx
      while (s > 0 && group[s].ts - group[s - 1].ts <= 15_000) s--
      while (e < group.length - 1 && group[e + 1].ts - group[e].ts <= 15_000) e++
      group = group.slice(s, e + 1)
    }
    if (group.length) return { items: group.slice(0, 30), exact: true }
  }

  // album tidak tercatat: minimal pakai media dari pesan yang di-reply itu sendiri
  const single = pickMedia(quotedMessage)
  if (single) return { items: [{ id: quotedId, type: single.type, msg: single.msg }], exact: false }
  return { items: [], exact: false }
}
