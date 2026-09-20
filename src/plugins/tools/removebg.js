import cmd from "../../commands/map.js";

async function pixa(buffer, filename = "image.jpg") {
    const form = new FormData();

    form.append(
        "image",
        new Blob([buffer], {
            type: "image/jpeg"
        }),
        filename
    );

    form.append("format", "png");
    form.append("model", "v1");

    const res = await fetch(
        "https://api2.pixelcut.app/image/matte/v1",
        {
            method: "POST",
            headers: {
                "User-Agent":
                    "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36",
                "Accept":
                    "application/json, text/plain, */*",
                "sec-ch-ua":
                    '"Chromium";v="139", "Not;A=Brand";v="99"',
                "x-locale": "en",
                "x-client-version":
                    "web:pixa.com:4a5b0af2",
                "sec-ch-ua-mobile": "?1",
                "sec-ch-ua-platform":
                    '"Android"',
                "origin":
                    "https://www.pixa.com",
                "sec-fetch-site":
                    "cross-site",
                "sec-fetch-mode":
                    "cors",
                "sec-fetch-dest":
                    "empty",
                "referer":
                    "https://www.pixa.com/",
                "accept-language":
                    "id-ID,id;q=0.9,en-AU;q=0.8,en;q=0.7,en-US;q=0.6"
            },
            body: form
        }
    );

    if (!res.ok) {
        throw new Error(
            `Pixa API ${res.status}: ${await res.text()}`
        );
    }

    return Buffer.from(
        await res.arrayBuffer()
    );
}

cmd.add({
    name: "removebg",
    alias: [
        "rmbg",
        "nobg"
    ],
    category: ["tools"],
    desc: "Remove background from image",
    usage: ".removebg",

    async run({ m, conn }) {
        const quoted = m.quoted;

        if (!quoted) {
            return m.reply(
                "Reply gambar dengan command .removebg"
            );
        }

        const mime =
            quoted.mimetype ||
            quoted.msg?.mimetype ||
            "";

        if (!/^image\//i.test(mime)) {
            return m.reply(
                "Yang direply harus berupa gambar"
            );
        }

        try {
            const buffer =
                await quoted.download();

            if (!buffer) {
                return m.reply(
                    "Gagal mengunduh gambar"
                );
            }

            const result = await pixa(
                buffer,
                "image.jpg"
            );

            await conn.sendMessage(
                m.chat,
                {
                    image: result,
                    mimetype: "image/png",
                    caption: "📷 Foto Nya Udah Di Remove Background Yah"
                },
                {
                    quoted: m
                }
            );

        } catch (error) {
            console.error(
                "[REMOVE-BG]",
                error
            );

            return m.reply(
                `❌ Gagal remove background\n\n${error.message}`
            );
        }
    }
});
