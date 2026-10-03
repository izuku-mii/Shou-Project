import cmd from '../../commands/map.js'

cmd.add({
    name: 'tagadmin',
    alias: ['tagadmins'],
    category: ['group'],
    desc: 'Tag semua admin grup',
    group: true,

    async run({ m, sock: Yuta }) {
        const metadata = await Yuta.groupMetadata(m.chat)

        const adminJids = metadata.participants
            .filter(p => p.admin === 'admin' || p.admin === 'superadmin')
            .map(p => p.id)
            .filter(Boolean)

        if (!adminJids.length) return

        const text = '@admin'

        await Yuta.sendMessage(m.chat, {
            text,
            mentions: adminJids,
        })
    },
})