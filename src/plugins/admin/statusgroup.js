import cmd from "../../commands/map.js"

cmd.add({
    name: 'statusgrup',
    alias: ['swgc'],
    category: ['admin'],
    desc: "Upload Image and Video .swgc",
    group: true,
    admin: true,
    async run({
        m,
        sock,
        text
    }) {
        const q = m.quoted ? m.quoted : m;
        const mime = (q.msg || q).mimetype || '';
        const isMedia = /image|video/.test(mime);
        if (!text && !isMedia) {
            return m.reply(`Contoh penggunaan:\n\nKetik ${usedPrefix + command} Halo semua!\natau balas gambar/video dengan ${usedPrefix + command} caption`);
        }
        await m.reply('Merespon... sedang memproses status grup ⏳');
        try {
            const botJid = sock.decodeJid(sock.user?.id || sock.user?.jid);
            let ctxInfo = {
                isGroupStatus: true,
                participant: botJid // Kunci krusial agar reply bar muncul
            };
            if (isMedia) {
                let media = await q.download();
                let mediaContent = {
                    contextInfo: ctxInfo
                };
                if (text) mediaContent.caption = text;
                if (/image/.test(mime)) {
                    mediaContent.image = media;
                    await sock.sendMessage(m.chat, mediaContent);
                } else if (/video/.test(mime)) {
                    mediaContent.video = media;
                    await sock.sendMessage(m.chat, mediaContent);
                }
            } else {
                await sock.sendMessage(m.chat, {
                    text: text,
                    contextInfo: ctxInfo
                });
            }
            m.reply('✅ Status grup berhasil dikirim!');
        } catch (e) {
            console.error(e);
            m.reply('> ◦❒ Gagal mengirim status grup: ' + (e.message || e));
        }
    }
});