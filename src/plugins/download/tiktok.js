import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import tt from "../../scrape/tiktok.js";
import cmd from "../../commands/map.js";

function run(command, args = []) {
    return new Promise((resolve, reject) => {
        const p = spawn(command, args, {
            stdio: ["ignore", "pipe", "pipe"]
        });

        let stderr = "";

        p.stderr.on("data", d => {
            stderr += d.toString();
        });

        p.on("error", reject);

        p.on("close", code => {
            if (code !== 0) {
                reject(
                    new Error(
                        stderr.trim() ||
                        `Process exited with code ${code}`
                    )
                );
            } else {
                resolve();
            }
        });
    });
}

async function downloadFile(url, file) {
    const res = await fetch(url);

    if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
    }

    const buffer = Buffer.from(
        await res.arrayBuffer()
    );

    fs.mkdirSync(
        path.dirname(file),
        { recursive: true }
    );

    fs.writeFileSync(file, buffer);

    return buffer.length;
}

async function convertToJpg(input, output) {
    await run("ffmpeg", [
        "-y",
        "-i",
        input,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        output
    ]);
}

cmd.add({
    name: /^(tiktok)$/i,
    alias: /^(tt|ttdl)$/i,
    limit: true,
    category: ["download"],
    usage: ".tiktok .tt, .ttdl [Url Tiktok Support Video/Image]",

    async run({
        m,
        sock,
        args
    }) {
        const text = args[0] || "";

        if (!text.includes("tiktok")) {
            return m.reply(
                "Masukkan Url Tiktok\n\nContoh: .tiktok https://vt.tiktok.com/ZSq8Pso5D/"
            );
        }

        try {
            const {
                data: u,
                client
            } = await tt.scrapeTikTok(text);

            const r = `乂 *Tiktok Downloader*

> *- Caption:* ${u.desc || ""}
> *- Time :* ${u.createTimeISO || ""}
> *- Name Account :* ${u.author?.nickname || ""}
> *- Username :* ${u.author?.uniqueId || ""}
> *- Type :* ${u.isSlideshow ? "Image" : "video"}
> *- Url :* ${u?.originalUrl || ""}`;

            await m.reply(r);

            if (u.isSlideshow || u.images?.length) {
                if (!u.images?.length) {
                    return m.reply(
                        "Tidak ada gambar di slideshow"
                    );
                }

                const dir = path.join(
                    "tmp",
                    `tiktok-${u.id}`
                );

                fs.mkdirSync(dir, {
                    recursive: true
                });

                const album = [];

                for (
                    let i = 0;
                    i < u.images.length;
                    i++
                ) {
                    const image = u.images[i];

                    const num = String(i + 1)
                        .padStart(3, "0");

                    const ext =
                        image.url.match(
                            /\.(jpe?g|png|webp|heic|heif)(?:\?|$)/i
                        )?.[1]
                        ?.toLowerCase() || "heic";

                    const input = path.join(
                        dir,
                        `${num}.${ext}`
                    );

                    const output = path.join(
                        dir,
                        `${num}.jpg`
                    );

                    try {
                        await downloadFile(
                            image.url,
                            input
                        );

                        if (
                            ext === "heic" ||
                            ext === "heif"
                        ) {
                            await convertToJpg(
                                input,
                                output
                            );

                            fs.unlinkSync(input);
                        } else if (
                            ext === "jpg" ||
                            ext === "jpeg"
                        ) {
                            fs.renameSync(
                                input,
                                output
                            );
                        } else {
                            await convertToJpg(
                                input,
                                output
                            );

                            fs.unlinkSync(input);
                        }

                        album.push({
                            image: {
                                url: output
                            }
                        });

                    } catch (e) {
                        console.error(
                            `Gambar ${i + 1}:`,
                            e.message
                        );

                        if (
                            fs.existsSync(input)
                        ) {
                            fs.unlinkSync(input);
                        }

                        if (
                            fs.existsSync(output)
                        ) {
                            fs.unlinkSync(output);
                        }
                    }
                }

                if (!album.length) {
                    return m.reply(
                        "Semua gambar gagal diproses"
                    );
                }

                await sock.sendAlbumMessage(
                    m.chat,
                    album,
                    {
                        quoted: m
                    }
                );

                return;
            }

            if (!u.video?._urls?.length) {
                return m.reply(
                    "Tidak ada URL video"
                );
            }

            const videoPath = path.join(
                "tmp",
                `${u.id}.mp4`
            );

            await tt.downloadVideo(
                u.video._urls,
                videoPath,
                client
            );

            await sock.sendMessage(
                m.chat,
                {
                    video: {
                        url: videoPath
                    }
                },
                {
                    quoted: m
                }
            );

        } catch (e) {
            console.error(e);

            return m.reply(
                `❌ Error: ${e.message}`
            );
        }
    }
});