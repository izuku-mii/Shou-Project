import cmd from "../../commands/map.js";

cmd.add({
    name: "spr",
    alias: ["fakemessage"],
    category: ["owner"],
    group: true,
    owner: true,
    desc: "Slander and Silence People Immediately Get Bullied",
    async run({ m, text }) {
         if (!m.quoted?.key?.id) return m.reply("Reply Pesan Nya Woi")
         if (!text) return m.reply("Masukan Teks Nya Wok")
         await conn.fakeMesaage(m.chat, {
              id: m.quoted?.key?.id,
              text
        })
    }
});