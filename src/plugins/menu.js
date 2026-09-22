import fs from 'node:fs/promises'
import crypto from 'node:crypto'

import {
    prepareWAMessageMedia,
    generateWAMessageFromContent
} from 'baileys'

import cmd from '../commands/map.js'

const cleanName = value => {
    return String(value)
        .trim()
        .replace(/^\(+|\)+$/g, '')
        .trim()
}

const regexToList = value => {
    if (!(value instanceof RegExp)) {
        return [cleanName(value)].filter(Boolean)
    }

    let source = value.source
        .replace(/^\^/, '')
        .replace(/\$$/, '')
        .replace(/\\([.*+?^${}()|[\]\\])/g, '$1')
        .trim()

    while (
        source.startsWith('(') &&
        source.endsWith(')')
    ) {
        source = source.slice(1, -1).trim()
    }

    if (source.includes('|')) {
        return source
            .split('|')
            .map(x => cleanName(x))
            .filter(Boolean)
    }

    return [cleanName(source)].filter(Boolean)
}

const getNames = value => {
    if (Array.isArray(value)) {
        return value.flatMap(getNames)
    }

    if (value instanceof RegExp) {
        return regexToList(value)
    }

    if (value == null) {
        return []
    }

    return [cleanName(value)].filter(Boolean)
}

const getCommandNames = command => {
    return getNames(command?.name)
}

const getCommandName = command => {
    return getCommandNames(command)[0] || ''
}

const getDisplayAliases = command => {
    const names = getCommandNames(command)
    const aliases = getNames(command?.alias)

    const all = [
        ...names.slice(1),
        ...aliases
    ]

    const name = getCommandName(command).toLowerCase()

    return all
        .map(cleanName)
        .filter(Boolean)
        .filter(
            x => x.toLowerCase() !== name
        )
        .filter(
            (x, i, arr) =>
                arr.findIndex(
                    y =>
                        y.toLowerCase() ===
                        x.toLowerCase()
                ) === i
        )
}

const categoryEmoji = {
    download: '📥',
    info: 'ℹ️',
    owner: '👑',
    tools: '🛠️',
    fun: '🎮',
    game: '🎮',
    ai: '🤖',
    search: '🔎',
    sticker: '🎨',
    group: '👥',
    admin: '🛡️',
    anime: '🌸',
    internet: '🌐',
    news: '📰',
    utility: '🔧',
    utilities: '🔧',
    other: '📁'
}

const getCategoryEmoji = category => {
    return (
        categoryEmoji[
            String(category).toLowerCase()
        ] || '📁'
    )
}

const getOSName = () => {
    const platforms = {
        linux: 'Linux',
        win32: 'Windows',
        darwin: 'macOS',
        android: 'Android'
    }

    return (
        platforms[process.platform] ||
        process.platform
    )
}

const getHeader = m => {
    const botName =
        process.env.BOT || 'BOT'

    const pushName =
        m.pushName || 'User'

    const osName = getOSName()

    return [
        `🤖 *${botName}*`,
        '',
        `👋 Hai ${pushName}, welcome!`,
        '',
        `💻 *OS:* ${osName}`,
        `🗄️ *Type:* SQD Better`,
        ''
    ].join('\n')
}

/*
 * =========================
 * GIF / VIDEO BUFFER
 * =========================
 */

const getGifBuffer = async () => {
    const source =
        String(process.env.GIF || '').trim()

    if (!source) {
        return null
    }

    /*
     * URL
     */
    if (/^https?:\/\//i.test(source)) {
        const res = await fetch(source)

        if (!res.ok) {
            throw new Error(
                `GIF HTTP ${res.status}`
            )
        }

        return Buffer.from(
            await res.arrayBuffer()
        )
    }

    /*
     * FILE
     */
    return await fs.readFile(source)
}

/*
 * =========================
 * SEND MENU
 * =========================
 */

