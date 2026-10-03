import cmd from "../../commands/map.js";
import { bind, toLid, toJid, normalizeNumber, getOwners, cleanJid, isLid, isPn, isOwnerMsg, learn } from "../../utils/identity.js";

const skip = (j) => !j || j.endsWith("@g.us") || j.endsWith("@broadcast") || j.endsWith("@newsletter");

// kumpulkan semua kandidat id dari pesan yang di-reply
function quotedIds(m) {
    const q = m.quoted;
    if (!q) return [];
    const k = q.key || {};
    const ctx =
        m.message?.extendedTextMessage?.contextInfo ||
        m.message?.imageMessage?.contextInfo ||
        m.message?.videoMessage?.contextInfo || {};
    learn(q);
    return [
        q.sender, q.senderAlt, q.quotedSender,
        k.participant, k.participantAlt,
        ctx.participant,
        m.quotedSender,
        !m.isGroup ? k.remoteJid : null
    ].filter(Boolean).map(cleanJid).filter(j => !skip(j));
}

// cari pasangan JID/LID di metadata grup
function fromGroup(m, id) {
    const parts = m.metadata?.participants || [];
    const c = cleanJid(id);
    const p = parts.find(x => [x.id, x.jid, x.lid, x.phoneNumber].filter(Boolean).map(cleanJid).includes(c));
    if (!p) return {};
    const pn = [p.phoneNumber, p.jid, p.id].map(v => v && cleanJid(v)).find(v => v && isPn(v));
    const lid = [p.lid, p.jid, p.id].map(v => v && cleanJid(v)).find(v => v && isLid(v));
    if (pn && lid) bind(pn, lid);
    return { pn, lid };
}

cmd.add({
    name: /^infolid$/i,
    alias: /^(infojid|lidinfo)$/i,
    category: ["info"],
    desc: "Info JID & LID (diri sendiri / reply / tag / nomor)",
    usage: ".infolid, reply pesan, .infolid @tag, .infolid 60123456789",
    async run({ m, args, sock: conn }) {
        const k = m.key || {};
        let ids = quotedIds(m);
        let self = false;

        if (!ids.length && m.mentionedJids?.length) ids = [cleanJid(m.mentionedJids[0])];
        if (!ids.length && args[0]) {
            const raw = args[0];
            ids = [raw.includes("@") ? cleanJid(raw) : normalizeNumber(raw) + "@s.whatsapp.net"];
        }
        if (!ids.length) {
            self = true;
            ids = [m.sender, m.senderAlt, k.participant, k.participantAlt, k.remoteJid, k.remoteJidAlt]
                .filter(Boolean).map(cleanJid).filter(j => !skip(j));
            learn(m);
        }
        if (!ids.length) return m.reply("Target tidak ditemukan. Reply pesan, tag, atau tulis nomor.");

        let pn = ids.find(isPn) || "";
        let lid = ids.find(isLid) || "";

        // lengkapi pasangan yang kurang
        for (const id of ids) {
            if (pn && lid) break;
            const g = fromGroup(m, id);
            pn ||= g.pn || "";
            lid ||= g.lid || "";
        }
        if (!pn && lid) { const j = toJid(lid, conn); if (isPn(j)) pn = j; }
        if (pn && !lid) lid = toLid(pn, conn);
        if (pn && lid) bind(pn, lid);

        const num = pn ? normalizeNumber(pn) : "";
        const owner = getOwners().find(o => (num && o.number === num) || (lid && o.lid === lid));
        const key = pn || lid;
        const u = global.db?.data?.users?.[key];
        const cc = num.startsWith("60") ? "Malaysia 🇲🇾" : num.startsWith("51") ? "Peru 🇵🇪" : num.startsWith("62") ? "Indonesia 🇮🇩" : num ? "Lainnya" : "-";

        const lines = [
            "*INFO LID*",
            `Nomor    : ${num || "(belum terpetakan)"}`,
            `Negara   : ${cc}`,
            `JID      : ${pn || "-"}`,
            `LID      : ${lid || "(belum terdeteksi)"}`,
            `Owner    : ${(self ? isOwnerMsg(m, conn) : Boolean(owner)) ? "Ya" : "Bukan"}${owner ? ` (${owner.name})` : ""}`,
            `Username : ${u?.username || u?.name || "-"}`,
            `Database : ${u ? "Ada" : "Belum ada"}${u?.registered ? " • terdaftar" : ""}`
        ];
        if (!pn || !lid) lines.push("", "_Pasangan JID/LID belum lengkap. Minta orangnya chat sekali di grup, atau pakai .setlid_");
        await m.reply(lines.join("\n"));
    }
});
