// Membungkus WaClient (zapo-js) supaya punya API ala Baileys
// (sendMessage, groupMetadata, decodeJid, dst) → plugin lama tetap jalan.
import { jidNormalizedUser, mediaToBuffer, delay } from './shim.js'
import { bind as bindLid } from '../utils/identity.js'

const SEND_GAP_MS = 300
const GROUP_TTL_MS = 60_000

/* ───────── id pesan yang dikirim bot (supaya echo fromMe tidak diproses ulang) ───────── */
const sentIds = new Set()
const rememberSent = (id) => {
  if (!id) return
  sentIds.add(id)
  if (sentIds.size > 3000) sentIds.delete(sentIds.values().next().value)
}
export const isBotSent = (id) => sentIds.has(id)

/* ───────── helpers ───────── */
const isUrl = (s) => typeof s === 'string' && /^https?:\/\//i.test(s)

async function resolveMedia(src) {
  if (!src) throw new Error('media kosong')
  if (Buffer.isBuffer(src) || src instanceof Uint8Array) return src
  const v = src.url ?? src
  if (isUrl(v)) return mediaToBuffer(v)
  if (typeof v === 'string') return v // path lokal → zapo yang stream
  return mediaToBuffer(src)
}

const RAW_KEYS = [
  'conversation', 'extendedTextMessage', 'imageMessage', 'videoMessage', 'audioMessage',
  'documentMessage', 'stickerMessage', 'locationMessage', 'contactMessage', 'contactsArrayMessage',
  'interactiveMessage', 'buttonsMessage', 'listMessage', 'templateMessage', 'viewOnceMessage',
  'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage', 'albumMessage',
  'groupInviteMessage', 'productMessage', 'orderMessage', 'pollCreationMessage', 'botInvokeMessage',
  'ephemeralMessage', 'protocolMessage', 'interactiveResponseMessage', 'stickerPackMessage'
]
const isRawProto = (c) => c && typeof c === 'object' && RAW_KEYS.some((k) => c[k] != null)

/** Baileys content → { content, options } untuk client.message.send */
export async function translateContent(content, options = {}) {
  const opts = {}
  const c = content || {}

  const mentions = c.mentions || options.mentions || c.contextInfo?.mentionedJid
  if (mentions?.length) opts.mentions = mentions
  if (options.quoted) opts.quote = options.quoted
  if (options.messageId || options.id) opts.id = options.messageId || options.id
  if (options.ephemeralExpiration) opts.expirationSeconds = options.ephemeralExpiration
  if (c.viewOnce || options.viewOnce) opts.viewOnce = true
  if (c.contextInfo?.isForwarded || options.forward) opts.forward = true

  if (typeof content === 'string') return { content, options: opts }

  if (c.delete) return { content: { type: 'revoke', target: c.delete }, options: opts }
  if (c.react) {
    return { content: { type: 'reaction', emoji: c.react.text ?? '', target: c.react.key }, options: opts }
  }
  if (c.edit) {
    opts.editKey = c.edit
    return { content: c.text ?? '', options: opts }
  }
  if (c.poll) {
    const p = c.poll
    return {
      content: {
        type: 'poll',
        name: p.name,
        options: p.values || p.options || [],
        selectableCount: p.selectableCount ?? 1
      },
      options: opts
    }
  }
  if (c.location) {
    return {
      content: {
        locationMessage: {
          degreesLatitude: c.location.degreesLatitude,
          degreesLongitude: c.location.degreesLongitude,
          name: c.location.name,
          address: c.location.address
        }
      },
      options: opts
    }
  }
  if (c.contacts) {
    const list = c.contacts.contacts || []
    if (list.length === 1) {
      return {
        content: { contactMessage: { displayName: list[0].displayName || c.contacts.displayName, vcard: list[0].vcard } },
        options: opts
      }
    }
    return {
      content: {
        contactsArrayMessage: {
          displayName: c.contacts.displayName,
          contacts: list.map((x) => ({ displayName: x.displayName, vcard: x.vcard }))
        }
      },
      options: opts
    }
  }

  if (c.sticker) {
    return { content: { type: 'sticker', media: await resolveMedia(c.sticker), mimetype: c.mimetype || 'image/webp' }, options: opts }
  }
  if (c.image) {
    return {
      content: { type: 'image', media: await resolveMedia(c.image), mimetype: c.mimetype || 'image/jpeg', caption: c.caption },
      options: opts
    }
  }
  if (c.video) {
    return {
      content: {
        type: 'video',
        media: await resolveMedia(c.video),
        mimetype: c.mimetype || 'video/mp4',
        caption: c.caption,
        gifPlayback: Boolean(c.gifPlayback)
      },
      options: opts
    }
  }
  if (c.audio) {
    return {
      content: {
        type: 'audio',
        media: await resolveMedia(c.audio),
        mimetype: c.mimetype || (c.ptt ? 'audio/ogg; codecs=opus' : 'audio/mpeg'),
        ptt: Boolean(c.ptt)
      },
      options: opts
    }
  }
  if (c.document) {
    return {
      content: {
        type: 'document',
        media: await resolveMedia(c.document),
        mimetype: c.mimetype || 'application/octet-stream',
        fileName: c.fileName || 'file',
        caption: c.caption
      },
      options: opts
    }
  }
  if (typeof c.text === 'string') {
    const linkPreview = c.linkPreview === undefined ? undefined : c.linkPreview
    return { content: { type: 'text', text: c.text, ...(linkPreview === undefined ? {} : { linkPreview }) }, options: opts }
  }
  if (isRawProto(c)) return { content: c, options: opts }
  if (c.type) return { content: c, options: opts } // sudah format zapo

  throw new Error('sendMessage: format content tidak dikenali')
}

