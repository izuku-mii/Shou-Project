import cmd from "../../commands/map.js";
import yts from "yt-search";
import { spawn } from "node:child_process";
import {
    access,
    mkdir,
    readdir,
    unlink
} from "node:fs/promises";
import path from "node:path";

const TMP = "./tmp";
const COOKIES = "./cookies.txt";
const YTDLP = "yt-dlp";

const exists = async file =>
    access(file)
        .then(() => true)
        .catch(() => false);

function isUrl(text) {
    try {
        const url = new URL(text);
        return /^https?:$/.test(url.protocol);
    } catch {
        return false;
    }
}

function formatDuration(seconds) {
    if (!Number.isFinite(Number(seconds))) {
        return "Unknown";
    }

    seconds = Math.floor(Number(seconds));

    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    if (h > 0) {
        return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    }

    return `${m}:${String(s).padStart(2, "0")}`;
}

function run(args) {
    return new Promise((resolve, reject) => {
        const process = spawn(YTDLP, args, {
            stdio: ["ignore", "pipe", "pipe"]
        });

        let stdout = "";
        let stderr = "";

        process.stdout.on("data", data => {
            stdout += data.toString();
        });

        process.stderr.on("data", data => {
            stderr += data.toString();
        });

        process.on("error", reject);

        process.on("close", code => {
            if (code !== 0) {
                reject(
                    new Error(
                        stderr.trim() ||
                        `yt-dlp exited with code ${code}`
                    )
                );
                return;
            }

            resolve({
                stdout,
                stderr
            });
        });
    });
}

async function searchYoutube(query) {
    const result = await yts(query);

    if (!result.videos?.length) {
        throw new Error(
            "Video YouTube tidak ditemukan."
        );
    }

    const video = result.videos[0];

    return {
        url: video.url,
        title: video.title,
        channel:
            video.author?.name ||
            "Unknown",
        duration:
            video.timestamp ||
            formatDuration(video.seconds),
        thumbnail:
            video.thumbnail ||
            null
    };
}

async function getMetadata(url, cookies) {
    const args = [
        "--dump-single-json",
        "--no-playlist",
        "--quiet",
        "--no-warnings",

        "--js-runtimes",
        "node",

        "--remote-components",
        "ejs:github",

        ...(cookies
            ? ["--cookies", COOKIES]
            : []),

        url
    ];

    const { stdout } = await run(args);

    let info;

    try {
        info = JSON.parse(stdout);
    } catch {
        throw new Error(
            "Gagal membaca metadata YouTube."
        );
    }

    return {
        title:
            info.title ||
            "Unknown",

        channel:
            info.channel ||
            info.uploader ||
            info.uploader_id ||
            "Unknown",

        duration:
            formatDuration(
                info.duration
            ),

        thumbnail:
            info.thumbnail ||
            null,

        height:
            Number(info.height || 0)
    };
}

async function downloadMp3(url, cookies) {
    const id =
        `ytmp3-${Date.now()}`;

    const output =
        path.resolve(
            TMP,
            `${id}.%(ext)s`
        );

    const args = [
        url,

        "-x",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",

        "--no-playlist",

        "--js-runtimes",
        "node",

        "--remote-components",
        "ejs:github",

        ...(cookies
            ? ["--cookies", COOKIES]
            : []),

        "-o",
        output
    ];

    await run(args);

    const files =
        await readdir(TMP);

    const file =
        files.find(
            name =>
                name.startsWith(`${id}.`) &&
                name.endsWith(".mp3")
        );

    if (!file) {
        throw new Error(
            "File MP3 tidak ditemukan."
        );
    }

    return path.resolve(
        TMP,
        file
    );
}

async function downloadMp4(url, cookies) {
    const id =
        `ytmp4-${Date.now()}`;

    const output =
        path.resolve(
            TMP,
            `${id}.%(ext)s`
        );

    const args = [
        url,

        "-f",
        "bestvideo[height<=1080][ext=mp4]+(bestaudio[ext=m4a]/bestaudio)/best[height<=1080][ext=mp4]/best",

        "--merge-output-format",
        "mp4",

        "--no-playlist",

        "--js-runtimes",
        "node",

        "--remote-components",
        "ejs:github",

        ...(cookies
            ? ["--cookies", COOKIES]
            : []),

        "-o",
        output
    ];

    await run(args);

    const files =
        await readdir(TMP);

    const file =
        files.find(
            name =>
                name.startsWith(`${id}.`) &&
                name.endsWith(".mp4")
        );

    if (!file) {
        throw new Error(
            "File MP4 tidak ditemukan."
        );
    }

    return path.resolve(
        TMP,
        file
    );
}

/**
 * Return value penting untuk handler limit:
 * - true  -> beneran berhasil kirim file, LIMIT BOLEH dipotong
 * - false -> gagal (error apapun), LIMIT JANGAN dipotong
 */
