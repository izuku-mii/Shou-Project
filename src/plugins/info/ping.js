import cmd from "../../commands/map.js";
import os from "os";
import { performance } from "perf_hooks";
cmd.add({
    name: "ping",
    alias: ["pong", "latency"],
    category: ["info"],
    desc: "Check bot response time and detailed system information",
    usage: ".ping",
    example: ".ping",
    async run({ m }) {
        const start = performance.now();
        const hostname = os.hostname();
        const platform = os.platform();
        const arch = os.arch();
        const release = os.release();
        const type = os.type();
        const cpus = os.cpus();
        const cpuModel = cpus[0]?.model;
        const cpuCores = cpus.length;
        const cpuSpeed = cpus[0]?.speed;
        const loadAvg = os
            .loadavg()
            .map((v) => v.toFixed(2))
            .join(", ");
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        const usedMem = totalMem - freeMem;
        const percentUsed = (usedMem / totalMem) * 100;
        const makeBar = (percent, size = 20) => {
            const filled = Math.round((percent / 100) * size);
            const empty = size - filled;
            return ("[" +
                "#".repeat(filled) +
                "-".repeat(empty) +
                `] ${percent.toFixed(2)}%`);
        };
        const uptimeSec = os.uptime();
        const days = Math.floor(uptimeSec / 86400);
        const hours = Math.floor((uptimeSec % 86400) / 3600);
        const minutes = Math.floor((uptimeSec % 3600) / 60);
        const seconds = Math.floor(uptimeSec % 60);
        const uptimeFormatted = `${days} hari, ${hours} jam, ${minutes} menit, ${seconds} detik`;
        const latency = (performance.now() - start).toFixed(2);
        const toMB = (b) => (b / 1024 / 1024).toFixed(2);
        const msg = [
            `Pong!`,
            `Latency : ${latency} ms`,
            ``,
            `=== System Info ===`,
            `Hostname : ${hostname}`,
            `Platform : ${platform} (${type})`,
            `Arch     : ${arch}`,
            `OS Ver   : ${release}`,
            ``,
            `=== CPU Info ===`,
            `Model : ${cpuModel}`,
            `Cores : ${cpuCores}`,
            `Speed : ${cpuSpeed} MHz`,
            `Load  : ${loadAvg}`,
            ``,
            `=== Memory Info ===`,
            `Total : ${toMB(totalMem)} MB`,
            `Used  : ${toMB(usedMem)} MB`,
            `Free  : ${toMB(freeMem)} MB`,
            `Usage : ${makeBar(percentUsed)}`,
            ``,
            `=== Uptime ===`,
            uptimeFormatted,
            ``,
        ].join("\n");
        m.reply("```" + msg + "```");
    },
});