/* ───────── group metadata mapping ───────── */
function mapParticipant(p) {
  const phone = p.phoneJid || (p.jid?.endsWith('@s.whatsapp.net') ? p.jid : undefined)
  const lid = p.lidJid || (p.jid?.endsWith('@lid') ? p.jid : undefined)
  const id = phone || p.jid || lid
  return {
    id,
    jid: p.jid || id,
    phoneNumber: phone,
    lid,
    admin: p.isSuperAdmin ? 'superadmin' : p.isAdmin ? 'admin' : null
  }
}

export function mapGroupMetadata(meta) {
  if (!meta) return meta
  try {
    const ownerLid = meta.owner || meta.ownerJid
    if (meta.ownerPhoneNumber && typeof ownerLid === 'string' && ownerLid.endsWith('@lid')) {
      bindLid(meta.ownerPhoneNumber, ownerLid)
    }
  } catch {}
  return {
    ...meta,
    id: meta.jid || meta.id,
    subject: meta.subject || '',
    owner: meta.owner || meta.ownerJid,
    desc: meta.description ?? meta.desc,
    announce: meta.announce ?? meta.announcement,
    restrict: meta.restrict,
    ephemeralDuration: meta.ephemeralDuration ?? meta.ephemeral ?? 0,
    participants: (meta.participants || []).map(mapParticipant)
  }
}

