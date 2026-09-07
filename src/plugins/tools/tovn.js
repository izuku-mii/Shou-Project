import cmd from "../../commands/map.js";
import { spawn } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { writeFile, unlink, readFile } from "fs/promises";
import { randomBytes } from "crypto";
import { downloadMediaMessage } from "baileys";
cmd.add({
    name: "tovn",
    alias: ["tovoice", "tomp3vn"],
    category: ["tools"],
    desc: "Convert audio/video to voice note (opus/ogg) with waveform",
    usage: "Reply to an audio/video message with .tovn",
    example: "Reply to an audio file with .tovn",
    async run({ m, sock }) {
        if (!m.quoted)
            return m.reply("Balas pesan audio/video yang ingin dikonversi.");
        const quotedMessage = m.quoted?.message;
        const messageType = m?.quoted?.type;
        const mime = quotedMessage && messageType && quotedMessage[messageType]?.mimetype || "";
        if (!m?.quoted?.isMedia || !/audio|video/.test(mime))
            return m.reply("File yang dibalas bukan audio/video.");
        try {
            const buffer = await downloadMediaMessage(m?.quoted, "buffer", {}, { reuploadRequest: sock.waUploadToServer, logger: sock.logger || console });
            const tempInput = join(tmpdir(), randomBytes(6).toString("hex") + getExtension(mime));
            const tempOutput = join(tmpdir(), randomBytes(6).toString("hex") + ".ogg");
            await writeFile(tempInput, buffer);
            await convertToOpus(tempInput, tempOutput);
            const result = await readFile(tempOutput);
            const waveform = generateWaveform(result, 64);
            await sock.sendMessage(m.chat, {
                audio: result,
                mimetype: "audio/ogg; codecs=opus",
                ptt: true,
                waveform: new Uint16Array(waveform),
            }, { quoted: m });
            await Promise.all([
                unlink(tempInput).catch(() => null),
                unlink(tempOutput).catch(() => null),
            ]);
        }
        catch (err) {
            console.error(err);
            m.reply("Gagal mengonversi audio.");
        }
    },
});
function convertToOpus(input, output) {
    return new Promise((resolve, reject) => {
        const ffmpeg = spawn("ffmpeg", [
            "-y",
            "-i", input,
            "-vn",
            "-c:a", "libopus",
            "-b:a", "128k",
            output,
        ]);
        ffmpeg.on("close", (code) => {
            if (code === 0)
                resolve();
            else
                reject(new Error(`ffmpeg exited with code ${code}`));
        });
    });
}
function generateWaveform(buffer, bars = 64) {
    const samples = new Int16Array(buffer.buffer, buffer.byteOffset, buffer.length / 2);
    const chunkSize = Math.floor(samples.length / bars);
    const waveform = [];
    for (let i = 0; i < bars; i++) {
        const start = i * chunkSize;
        const end = start + chunkSize;
        const slice = samples.slice(start, end);
        const rms = Math.sqrt(slice.reduce((a, b) => a + b * b, 0) / slice.length);
        const normalized = Math.min(65535, Math.floor((rms / 32768) * 65535));
        waveform.push(normalized);
    }
    return waveform;
}
function getExtension(mime) {
    if (mime.includes("mp4"))
        return ".mp4";
    if (mime.includes("webm"))
        return ".webm";
    if (mime.includes("m4a"))
        return ".m4a";
    if (mime.includes("ogg"))
        return ".ogg";
    if (mime.includes("mp3"))
        return ".mp3";
    return ".dat";
}
