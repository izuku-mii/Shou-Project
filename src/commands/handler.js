import cmd from "./map.js";
import chalk from "chalk";
import { watchFile, unwatchFile } from "fs";
import { fileURLToPath } from "url";

const LIMIT_MAX = 30;

if (typeof global.__filename !== "function") {
    global.__filename = (url, resolve = false) => {
        return fileURLToPath(url);
    };
}

function normalizeNumber(value = "") {
    return String(value)
        .trim()
        .split("@")[0]
        .split(":")[0]
        .replace(/\D/g, "");
}

function getJid(conn, jid = "") {
    if (!jid) return "";

    try {
        if (typeof conn?.getJid === "function") {
            const result = conn.getJid(jid);
            if (result) return result;
        }
    } catch {}

    try {
        if (typeof conn?.decodeJid === "function") {
            const result = conn.decodeJid(jid);
            if (result) return result;
        }
    } catch {}

    return jid;
}

function sameJid(conn, a, b) {
    if (!a || !b) return false;

    const valuesA = new Set();
    const valuesB = new Set();

    const add = (set, value) => {
        if (!value) return;

        const raw = String(value).trim();

        if (!raw) return;

        set.add(raw);

        try {
            const decoded = conn?.decodeJid?.(raw);

            if (decoded) {
                set.add(decoded);
            }
        } catch {}

        try {
            const custom = conn?.getJid?.(raw);

            if (custom) {
                set.add(custom);
            }
        } catch {}

        const number = normalizeNumber(raw);

        if (number) {
            set.add(number);
        }
    };

    add(valuesA, a);
    add(valuesB, b);

    for (const x of valuesA) {
        if (valuesB.has(x)) {
            return true;
        }
    }

    return false;
}

function isOwner(sender) {
    const number = normalizeNumber(sender);

    let owners;

    try {
        owners = JSON.parse(
            process.env.OWNER || "[]"
        );
    } catch {
        return false;
    }

    if (!Array.isArray(owners)) return false;

    return owners.some(owner =>
        Array.isArray(owner) &&
        owner[2] === true &&
        normalizeNumber(owner[0]) === number
    );
}

function isPremiumNumber(sender) {
    const number = normalizeNumber(sender);

    let premiums;

    try {
        premiums = JSON.parse(
            process.env.PREM || "[]"
        );
    } catch {
        return false;
    }

    if (!Array.isArray(premiums)) return false;

    return premiums.some(premium =>
        Array.isArray(premium) &&
        premium[2] === true &&
        normalizeNumber(premium[0]) === number
    );
}

function getUser(m) {
    if (!m?.sender) return null;

    global.db.data.users ??= {};

    let user =
        global.db.data.users[m.sender];

    /*
     * USER BARU
     */
    if (!user) {
        user = global.db.data.users[m.sender] = {
            limit: LIMIT_MAX,
            limitInitialized: true
        };

        return user;
    }

    /*
     * FIX USER LAMA
     *
     * ShouConnect sebelumnya membuat:
     *
     * limit: 0
     *
     * Jadi user lama yang masih benar-benar
     * fresh akan diperbaiki menjadi 30.
     */
    if (user.limitInitialized !== true) {
        if (
            user.limit === 0 &&
            Number(user.exp || 0) === 0 &&
            Number(user.level || 0) === 0 &&
            user.registered === false
        ) {
            user.limit = LIMIT_MAX;
        }

        if (
            user.limit === undefined ||
            user.limit === null ||
            Number.isNaN(Number(user.limit))
        ) {
            user.limit = LIMIT_MAX;
        }

        user.limit = Number(user.limit);

        user.limitInitialized = true;
    }

    if (
        user.limit === undefined ||
        user.limit === null ||
        Number.isNaN(Number(user.limit))
    ) {
        user.limit = LIMIT_MAX;
    }

    user.limit = Number(user.limit);

    return user;
}

