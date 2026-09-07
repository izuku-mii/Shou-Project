import cmd from "../../commands/map.js";

cmd.add({
    name: /^admin$/i,
    alias: /^(promote|adm|pme)$/i,
    category: ["admin"],
    group: true,
    botAdmin: true,
    admin: true,
    usage: ".admin, .promote, .adm, .pme [Reply Nomor Atau Tag Nomor Buat Di Jadiin Admin]",
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
                "Reply pesan atau tag nomor yang mau di jadiin admin."
            );
        }

        try {
            await sock.groupParticipantsUpdate(
                m.chat,
                [participant],
                "promote"
            );

            return m.reply("Berhasil admin.");
        } catch (e) {
            console.error(e);
            return m.reply("Gagal admin.");
        }
    }
});

cmd.add({
    name: /^unadmin$/i,
    alias: /^(demote|uadm|dme)$/i,
    category: ["admin"],
    group: true,
    botAdmin: true,
    admin: true,
    usage: ".unadmin, .demote, .uadm, .dme [Reply Nomor Atau Tag Nomor Buat Di Hapus Admin]",
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
                "Reply pesan atau tag nomor yang mau di hapus admin."
            );
        }

        try {
            await sock.groupParticipantsUpdate(
                m.chat,
                [participant],
                "demote"
            );

            return m.reply("Berhasil Di Unadmin.");
        } catch (e) {
            console.error(e);
            return m.reply("Gagal di Unadmin.");
        }
    }
});