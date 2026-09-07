import cmd from "../../commands/map.js"
import { writeExif } from "../../utils/exif.js"

cmd.add({
    name: "tostickerpack",
    alias: ["tsp"],
    category: "sticker",
    desc: "Convert album menjadi sticker pack",
    usage: ".tsp <nama>",

    async run({ m, sock, store, text }) {
        try {
            if (!m.quoted) {
                return m.reply("Reply album yang ingin dijadikan sticker pack")
            }

            const inputName = text?.trim()

            const packName = inputName
                ? inputName
                    .replace(/[-_]+/g, " ")
                    .replace(/\s+/g, " ")
                    .trim()
                    .replace(/\b\w/g, x => x.toUpperCase())
                : "Shou-Bot"

            const date = new Date().toLocaleDateString("id-ID", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric"
            })

            const messages = Object.values(store.messages)
                .flat()
                .filter(x =>
                    x?.key?.remoteJid === m.chat &&
                    (
                        x?.message?.imageMessage ||
                        x?.message?.videoMessage
                    )
                )

            if (!messages.length) {
                return m.reply("Media album tidak ditemukan")
            }

            const medias = messages.slice(-30)

            const pack = []
            const usedMessages = []

            for (const msg of medias) {
                try {
                    const imageMessage = msg.message?.imageMessage
                    const videoMessage = msg.message?.videoMessage

                    if (!imageMessage && !videoMessage) continue

                    const media = {
                        message: imageMessage
                            ? { imageMessage }
                            : { videoMessage }
                    }

                    const buffer = await sock.downloadM(media)

                    if (!Buffer.isBuffer(buffer) || !buffer.length) {
                        continue
                    }

                    const sticker = await writeExif(
                        {
                            data: buffer,
                            mimetype: imageMessage
                                ? "image/jpeg"
                                : "video/mp4"
                        },
                        {
                            packId: `shou-${Date.now()}-${pack.length}`,
                            packName,
                            authorName:
                                `Created ${process.env.BOT || "Shou-Bot"} • ${date}`
                        }
                    )

                    pack.push({
                        buffer: sticker
                    })

                    usedMessages.push(msg)

                } catch (err) {
                    console.error("TSP MEDIA ERROR:", err)
                }
            }

            if (!pack.length) {
                return m.reply("Gagal mengambil media album")
            }

            await conn.sendStickerPack(
                m.chat,
                packName,
                `Created ${process.env.BOT || "Shou-Bot"} • ${date}`,
                `Sticker Pack ${packName}`,
                pack,
                {
                    quoted: m
                }
            )

            // Hapus media yang sudah digunakan dari cache
            const usedIds = new Set(
                usedMessages
                    .map(x => x?.key?.id)
                    .filter(Boolean)
            )

            for (const key of Object.keys(store.messages)) {
                if (!Array.isArray(store.messages[key])) continue

                store.messages[key] = store.messages[key].filter(
                    msg => !usedIds.has(msg?.key?.id)
                )

                if (!store.messages[key].length) {
                    delete store.messages[key]
                }
            }

        } catch (err) {
            console.error("TSP ERROR:", err)
            return m.reply(`Error: ${err.message}`)
        }
    }
})