import cmd from "../commands/map.js";

cmd.add({
    name: /^owner$/i,
    alias: /^(own|owr)$/i,
    category: ["info"],
    desc: "Info Owner Saat Mau Chat",
    async run({
        m,
        sock: conn
    }) {
        const owners = JSON.parse(process.env.OWNER || '[]')

        const contacts = owners.map(([number, name]) => ({
            displayName: name,
            vcard: `BEGIN:VCARD
VERSION:3.0
FN:${name}
TEL;type=CELL;type=VOICE;waid=${number}:${number}
END:VCARD`
        }))

        await conn.sendMessage(m.chat, {
            contacts: {
                displayName: `${contacts.length} Owner`,
                contacts
            }
        })
    }
})