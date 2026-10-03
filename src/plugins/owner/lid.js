import cmd from "../../commands/map.js";
import { bind, toLid, toJid, normalizeNumber, getOwners, cleanJid, isLid } from "../../utils/identity.js";

cmd.add({
    name: /^(myid|cekid)$/i,
    alias: /^(lid)$/i,
    category: ["info"],
    desc: "Lihat JID & LID kamu (buat daftar owner)",
    async run({ m, sock: conn }) {
        const k = m.key || {};
        const raw = [
            ["sender", m.sender],
            ["participant", k.participant],
            ["participantAlt", k.participantAlt],
            ["remoteJid", k.remoteJid],
            ["remoteJidAlt", k.remoteJidAlt]
        ].filter(([, v]) => v);
        const lid = raw.map(([, v]) => v).find(v => isLid(v)) || toLid(m.sender, conn);
        const jid = toJid(m.sender, conn);
        await m.reply(
            `*ID KAMU*\n` +
            `JID : ${jid}\n` +
            `LID : ${lid || "(belum terdeteksi)"}\n\n` +
            raw.map(([a, b]) => `${a}: ${b}`).join("\n")
        );
    }
});

cmd.add({
    name: /^(setlid)$/i,
    category: ["owner"],
    isOwner: true,
    usage: ".setlid 60123456789 123456789012345@lid",
    desc: "Hubungkan nomor (Malaysia/Peru/dll) ke LID-nya",
    async run({ m, args }) {
        const [num, lidRaw] = args;
        if (!num || !lidRaw) return m.reply("Format: .setlid <nomor> <lid>\nContoh: .setlid 60123456789 123456789012345@lid");
        const lid = cleanJid(lidRaw.includes("@") ? lidRaw : `${lidRaw}@lid`);
        const n = normalizeNumber(num);
        if (!bind(n, lid)) return m.reply("Nomor / LID tidak valid.");
        const isOwnerNum = getOwners().some(o => o.number === n);
        await m.reply(`Ok.\n${n} ➜ ${lid}\n${isOwnerNum ? "Nomor ini ada di OWNER." : "Nomor ini belum ada di OWNER (.env)."}`);
    }
});

cmd.add({
    name: /^(listowner|ownerlist)$/i,
    category: ["owner"],
    isOwner: true,
    desc: "Daftar owner + LID",
    async run({ m, sock: conn }) {
        const list = getOwners().map(o => `• ${o.name} — ${o.number}\n   LID: ${o.lid || toLid(o.number, conn) || "-"}`);
        await m.reply(list.join("\n") || "OWNER kosong.");
    }
});
