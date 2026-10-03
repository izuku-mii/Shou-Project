// Identitas owner: JID (nomor) <-> LID, nomor Malaysia/Peru, dan sinkron ke db.
//
// OWNER di .env (format lama tetap jalan):
//   [["6283136099660","Shou-1",true], ["60123456789","Shou-4",true,"123456789012345@lid"]]
//   elemen ke-4 (opsional) = LID owner itu.
// OWNER_LID di .env (opsional, alternatif): {"60123456789":"123456789012345@lid"}

const PN = '@s.whatsapp.net'
const LID = '@lid'

const pnToLid = new Map() // "60123456789" -> "123456789012345@lid"
const lidToPn = new Map() // "123456789012345@lid" -> "60123456789"

const digits = (v = '') => String(v).split('@')[0].split(':')[0].replace(/\D/g, '')

export const isLid = (j = '') => String(j).endsWith(LID)
export const isPn = (j = '') => String(j).endsWith(PN)

export function cleanJid(j = '') {
  const s = String(j || '').trim()
  if (!s.includes('@')) return s
  const [user, server] = s.split('@')
  return `${user.split(':')[0]}@${server}`
}

/**
 * Normalisasi nomor ke format internasional tanpa +.
 * - Malaysia (60): buang 0 trunk -> 6001x => 601x, lokal 01x => 601x
 * - Peru (51): lokal 9 digit berawalan 9 => 519xxxxxxxx
 */
export function normalizeNumber(v = '') {
  let n = digits(v)
  if (!n) return ''
  if (n.startsWith('00')) n = n.slice(2)
  if (n.startsWith('600')) n = '60' + n.slice(3)
  else if (/^01\d{8,9}$/.test(n)) n = '60' + n.slice(1)
  else if (/^9\d{8}$/.test(n)) n = '51' + n
  return n
}

/* ───────── owner list ───────── */
export function getOwners() {
  let raw = []
  try { raw = JSON.parse(process.env.OWNER || '[]') } catch { raw = [] }
  let extra = {}
  try { extra = JSON.parse(process.env.OWNER_LID || '{}') } catch { extra = {} }

  const out = []
  for (const o of Array.isArray(raw) ? raw : []) {
    if (!Array.isArray(o) || o[2] !== true) continue
    const number = normalizeNumber(o[0])
    if (!number) continue
    const lid = o[3] || extra[number] || extra[o[0]] || pnToLid.get(number) || ''
    out.push({ number, name: String(o[1] || number), lid: lid ? cleanJid(lid) : '' })
  }
  return out
}

/* ───────── mapping JID <-> LID ───────── */
export function bind(pn, lid) {
  const n = normalizeNumber(pn)
  const l = cleanJid(lid)
  if (!n || !l || !isLid(l)) return false
  pnToLid.set(n, l)
  lidToPn.set(l, n)
  syncDb(n, l)
  return true
}

export function toLid(jidOrNumber, conn) {
  const n = normalizeNumber(jidOrNumber)
  if (!n) return ''
  const hit = pnToLid.get(n)
  if (hit) return hit
  try {
    const r = conn?.getLid?.(`${n}${PN}`)
    if (r && typeof r === 'string' && isLid(r)) { bind(n, r); return cleanJid(r) }
  } catch {}
  return ''
}

export function toJid(jid, conn) {
  const c = cleanJid(jid)
  if (!c) return ''
  if (!isLid(c)) return c
  const n = lidToPn.get(c)
  if (n) return n + PN
  try {
    const r = conn?.getJid?.(c)
    if (r && !isLid(r)) return cleanJid(r)
  } catch {}
  return c
}

/** Belajar pasangan JID/LID dari key pesan (participant + participantAlt, dst). */
export function learn(m) {
  try {
    const k = m?.key || {}
    const pairs = [
      [k.participant, k.participantAlt],
      [k.remoteJid, k.remoteJidAlt]
    ]
    for (const [a, b] of pairs) {
      if (!a || !b) continue
      if (isPn(a) && isLid(b)) bind(a, b)
      else if (isLid(a) && isPn(b)) bind(b, a)
    }
  } catch {}
}