function getChat(m) {
    if (!m?.chat) return {};

    global.db.data.chats ??= {};
    global.db.data.chats[m.chat] ??= {};

    return global.db.data.chats[m.chat];
}

function getBotJid(conn) {
    return (
        conn?.user?.jid ||
        conn?.user?.id ||
        conn?.user?.lid ||
        ""
    );
}

function getSettings(conn) {
    const jid = getBotJid(conn);

    let decoded = jid;

    try {
        decoded =
            conn?.decodeJid?.(jid) || jid;
    } catch {}

    return (
        global.db?.data?.settings?.[jid] ||
        global.db?.data?.settings?.[decoded] ||
        {}
    );
}

/*
 * PREMIUM TIDAK OTOMATIS DARI OWNER
 *
 * Premium hanya dari:
 * - PREM env
 * - user.premium
 * - user.premiumTime
 */
function isPremium(user, owner = false, sender = "") {
    if (isPremiumNumber(sender)) {
        return true;
    }

    if (!user) return false;

    return (
        user.premium === true ||
        Number(user.premiumTime || 0) > Date.now()
    );
}

function isMod(user, owner = false) {
    if (owner) return true;

    if (!user) return false;

    return (
        user.mod === true ||
        user.moderator === true ||
        user.isMod === true ||
        [
            "mod",
            "moderator",
            "admin",
            "developer",
            "owner"
        ].includes(
            String(user.role || "").toLowerCase()
        )
    );
}

function isBanned(user) {
    return Boolean(
        user?.banned === true ||
        user?.ban === true ||
        user?.isBanned === true
    );
}

function isChatBanned(chat) {
    return Boolean(
        chat?.banned === true ||
        chat?.ban === true ||
        chat?.isBanned === true
    );
}

class CommandHandler {
    isCommand(text = "") {
        return /^([.!/])/.test(
            String(text).trim()
        );
    }

    parseCommand(text = "") {
        const value = String(text)
            .trim()
            .replace(/^([.!/])/, "")
            .trim();

        if (!value) return ["", []];

        const args = value.split(/\s+/);
        const command =
            args.shift()?.toLowerCase() || "";

        return [command, args];
    }

    match(value, pattern) {
        if (pattern instanceof RegExp) {
            pattern.lastIndex = 0;
            return pattern.test(
                String(value)
            );
        }

        if (Array.isArray(pattern)) {
            return pattern.some(item =>
                this.match(value, item)
            );
        }

        if (
            pattern === undefined ||
            pattern === null
        ) {
            return false;
        }

        return (
            String(pattern)
                .trim()
                .toLowerCase() ===
            String(value)
                .trim()
                .toLowerCase()
        );
    }

    findCommand(command) {
        for (const plugin of cmd.values()) {
            if (
                !plugin ||
                typeof plugin.run !== "function"
            ) {
                continue;
            }

            if (
                plugin.name &&
                this.match(
                    command,
                    plugin.name
                )
            ) {
                return plugin;
            }

            if (
                plugin.alias &&
                this.match(
                    command,
                    plugin.alias
                )
            ) {
                return plugin;
            }
        }

        return null;
    }

    async runEvents(context) {
        for (const plugin of cmd.values()) {
            if (
                !plugin ||
                typeof plugin.events !== "function"
            ) {
                continue;
            }

            try {
                await plugin.events(context);
            } catch (error) {
                console.error(
                    "Plugin event error:",
                    error
                );
            }
        }
    }

    async reply(m, sock, text) {
        try {
            if (
                typeof m?.reply === "function"
            ) {
                return await m.reply(text);
            }

            if (
                typeof sock?.sendMessage ===
                    "function" &&
                m?.chat
            ) {
                return await sock.sendMessage(
                    m.chat,
                    { text },
                    { quoted: m }
                );
            }
        } catch (error) {
            console.error(
                "[REPLY ERROR]",
                error
            );
        }
    }

