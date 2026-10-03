// Kirim sticker pack versi simpel pakai API native zapo-js (type: 'sticker-pack').
// Tidak pakai client.query / upload manual lagi.
import { videoToWebp, toStickerWebp, toTrayPng, toCoverJpeg } from './exif.js'

const toBuf = (v) => (Buffer.isBuffer(v) ? v : Buffer.from(v))

/**
 * items: [{ data: Buffer, video?: boolean, emojis?: string[] }]
 * opts : { name, publisher, quoted, caption }
 */
export async function sendPackSimple(conn, jid, items = [], opts = {}) {
  const stickers = []
  let firstStatic = null

  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (!it?.data?.length) continue
    try {
      let media, animated = false
      if (it.video) {
        media = toBuf(await videoToWebp(toBuf(it.data)))
        animated = true
      } else {
        media = await toStickerWebp(toBuf(it.data))
        firstStatic ??= it.data
      }
      stickers.push({
        media,
        fileName: `sticker_${i + 1}.webp`,
        emojis: it.emojis || ['😍'],
        mimetype: 'image/webp',
        ...(animated ? { isAnimated: true } : {})
      })
    } catch (e) {
      console.error('[PACK] skip item', i + 1, e?.message || e)
    }
  }

  if (!stickers.length) throw new Error('Tidak ada media valid untuk dijadikan stiker.')

  // tray & cover: pakai gambar statis pertama, kalau tidak ada pakai webp pertama
  const trayBase = firstStatic ? toBuf(firstStatic) : stickers[0].media
  const trayPng = await toTrayPng(trayBase)
  const coverJpeg = await toCoverJpeg(trayBase)

  const payload = {
    type: 'sticker-pack',
    stickerPackId: opts.packId || `pack-${Date.now()}`,
    name: opts.name || 'Shou-Bot',
    publisher: opts.publisher || process.env.BOT || 'Shou-Bot',
    stickers,
    trayIcon: { media: trayPng, fileName: 'tray_icon.png' },
    coverThumbnail: coverJpeg,
    ...(opts.caption ? { caption: opts.caption } : {})
  }

  const q = opts.quoted
  return conn.message.send(jid, payload, q ? { quote: q.event || q } : {})
}
