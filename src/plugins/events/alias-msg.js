import cmd from "../../commands/map.js";

cmd.add({
    async events({ m, sock: conn }) {
        const {
            generateWAMessage,
            areJidsSameUser,
            proto
        } = await import("baileys");

        conn.alias ??= {};
        conn.input ??= {};

        const text = String(
            m.text ??
            m.body ??
            ""
        ).trim();

        async function emit(body) {
            const msg = await generateWAMessage(
                m.chat,
                {
                    text: body
                },
                {
                    userJid: conn.user.id
                }
            );

            msg.key.remoteJid = m.chat;

            msg.key.fromMe = areJidsSameUser(
                conn.user.id,
                m.sender
            );

            if (m.isGroup) {
                msg.key.participant =
                    m.sender ||
                    m.participant;
            }

            await conn.ev.emit(
                "messages.upsert",
                {
                    messages: [
                        proto.WebMessageInfo.create(msg)
                    ],
                    type: "notify"
                }
            );
        }

        conn.sendAliasMessage = async (
            jid,
            mess = {},
            aliases = [],
            quoted = null
        ) => {
            const message = await conn.sendMessage(
                jid,
                mess,
                { quoted }
            );

            conn.alias[jid] ??= {};

            conn.alias[jid][message.key.id] = {
                alias: aliases
            };

            return message;
        };

        conn.sendInputMessage = async (
            jid,
            mess = {},
            target = "all",
            timeout = 60000,
            quoted = null
        ) => {
            const message = await conn.sendMessage(
                jid,
                mess,
                { quoted }
            );

            conn.input[jid] ??= {};

            conn.input[jid][message.key.id] = {
                target,
                input: undefined
            };

            const started = Date.now();

            while (Date.now() - started < timeout) {
                const data =
                    conn.input[jid]?.[message.key.id];

                if (
                    data &&
                    Object.prototype.hasOwnProperty.call(
                        data,
                        "input"
                    )
                ) {
                    const result = data.input;

                    delete conn.input[jid][
                        message.key.id
                    ];

                    return result;
                }

                await new Promise(resolve =>
                    setTimeout(resolve, 300)
                );
            }

            const result =
                conn.input[jid]?.[message.key.id]?.input;

            delete conn.input[jid]?.[message.key.id];

            return result;
        };

        if (!m.quoted?.id)
            return;

        const quotedId = m.quoted.id;

        const inputData =
            conn.input[m.chat]?.[quotedId];

        if (inputData) {
            if (
                inputData.target === "all" ||
                inputData.target === m.sender
            ) {
                inputData.input = text;
            }
        }

        const aliasData =
            conn.alias[m.chat]?.[quotedId];

        if (!aliasData)
            return;

        for (const item of aliasData.alias || []) {
            if (!item)
                continue;

            const values = Array.isArray(item.alias)
                ? item.alias
                : [item.alias];

            let matched = false;

            for (const value of values) {
                if (value instanceof RegExp) {
                    value.lastIndex = 0;

                    if (value.test(text)) {
                        matched = true;
                        break;
                    }
                } else if (
                    String(value)
                        .trim()
                        .toLowerCase() ===
                    text.toLowerCase()
                ) {
                    matched = true;
                    break;
                }
            }

            if (!matched)
                continue;

            if (
                typeof item.response === "string" &&
                item.response.trim()
            ) {
                await emit(item.response.trim());
            }

            if (
                typeof item.eval === "string" &&
                item.eval.trim()
            ) {
                await eval(item.eval);
            }

            break;
        }
    }
});