    async getGroupData(m, conn) {
        if (!m.isGroup) {
            return {
                groupMetadata: {},
                participants: [],
                groupUser: {},
                bot: {},
                isRAdmin: false,
                isAdmin: false,
                isBotAdmin: false
            };
        }

        let groupMetadata =
            conn?.chats?.[m.chat]?.metadata;

        if (!groupMetadata) {
            try {
                groupMetadata =
                    await conn.groupMetadata(
                        m.chat
                    );
            } catch (error) {
                console.error(
                    "[GROUP METADATA]",
                    error
                );

                groupMetadata = {};
            }
        }

        const participants =
            groupMetadata?.participants || [];

        const senderJid =
            m.sender || "";

        const botJid =
            getBotJid(conn);

        const groupUser =
            participants.find(
                participant => {
                    if (!participant) {
                        return false;
                    }

                    if (
                        sameJid(
                            conn,
                            participant.id,
                            senderJid
                        )
                    ) return true;

                    if (
                        sameJid(
                            conn,
                            participant.jid,
                            senderJid
                        )
                    ) return true;

                    if (
                        sameJid(
                            conn,
                            participant.lid,
                            senderJid
                        )
                    ) return true;

                    if (
                        sameJid(
                            conn,
                            participant.phoneNumber,
                            senderJid
                        )
                    ) return true;

                    return false;
                }
            ) || {};

        const bot =
            participants.find(
                participant => {
                    if (!participant) {
                        return false;
                    }

                    if (
                        sameJid(
                            conn,
                            participant.id,
                            botJid
                        )
                    ) return true;

                    if (
                        sameJid(
                            conn,
                            participant.jid,
                            botJid
                        )
                    ) return true;

                    if (
                        sameJid(
                            conn,
                            participant.lid,
                            botJid
                        )
                    ) return true;

                    if (
                        sameJid(
                            conn,
                            participant.phoneNumber,
                            botJid
                        )
                    ) return true;

                    return false;
                }
            ) || {};

        const isRAdmin =
            groupUser?.admin ===
            "superadmin";

        const isAdmin =
            isRAdmin ||
            groupUser?.admin === "admin";

        const isBotAdmin =
            bot?.admin === "admin" ||
            bot?.admin === "superadmin";

        return {
            groupMetadata,
            participants,
            groupUser,
            bot,
            isRAdmin,
            isAdmin,
            isBotAdmin
        };
    }

    checkPermissions(
        plugin,
        m,
        user,
        permissions
    ) {
        const {
            isROwner,
            isOwner,
            isPrems,
            isMod,
            isRAdmin,
            isAdmin,
            isBotAdmin
        } = permissions;

        if (
            (plugin.isROwner ||
                plugin.rowner) &&
            !isROwner
        ) return "rowner";

        if (
            (plugin.isOwner ||
                plugin.owner) &&
            !isOwner
        ) return "owner";

        if (
            (plugin.isPrem ||
                plugin.isPremium ||
                plugin.premium) &&
            !isPrems
        ) return "premium";

        if (
            (plugin.isMod ||
                plugin.mod) &&
            !isMod
        ) return "mod";

        if (
            (plugin.isGroup ||
                plugin.group) &&
            !m.isGroup
        ) return "group";

        if (
            (plugin.isPrivate ||
                plugin.private) &&
            m.isGroup
        ) return "private";

        if (
            (plugin.isAdmin ||
                plugin.admin) &&
            !isAdmin
        ) return "admin";

        if (
            (plugin.isBotAdmin ||
                plugin.botAdmin) &&
            !isBotAdmin
        ) return "botAdmin";

        if (
            plugin.register === true ||
            plugin.registered === true
        ) {
            if (!user?.registered) {
                return "unreg";
            }
        }

        if (
            plugin.level !== undefined &&
            Number(user?.level || 0) <
                Number(plugin.level)
        ) {
            return "level";
        }

        return true;
    }