const sendMenu = async (
    sock,
    m,
    text
) => {
    const source =
        String(process.env.GIF || '').trim()

    /*
     * Tanpa GIF
     */
    if (!source) {
        return m.reply(text)
    }

    try {
        const buffer =
            await getGifBuffer()

        if (!buffer?.length) {
            return m.reply(text)
        }

        /*
         * Prepare media melalui Baileys
         */
        const media =
            await prepareWAMessageMedia(
                {
                    video: buffer
                },
                {
                    upload:
                        sock.waUploadToServer
                }
            )

        /*
         * Context newsletter
         */
        const contextInfo = {
            mentionedJid: [],
            groupMentions: [],
            statusAttributions: [],

            forwardingScore: 1,
            isForwarded: true,

            forwardedNewsletterMessageInfo: {
                newsletterJid:
                    process.env.NEWSLETTER_JID ||
                    '120363410696658468@newsletter',

                serverMessageId:
                    Number(
                        process.env.NEWSLETTER_MSG_ID ||
                        121
                    ),

                newsletterName:
                    process.env.NEWSLETTER_NAME ||
                    'ShouCode </>'
            },

            forwardOrigin: 0
        }

        /*
         * Content
         */
        const content = {
            videoMessage: {
                ...media.videoMessage,

                caption: text,

                mimetype: 'video/mp4',

                gifPlayback: true,

                contextInfo
            },

            messageContextInfo: {
                messageSecret:
                    crypto.randomBytes(32)
            }
        }

        /*
         * Generate message
         * quoted ditangani Baileys
         */
        const generated =
            generateWAMessageFromContent(
                m.chat,
                content,
                {
                    userJid:
                        sock.user?.id,

                    quoted: m
                }
            )

        /*
         * Relay
         */
        return await sock.relayMessage(
            m.chat,
            generated.message,
            {
                messageId:
                    generated.key?.id ||
                    crypto.randomUUID()
            }
        )

    } catch (err) {
        console.error(
            '[MENU GIF]',
            err
        )

        return m.reply(text)
    }
}

/*
 * =========================
 * COMMAND
 * =========================
 */

cmd.add({
    name: 'menu',

    alias: [
        'help',
        'list'
    ],

    category: [
        'info'
    ],

    desc:
        'Show all commands or filter by category with detailed information',

    async run({
        m,
        sock,
        args
    }) {

        /*
         * =========================
         * CATEGORY MENU
         * =========================
         */

        if (args.length > 0) {

            const targetCategory =
                args[0].toLowerCase()

            const filteredCommands =
                cmd.values().filter(
                    command =>
                        Array.isArray(
                            command?.category
                        ) &&
                        command.category.some(
                            category =>
                                String(category)
                                    .toLowerCase() ===
                                targetCategory
                        )
                )

            if (!filteredCommands.length) {
                return m.reply(
                    `No commands found in category: ${targetCategory}`
                )
            }

            let text =
                getHeader(m)

            text +=
                `${getCategoryEmoji(
                    targetCategory
                )} *${targetCategory.toUpperCase()}*\n\n`

            for (
                const command
                of filteredCommands
            ) {

                if (!command?.name) {
                    continue
                }

                const name =
                    getCommandName(
                        command
                    )

                const aliases =
                    getDisplayAliases(
                        command
                    )

                text +=
                    `• *${name}*`

                if (aliases.length) {
                    text +=
                        ` (${aliases.join(', ')})`
                }

                text += '\n'

                if (command.desc) {
                    text +=
                        `  ${command.desc}\n`
                }

                if (command.usage) {
                    text +=
                        `  Usage: ${command.usage}\n`
                }

                text += '\n'
            }

            text +=
                `Total: ${
                    filteredCommands.filter(
                        x => x?.name
                    ).length
                }`

            return sendMenu(
                sock,
                m,
                text.trim()
            )
        }

        /*
         * =========================
         * ALL MENU
         * =========================
         */

        const commands =
            cmd.values()

        const categories =
            new Map()

        for (
            const command
            of commands
        ) {

            if (!command?.name) {
                continue
            }

            const commandCategories =
                Array.isArray(
                    command.category
                ) &&
                command.category.length
                    ? command.category
                    : ['other']

            for (
                const category
                of commandCategories
            ) {

                const name =
                    String(
                        category
                    ).toLowerCase()

                if (
                    !categories.has(name)
                ) {
                    categories.set(
                        name,
                        []
                    )
                }

                categories
                    .get(name)
                    .push(command)
            }
        }

        let text =
            getHeader(m)

        for (
            const [
                category,
                categoryCommands
            ]
            of [
                ...categories.entries()
            ].sort()
        ) {

            text +=
                `${getCategoryEmoji(
                    category
                )} *${category.toUpperCase()}*\n`

            for (
                const command
                of categoryCommands
            ) {

                if (!command?.name) {
                    continue
                }

                const name =
                    getCommandName(
                        command
                    )

                const aliases =
                    getDisplayAliases(
                        command
                    )

                text +=
                    `• *${name}*`

                if (aliases.length) {
                    text +=
                        ` (${aliases.join(', ')})`
                }

                if (command.usage) {
                    text +=
                        `\n  ${command.usage}`
                }

                text += '\n'
            }

            text += '\n'
        }

        text +=
            'Use *.menu <category>* for more commands\n'

        text +=
            `Total: ${
                commands.filter(
                    x => x?.name
                ).length
            }`

        return sendMenu(
            sock,
            m,
            text.trim()
        )
    }
})