/* ───────── cek owner ───────── */
export function ownerEntry(m, conn) {
  const k = m?.key || {}
  const cands = [m?.sender, m?.senderAlt, k.participant, k.participantAlt, k.remoteJid, k.remoteJidAlt]
    .filter(Boolean)
    .map(cleanJid)
    .filter(j => !j.endsWith('@g.us') && !j.endsWith('@broadcast') && !j.endsWith('@newsletter'))
  if (!cands.length) return null

  const owners = getOwners()
  if (!owners.length) return null

  for (const c of cands) {
    if (isLid(c)) {
      const mapped = lidToPn.get(c)
      for (const o of owners) {
        if (o.lid && o.lid === c) return o
        if (mapped && mapped === o.number) return o
      }
    } else {
      const n = normalizeNumber(c)
      for (const o of owners) if (o.number === n) return o
    }
  }
  return null
}

export function isOwnerMsg(m, conn) {
  learn(m)
  const o = ownerEntry(m, conn)
  if (o) {
    // owner terdeteksi lewat salah satu jalur -> pastikan pasangan JID/LID tersimpan
    const k = m?.key || {}
    for (const j of [k.participant, k.remoteJid, k.participantAlt, k.remoteJidAlt]) {
      if (j && isLid(j) && !pnToLid.has(o.number)) bind(o.number, j)
    }
  }
  return Boolean(o)
}

/* ───────── sinkron ke db (username + main db) ───────── */
const NUMERIC_MERGE = ['exp', 'level', 'limit', 'money', 'bank', 'kills', 'wins']

function syncDb(n, lid) {
  try {
    const users = global.db?.data?.users
    if (!users) return
    const pn = n + PN
    const owner = getOwners().find(o => o.number === n)

    // user yang terlanjur dibuat dengan key LID -> gabungkan ke key nomor
    const dup = Object.prototype.hasOwnProperty.call(users, lid) ? users[lid] : undefined
    if (dup && !users[pn]) {
      users[pn] = JSON.parse(JSON.stringify(dup))
    } else if (dup && users[pn]) {
      for (const k of Object.keys(dup)) {
        if (users[pn][k] === undefined) users[pn][k] = dup[k]
        else if (NUMERIC_MERGE.includes(k)) users[pn][k] = Math.max(Number(users[pn][k]) || 0, Number(dup[k]) || 0)
      }
    }
    if (dup) delete users[lid]

    if (users[pn]) {
      users[pn].lid = lid
      if (owner) applyUsername(users[pn], owner, pn)
    }
  } catch (e) {
    console.error('[identity] syncDb', e?.message || e)
  }
}

function applyUsername(u, owner, pn) {
  if (u.name !== owner.name) u.name = owner.name
  if (u.username !== owner.name) u.username = owner.name
  if (u.id !== pn) u.id = pn
  if (u.registered !== true) u.registered = true
  if (!(u.regTime > 0)) u.regTime = Date.now()
  if (!(u.age > 0)) u.age = 17
  if (u.banned) u.banned = false
}

/** Panggil sekali setelah db siap: bikin entri db owner (key nomor) + isi LID dari env. */
export function ensureOwnerDb() {
  try {
    const users = global.db?.data?.users
    if (!users) return

    // pulihkan mapping dari db (users[x].lid)
    for (const [id, u] of Object.entries(users)) {
      if (u?.lid && isPn(id)) {
        const n = normalizeNumber(id)
        pnToLid.set(n, u.lid)
        lidToPn.set(u.lid, n)
      }
    }

    for (const o of getOwners()) {
      const pn = o.number + PN
      if (!users[pn]) {
        users[pn] = {
          id: pn, name: o.name, username: o.name, registered: true,
          regTime: Date.now(), age: 17, limit: 9999, exp: 0, level: 1
        }
      }
      applyUsername(users[pn], o, pn)
      if (o.lid) bind(o.number, o.lid)
      else if (users[pn].lid) bind(o.number, users[pn].lid)
    }
  } catch (e) {
    console.error('[identity] ensureOwnerDb', e?.message || e)
  }
}

export default { normalizeNumber, getOwners, bind, toLid, toJid, learn, ownerEntry, isOwnerMsg, ensureOwnerDb, cleanJid, isLid, isPn }