    async fail(
        type,
        m,
        sock,
        plugin
    ) {
        const messages = {
            rowner:
                "Only Developer - Command ini hanya untuk developer bot",

            owner:
                "Only Owner - Command ini hanya untuk owner bot",

            premium:
                "Only Premium - Command ini hanya untuk pengguna premium",

            mod:
                "Only Mod - Command ini hanya untuk moderator bot",

            group:
                "Group Chat - Command ini hanya bisa dipakai di dalam grup",

            private:
                "Private Chat - Command ini hanya bisa dipakai di private chat",

            admin:
                "Only Admin - Command ini hanya untuk admin grup",

            botAdmin:
                "Only Bot Admin - Command ini hanya bisa digunakan ketika bot menjadi admin grup",

            unreg:
                "Unregistered - Silakan daftar terlebih dahulu"
        };

        if (type === "level") {
            return this.reply(
                m,
                sock,
                `Level ${
                    plugin?.level ?? 0
                } required`
            );
        }

        if (messages[type]) {
            return this.reply(
                m,
                sock,
                messages[type]
            );
        }
    }

    handleCommand(
        m,
        sock,
        store
    ) {
        return Promise.resolve()
            .then(async () => {
                if (!m) return;

                global.store = store;

                if (
                    m.isBot === true &&
                    m.fromMe !== true
                ) {
                    return;
                }

                if (
                    global.db?.data == null
                ) {
                    await global.loadDatabase?.();
                }

                if (!global.db?.data) {
                    return;
                }

                if (
                    typeof m.text !== "string"
                ) {
                    m.text = "";
                }

                const body = String(
                    m.body ??
                    m.text ??
                    ""
                ).trim();

                if (!body) return;

                if (
                    m.sender?.endsWith(
                        "@broadcast"
                    ) ||
                    m.sender?.endsWith(
                        "@newsletter"
                    )
                ) {
                    return;
                }

                const user = getUser(m);
                const chat = getChat(m);

                const isROwner =
                    isOwner(m.sender);

                const isOwnerUser =
                    isROwner === true ||
                    m.fromMe === true;

                const isPrems =
                    isPremium(
                        user,
                        isROwner,
                        m.sender
                    );

                const isModUser =
                    isMod(
                        user,
                        isOwnerUser
                    );

                const userBanned =
                    isBanned(user);

                const chatBanned =
                    isChatBanned(chat);

                if (
                    userBanned &&
                    !isOwnerUser
                ) return;

                if (
                    chatBanned &&
                    !isOwnerUser
                ) return;

                const settings =
                    getSettings(sock);

                if (
                    (
                        settings.gconly === true ||
                        settings.onlyGroup === true ||
                        settings.onlygroup === true
                    ) &&
                    !m.isGroup &&
                    !isOwnerUser &&
                    !isPrems
                ) return;

                if (
                    settings.public === false &&
                    !isOwnerUser
                ) return;

                if (
                    String(
                        process.env.isSelf
                    ).toLowerCase() === "true" &&
                    !m.fromMe &&
                    !isOwnerUser &&
                    !isPrems
                ) return;

                const groupData =
                    await this.getGroupData(
                        m,
                        sock
                    );

                const {
                    groupMetadata,
                    participants,
                    groupUser,
                    bot,
                    isRAdmin,
                    isAdmin,
                    isBotAdmin
                } = groupData;

                const context = {
                    m,
                    sock,
                    conn: sock,
                    store,
                    user,
                    chat,
                    groupUser,
                    bot,
                    groupMetadata,
                    participants,
                    isROwner,
                    isOwner:
                        isOwnerUser,
                    isPrems,
                    isPremium:
                        isPrems,
                    isMod:
                        isModUser,
                    isBanned:
                        userBanned,
                    isChatBanned:
                        chatBanned,
                    isRAdmin,
                    isAdmin,
                    isBotAdmin,
                    text: "",
                    args: [],
                    command: "",
                    usedPrefix: "",
                    prefix: "",
                    isCmd:
                        this.isCommand(body)
                };

                await this.runEvents(
                    context
                );

                if (
                    !this.isCommand(body)
                ) {
                    return;
                }

                const [
                    command,
                    args
                ] = this.parseCommand(
                    body
                );

                const usedPrefix =
                    body.trim().charAt(0);

                context.command =
                    command;

                context.args =
                    args;

                context.text =
                    args.join(" ");

                context.usedPrefix =
                    usedPrefix;

                context.prefix =
                    usedPrefix;

                const plugin =
                    this.findCommand(
                        command
                    );

                if (!plugin) return;

                const permission =
                    this.checkPermissions(
                        plugin,
                        m,
                        user,
                        {
                            isROwner,
                            isOwner:
                                isOwnerUser,
                            isPrems,
                            isMod:
                                isModUser,
                            isRAdmin,
                            isAdmin,
                            isBotAdmin
                        }
                    );

                if (
                    permission !== true
                ) {
                    return this.fail(
                        permission,
                        m,
                        sock,
                        plugin
                    );
                }

                /*
                 * LIMIT
                 *
                 * Kalau limit 0:
                 * reset ke 30
                 * lalu command tetap jalan.
                 */
                if (plugin.limit) {
                    if (!(user.limit > 0)) {
                        user.limit =
                            LIMIT_MAX;
                    }
                }

                m.exp = 0;
                m.limit = 0;

                m.plugin =
                    plugin.name ||
                    command;

                const xp =
                    "exp" in plugin
                        ? Number(
                              plugin.exp
                          )
                        : 17;

                if (
                    Number.isFinite(xp) &&
                    xp <= 200
                ) {
                    m.exp += xp;
                }

                return Promise.resolve(
                    plugin.run(context)
                )
                    .then(async () => {
                        if (plugin.limit) {
                            const before =
                                Number(
                                    user.limit
                                );

                            user.limit =
                                Math.max(
                                    0,
                                    before - 1
                                );

                            m.limit = 1;

                            m.limitBefore =
                                before;

                            m.limitAfter =
                                user.limit;

                            m.limitUsed = 1;

                            await this.reply(
                                m,
                                sock,
                                `> Limit kamu -1\n> Sisa limit: *${user.limit}*`
                            );
                        }

                        const stats =
                            global.db
                                ?.data
                                ?.stats;

                        if (stats) {
                            stats[
                                m.plugin
                            ] = {
                                total: 0,
                                success: 0,
                                last: 0,
                                lastSuccess: 0,
                                ...(stats[
                                    m.plugin
                                ] || {})
                            };

                            stats[
                                m.plugin
                            ].total++;

                            stats[
                                m.plugin
                            ].last =
                                Date.now();

                            stats[
                                m.plugin
                            ].success++;

                            stats[
                                m.plugin
                            ].lastSuccess =
                                Date.now();
                        }

                        return true;
                    })
                    .catch(error => {
                        m.error =
                            error;

                        console.error(
                            `Plugin error [${m.plugin}]`,
                            error
                        );

                        return false;
                    });
            })
            .catch(error => {
                console.error(
                    "CommandHandler error:",
                    error
                );

                return error;
            });
    }
}

const handler =
    new CommandHandler();

const file =
    global.__filename(
        import.meta.url,
        true
    );

const reloadHandler =
    async () => {
        unwatchFile(file);

        console.log(
            chalk.redBright(
                "Update 'handler.js'"
            )
        );

        try {
            if (
                typeof global.reloadHandler ===
                "function"
            ) {
                const result =
                    await global.reloadHandler();

                if (
                    result !== undefined
                ) {
                    console.log(
                        result
                    );
                }

                console.log(
                    chalk.greenBright(
                        "Handler reloaded"
                    )
                );
            }
        } catch (error) {
            console.error(
                chalk.redBright(
                    "Handler reload error:"
                ),
                error
            );
        }

        setTimeout(() => {
            watchFile(
                file,
                reloadHandler
            );
        }, 1000);
    };

watchFile(
    file,
    reloadHandler
);

export default handler;