/* ───────── wrapper ───────── */
export function wrapClient(client) {
  const groupCache = new Map()
  let queue = Promise.resolve()

  client.ev = client.ev || { on() {}, off() {}, process() {}, emit() {} }

  Object.defineProperty(client, 'user', {
    configurable: true,
    get() {
      const c = client.getCredentials?.() || {}
      const id = c.meJid || ''
      return {
        id,
        jid: id ? jidNormalizedUser(id) : '',
        lid: c.meLid || c.lid || '',
        name: c.pushName || c.meDisplayName || ''
      }
    }
  })

  client.decodeJid = (jid) => (typeof jid === 'string' && jid ? jidNormalizedUser(jid) : jid || null)
  client.getJid = (jid = '') => client.decodeJid(jid)

  client.invalidateGroup = (jid) => groupCache.delete(jid)

  /* kirim (diserialisasi + jeda kecil biar tidak kena rate-limit) */
  client.sendMessage = (jid, content, options = {}) => {
    const task = queue.then(async () => {
      const t = await translateContent(content, options)
      const res = await client.message.send(jid, t.content, t.options)
      rememberSent(res?.id)
      await delay(SEND_GAP_MS)
      return {
        key: { remoteJid: jid, fromMe: true, id: res?.id },
        id: res?.id,
        message: typeof t.content === 'object' && !t.content.type ? t.content : undefined,
        messageTimestamp: Math.floor(Date.now() / 1000),
        status: 1
      }
    })
    queue = task.catch(() => {})
    return task
  }

  client.relayMessage = async (jid, message, options = {}) => {
    const res = await client.message.send(jid, message, options.messageId ? { id: options.messageId } : {})
    rememberSent(res?.id)
    return res?.id
  }

  /* group */
  client.groupMetadata = async (jid) => {
    const hit = groupCache.get(jid)
    if (hit && Date.now() - hit.at < GROUP_TTL_MS) return hit.data
    const data = mapGroupMetadata(await client.group.queryGroupMetadata(jid))
    groupCache.set(jid, { at: Date.now(), data })
    return data
  }

  client.groupFetchAllParticipating = async () => {
    const all = await client.group.queryAllGroups()
    const out = {}
    for (const g of all) {
      const m = mapGroupMetadata(g)
      out[m.id] = m
      groupCache.set(m.id, { at: Date.now(), data: m })
    }
    return out
  }

  client.groupParticipantsUpdate = async (jid, participants, action) => {
    const fn = {
      add: 'addParticipants',
      remove: 'removeParticipants',
      promote: 'promoteParticipants',
      demote: 'demoteParticipants'
    }[action]
    if (!fn) throw new Error(`action grup tidak dikenal: ${action}`)
    const results = await client.group[fn](jid, participants)
    groupCache.delete(jid)
    return results.map((r) => ({ status: r.status === 'ok' ? '200' : String(r.code ?? 500), jid: r.jid }))
  }

  client.groupUpdateSubject = async (jid, subject) => {
    await client.group.setSubject(jid, subject)
    groupCache.delete(jid)
  }
  client.groupUpdateDescription = (jid, d) => client.group.setDescription(jid, d ?? null)
  // Baileys: 'announcement' | 'not_announcement' | 'locked' | 'unlocked'
  client.groupSettingUpdate = async (jid, setting) => {
    const map = {
      announcement: ['announcement', true],
      not_announcement: ['announcement', false],
      locked: ['restrict', true],
      unlocked: ['restrict', false]
    }
    const [name, enabled] = map[setting] || []
    if (!name) throw new Error(`setting grup tidak dikenal: ${setting}`)
    await client.group.setSetting(jid, name, enabled)
    groupCache.delete(jid)
  }
  client.groupInviteCode = (jid) => client.group.queryInviteCode(jid)
  client.groupRevokeInvite = async (jid) => (await client.group.revokeInvite(jid)).code
  client.groupLeave = (jid) => client.group.leaveGroup([jid])
  client.groupAcceptInvite = async (code) => (await client.group.joinGroupViaInvite(code)).jid

  /* profil / presence / receipt */
  client.profilePictureUrl = async (jid) => {
    const r = await client.profile.getProfilePicture(jid, 'image')
    return r?.url || null
  }
  client.updateProfileStatus = (text) => client.profile.setStatus(text)
  client.updateBlockStatus = (jid, act) => (act === 'block' ? client.privacy.blockUser(jid) : client.privacy.unblockUser(jid))
  client.sendPresenceUpdate = async (type, jid) => {
    if (type === 'available' || type === 'unavailable') return client.presence.send(type)
    if (!jid) return
    const state = type === 'composing' ? 'composing' : type === 'recording' ? 'recording' : 'paused'
    return client.presence.sendChatstate(jid, { state })
  }
  client.readMessages = async (keys) => {
    for (const k of keys) await client.message.sendReceipt({ key: k }, { type: 'read' })
  }

  return client
}
