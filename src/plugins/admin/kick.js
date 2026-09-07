import cmd from "../../commands/map.js";

cmd.add({
    name: /^kick$/i,
    alias: /^(kik|dor|kikmint)$/i,
    category: ["admin"],
    group: true,
    botAdmin: true,
    admin: true,
    usage: ".kick, .kik, .dor, .kikmint [Reply Nomor Atau Tag Nomor Buat Di Kick]",
    async run({
        m,
        sock
    }) {
        let participant;

        // Reply pesan yang berisi tag
        if (m?.quoted) {
            const mentioned =
                m.quoted?.mentionedJids ||
                m.quoted?.msg?.contextInfo?.mentionedJid ||
                m.quoted?.message?.extendedTextMessage?.contextInfo?.mentionedJid ||
                [];

            if (mentioned.length) {
                participant = mentioned[0];
            } else if (m.quoted.sender) {
                participant = m.quoted.sender;
            }
        }

        // Tag langsung pada command
        if (!participant && m?.mentionedJids?.length) {
            participant = m.mentionedJids[0];
        }

        if (!participant) {
            return m.reply(
                "Reply pesan atau tag nomor yang mau di-kick."
            );
        }

        try {
            await sock.groupParticipantsUpdate(
                m.chat,
                [participant],
                "remove"
            );

            return m.reply("Berhasil kick member.");
        } catch (e) {
            console.error(e);
            return m.reply("Gagal kick member.");
        }
    }
});