async function sendYoutubeMp3(
    m,
    conn,
    url
) {
    await mkdir(TMP, {
        recursive: true
    });

    const cookies =
        await exists(COOKIES);

    let file;

    try {
        const info =
            await getMetadata(
                url,
                cookies
            );

        file =
            await downloadMp3(
                url,
                cookies
            );

        await conn.adReply(
            m.chat,

`乂 *YouTube - Audio*

> *- Judul :* ${info.title}
> *- Channel :* ${info.channel}
> *- Durasi :* ${info.duration}`,

            info.title,

            `${info.channel} • ${info.duration}`,

            info.thumbnail,

            url,

            m
        );

        await conn.sendMessage(
            m.chat,
            {
                audio: {
                    url: file
                },
                mimetype: "audio/mpeg",
                ptt: false
            },
            {
                quoted: m
            }
        );

        return true;

    } catch (error) {
        console.error(
            "[YTMP3]",
            error
        );

        await m.reply(
            `❌ Gagal download YouTube.\n\n${error.message}`
        );

        return false;

    } finally {
        if (file) {
            await unlink(file)
                .catch(() => {});
        }
    }
}

async function sendYoutubeMp4(
    m,
    conn,
    url
) {
    await mkdir(TMP, {
        recursive: true
    });

    const cookies =
        await exists(COOKIES);

    let file;

    try {
        const info =
            await getMetadata(
                url,
                cookies
            );

        file =
            await downloadMp4(
                url,
                cookies
            );

        await conn.adReply(
            m.chat,

`乂 *YouTube - Video*

> *- Judul :* ${info.title}
> *- Channel :* ${info.channel}
> *- Durasi :* ${info.duration}
> *- Resolusi :* ${
    info.height
        ? `${info.height}p`
        : "Unknown"
}`,

            info.title,

            `${info.channel} • ${info.duration}`,

            info.thumbnail,

            url,

            m
        );

        await conn.sendMessage(
            m.chat,
            {
                video: {
                    url: file
                },
                mimetype: "video/mp4",
                caption: info.title
            },
            {
                quoted: m
            }
        );

        return true;

    } catch (error) {
        console.error(
            "[YTMP4]",
            error
        );

        await m.reply(
            `❌ Gagal download YouTube.\n\n${error.message}`
        );

        return false;

    } finally {
        if (file) {
            await unlink(file)
                .catch(() => {});
        }
    }
}

cmd.add({
    name: "ytmp3",

    alias: [
        "yta",
        "ytaudio",
        "youtube-dl-mp3"
    ],

    category: [
        "download"
    ],
    usage: ".ytmp3, .ytaudio, .youtube-dl-mp3 [url YouTube audio]",
    desc:
        "Download YouTube menjadi MP3",
    limit: true,
    async run({
        m,
        conn,
        text,
        prefix,
        command
    }) {
        if (!text?.trim()) {
            await m.reply(
                `Masukkan URL YouTube.\n\nContoh:\n${prefix}${command} https://youtu.be/xxxxxxx`
            );
            return false;
        }

        const url =
            text.trim();

        if (!isUrl(url)) {
            await m.reply(
                "URL YouTube tidak valid."
            );
            return false;
        }

        return sendYoutubeMp3(
            m,
            conn,
            url
        );
    }
});

cmd.add({
    name: "ytmp4",
    alias: [
        "ytvideo",
        "youtube-dl-mp4",
        "youtubevideo",
        "ytv" 
    ],
    category: [
        "download"
    ],
    usage: ".ytmp4, .ytvideo, .youtube-dl-mp4, .youtubevideo, .ytv [Url YouTube Audio]",
    desc:
        "Download YouTube menjadi MP4",
    limit: true,
    async run({
        m,
        conn,
        text,
        prefix,
        command
    }) {
        if (!text?.trim()) {
            await m.reply(
                `Masukkan URL YouTube.\n\nContoh:\n${prefix}${command} https://youtu.be/xxxxxxx`
            );
            return false;
        }

        const url =
            text.trim();

        if (!isUrl(url)) {
            await m.reply(
                "URL YouTube tidak valid."
            );
            return false;
        }

        return sendYoutubeMp4(
            m,
            conn,
            url
        );
    }
});

cmd.add({
    name: "play",
    alias: [
        "song",
        "music",
        "ytplay"
    ],
    category: [
        "download"
    ],
    usage: ".play, .song, .music, .ytplay [Query YouTube Audio]",
    desc:
        "Cari dan download lagu YouTube",
    limit: true,
    async run({
        m,
        conn,
        text,
        prefix,
        command
    }) {
        if (!text?.trim()) {
            await m.reply(
                `Masukkan judul lagu atau URL YouTube.\n\nContoh:\n${prefix}${command} shape of you`
            );
            return false;
        }

        let url =
            text.trim();

        try {
            if (!isUrl(url)) {
                const result =
                    await searchYoutube(
                        url
                    );

                url =
                    result.url;
            }

            return sendYoutubeMp3(
                m,
                conn,
                url
            );

        } catch (error) {
            console.error(
                "[PLAY]",
                error
            );

            await m.reply(
                `❌ Gagal mencari/download.\n\n${error.message}`
            );

            return false;
        }
    }
});