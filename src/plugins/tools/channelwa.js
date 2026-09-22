import cmd from "../../commands/map.js";
const {
    proto,
    generateMessageID
} = await import('baileys')
cmd.add({
    name: "channelmeta",
    alias: ["metach", "metach"],
    category: ["tools"],
    desc: " Getting Whatsapp Channel Metadata",
    usage: "link channel whatsapp .channelmeta",
    example: "Link Channel Metadata Link Whatsapp .channelmeta",
    async run({
        m,
        sock,
        args
    }) {
        try {
            const link = args[0] || ""
            if (!link.includes('whatsapp')) return m.reply(" Where is the channel's WhatsApp link!")
            const code = link.split('/channel/')[1]
            const metadata = await sock.newsletterMetadata('invite', code)
            const thread = metadata.thread_metadata
            const name = thread.name?.text || '-'
            const description = thread.description?.text || '-'
            const newsletterJid = metadata.id || '-'
            const text = `乂 *Saluran Metadata*

> *- Nama :* ${name}
> *- ID :* ${newsletterJid}
> *- Invite :* ${thread.invite || '-'}
> *- Subscriber :* ${thread.subscribers_count || '0'}
> *- Verifikasi :* ${thread.verification || '-'}
> *- Status :* ${metadata.state?.type || '-'}
> *- Handle :* ${thread.handle || '-'}
> *- Deskripsi :* ${description}`

            const preview = thread.preview
            if (!preview?.direct_path) {
                return await sock.sendMessage(m.chat, {
                    text
                })
            }
            const image = await fetch(
                `https://mmg.whatsapp.net${preview.direct_path}`
            ).then(res => res.arrayBuffer())
            await sock.sendMessage(m.chat, {
                image: Buffer.from(image),
                caption: `${text}\n\n🔗 ${link}`
            })
        } catch (err) {
            console.error(err);
            m.reply("Gagal Get Metadata Nya!")
        }
    },
});
