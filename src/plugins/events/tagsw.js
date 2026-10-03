import cmd from "../../commands/map.js";

cmd.add({
    async events({ m, sock: conn, isBotAdmin }) {
        const message = m?.message;

        if (!message) return;

        const type =
            message
                ?.groupStatusMentionMessage
                ?.message
                ?.protocolMessage
                ?.type;

        if (type !== 25) return;

        console.log("[TAG SW]", {
            id: m?.key?.id,
            chat: m?.chat,
            isGroup: m?.isGroup,
            isBotAdmin
        });

        if (m.isGroup) {
            if (!isBotAdmin) return;
        }

        const chat =
            m?.key?.remoteJid ||
            m?.chat;

        if (!chat?.endsWith("@g.us")) return;

        const key = {
            ...m.key,
            remoteJid: chat
        };

        if (!key.id) return;

        try {
            await conn.sendMessage(chat, {
                delete: key
            });

            console.log("[TAG SW] DELETE SUCCESS");
        } catch (e) {
            console.error(
                "[TAG SW DELETE ERROR]",
                e
            );
        }
    }
});