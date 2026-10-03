import { link, auth, pro } from "../../scrape/amprem.js"
import cmd from "../../commands/map.js"

cmd.add({
    name: /^(alightmotionprem)$/i,
    alias: /^(amprem)$/i,
    category: ["premium"],
    premium: true,
    usage: ".amprem, .alightmotionprem [Enter your email so you can get premium AM]",
    async run({
        m,
        text
    }) {
        if (!text)
            return m.reply("Masukan Email Nya")

        const user = db.data.users[m.sender]

        if (!user.amprem)
            user.amprem = {}

        try {
            const email = text.trim()
            const k = await link(email);
            
            user.amprem = {
                email
            }

            return m.reply(`✅ Email berhasil dikirim.

Silakan reply pesan ini dengan link Alight Motion yang kamu terima.`)
        } catch (e) {
            return m.reply(String(e.message || e))
        }
    }
})

cmd.add({
    async events({
        m,
        sock
    }) {
        const user = db.data.users[m.sender]

        if (!user?.amprem?.email)
            return

        if (!m.text)
            return

        if (!m.quoted)
            return

        if (!m.quoted.fromMe)
            return

        const link = m.text.trim()

        if (!link.toLowerCase().includes("alight"))
            return

        await m.reply(
            "⏳ Sedang memverifikasi link, mohon tunggu sebentar..."
        )

        try {
            const email = user.amprem.email
            const k = await auth(email, link)
            await pro(k.id)

            user.premium = true

            delete user.amprem

            await m.reply(
                "🎉 Coba lihat di Alight Motion kamu, sekarang seharusnya sudah Premium."
            )
        } catch (e) {
            delete user.amprem

            await m.reply(String(e.message || e))
        }

        return true
    }
})