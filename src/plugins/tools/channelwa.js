import cmd from "../../commands/map.js";

const TEXT = `乂 *Saluran Metadata*

> *- Nama :* ShouCode </>
> *- ID :* 120363410696658468@newsletter
> *- Invite :* 0029Vb94XrE9hXF85oFtLQ3D
> *- Subscriber :* 25
> *- Verifikasi :* UNVERIFIED
> *- Status :* ACTIVE
> *- Handle :* -
> *- Deskripsi :* Hmm
\`\`\` - github: https://github.com/izuku-mii
 - web: https://dev.kurokeigo.biz.id/
 - api: https://v3.izuku-mii.biz.id/
 - group: https://chat.whatsapp.com/JyeT1hdCPJeLy95tzx5eyI\`\`\`

🔗 https://whatsapp.com/channel/0029Vb94XrE9hXF85oFtLQ3D`;

cmd.add({
    name: "channelwa",
    alias: ["saluran", "channel"],
    category: ["tools"],
    desc: "Info saluran WhatsApp bot",
    usage: ".channelwa",
    example: ".channelwa",
    async run({ m }) {
        await m.reply(TEXT);
    }
});
