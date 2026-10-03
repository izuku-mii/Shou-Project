import cmd from "../../commands/map.js";

cmd.add({
    name: /^(tesprem)$/i,
    isPrem: true,
    async run({
        m,
        args
    }) {
        m.reply("hmm")
    }
});