import cmd from "../../commands/map.js";

cmd.add({
    name: /^(banchat)$/i,
    alias: /^(mute)$/i,
    isOwner: true,
    category: ["owner"],
    usage: ".banchat, .mute *[Buat Gabisa Chat Bot Di Group]*",
    async run({
        m,
        args
    }) {
        db.data.chats[m.chat].isBanned = true
        m.reply("Udah Di Nyalahin BanGroup Nya")
    }
});

cmd.add({
    name: /^(unbanchat)$/i,
    alias: /^(unmute)$/i,
    isOwner: true,
    category: ["owner"],
    usage: ".unbanchat, .unmute *[Buat Gabisa Chat Bot Di Group]*",
    async run({
        m,
        args
    }) {
        db.data.chats[m.chat].isBanned = false
        m.reply("Udah Di Matiin BanGroup Nya")
    }
});