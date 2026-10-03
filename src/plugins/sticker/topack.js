import cmd from "../../commands/map.js"
import { sendPackSimple } from "../../utils/zapoPack.js"
import { getAlbum } from "../../utils/albumStore.js"

cmd.add({
    name: "tostickerpack",
    alias: ["tsp"],
    category: "sticker",
    desc: "Convert album menjadi sticker pack",
    usage: ".tsp <nama> (reply album / foto)",

    async run({ m, sock, text }) {
        try {
            if (!m.quoted) {
                return m.reply("Reply album yang ingin dijadikan sticker pack")
            }

            const packName = (text || "").trim()
                ? text.trim().replace(/[-_]+/g, " ").replace(/\s+/g, " ").replace(/\b\w/g, x => x.toUpperCase())
                : "Shou-Bot"

            const date = new Date().toLocaleDateString("id-ID", {
                day: "2-digit", month: "2-digit", year: "numeric"
            })

            const { items, exact } = getAlbum(m.chat, m.quoted.id, m.quoted.message)

            if (!items.length) {
                return m.reply("Media album tidak ditemukan. Kirim ulang album lalu reply dengan .tsp")
            }

            const pack = []
            for (const it of items) {
                try {
                    const buffer = await sock.downloadM({ message: it.msg })
                    if (Buffer.isBuffer(buffer) && buffer.length) {
                        pack.push({ data: buffer, video: it.type === "video" })
                    }
                } catch (err) {
                    console.error("TSP MEDIA ERROR:", err)
                }
            }

            if (!pack.length) {
                return m.reply("Gagal mengunduh media album (mungkin sudah kedaluwarsa). Kirim ulang albumnya.")
            }

            await sendPackSimple(sock, m.chat, pack, {
                name: packName,
                publisher: `Created ${process.env.BOT || "Shou-Bot"} • ${date}`,
                quoted: m
            })

            if (!exact) {
                await m.reply("Catatan: album ini belum tercatat (dikirim sebelum bot restart), jadi hanya 1 media yang bisa dipakai. Kirim ulang album agar semua foto ikut.")
            }
        } catch (err) {
            console.error("TSP ERROR:", err)
            return m.reply(`Error: ${err.message}`)
        }
    }
})
