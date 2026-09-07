import cmd from "../../commands/map.js";
import {
    join,
    resolve,
    dirname,
    relative,
    extname,
    normalize
} from "path";
import {
    readFile,
    writeFile,
    readdir,
    unlink,
    mkdir,
    stat
} from "fs/promises";
import { existsSync } from "fs";
import { spawn } from "child_process";

const PLUGINS_DIR = resolve("./src/plugins");
const DIST_DIR = resolve("./dist/plugins");

/* =========================
 * PATH SECURITY
 * ========================= */

function safePluginPath(fileName) {
    if (!fileName) return null;

    fileName = fileName
        .replace(/\\/g, "/")
        .replace(/^\/+/, "")
        .trim();

    if (
        !fileName ||
        fileName.includes("..") ||
        fileName.includes("\0")
    ) {
        return null;
    }

    const fullPath = resolve(PLUGINS_DIR, fileName);

    const root = resolve(PLUGINS_DIR);
    if (
        fullPath !== root &&
        !fullPath.startsWith(root + "/")
    ) {
        return null;
    }

    return fullPath;
}

/* =========================
 * GET ALL PLUGINS
 * ========================= */

async function getAllPlugins(dir = PLUGINS_DIR, result = []) {
    if (!existsSync(dir)) return result;

    const files = await readdir(dir, {
        withFileTypes: true
    });

    for (const entry of files) {
        const fullPath = join(dir, entry.name);

        if (entry.isDirectory()) {
            await getAllPlugins(fullPath, result);
            continue;
        }

        if (
            entry.name.endsWith(".js") ||
            entry.name.endsWith(".ts") ||
            entry.name.endsWith(".mjs") ||
            entry.name.endsWith(".cjs")
        ) {
            result.push(
                relative(PLUGINS_DIR, fullPath)
                    .replace(/\\/g, "/")
            );
        }
    }

    return result.sort();
}

/* =========================
 * VALIDATE PLUGIN
 * ========================= */

async function validatePluginPath(fileName) {
    const fullPath = safePluginPath(fileName);

    if (!fullPath) {
        throw new Error(
            "Invalid path. '..' and paths outside plugins directory are not allowed."
        );
    }

    const ext = extname(fileName).toLowerCase();

    if (![".js", ".ts", ".mjs", ".cjs"].includes(ext)) {
        throw new Error(
            "Plugin harus menggunakan ekstensi .js, .ts, .mjs, atau .cjs"
        );
    }

    return fullPath;
}

/* =========================
 * COMPILE TS
 * ========================= */

async function compilePluginFile(fileName) {
    if (!fileName.endsWith(".ts")) return;

    const tsFilePath = await validatePluginPath(fileName);

    if (!existsSync(tsFilePath)) {
        throw new Error(
            `TypeScript file ${fileName} tidak ditemukan`
        );
    }

    const relativeDir = dirname(
        relative(PLUGINS_DIR, tsFilePath)
    );

    const outputDir =
        relativeDir === "."
            ? DIST_DIR
            : resolve(DIST_DIR, relativeDir);

    await mkdir(outputDir, {
        recursive: true
    });

    return new Promise((resolvePromise, reject) => {
        const processTsc = spawn(
            "npx",
            [
                "tsc",
                tsFilePath,
                "--outDir",
                outputDir,
                "--target",
                "es2020",
                "--module",
                "esnext",
                "--skipLibCheck",
                "--esModuleInterop",
                "--allowJs",
                "false"
            ],
            {
                cwd: process.cwd(),
                stdio: ["ignore", "pipe", "pipe"]
            }
        );

        let stdout = "";
        let stderr = "";

        processTsc.stdout.on("data", data => {
            stdout += data.toString();
        });

        processTsc.stderr.on("data", data => {
            stderr += data.toString();
        });

        processTsc.on("error", reject);

        processTsc.on("close", code => {
            if (code === 0) {
                resolvePromise({
                    stdout,
                    stderr
                });
            } else {
                reject(
                    new Error(
                        `Compilation failed with code ${code}\n${stderr || stdout}`
                    )
                );
            }
        });
    });
}

/* =========================
 * COMMAND
 * ========================= */

cmd.add({
    name: "plugins",
    alias: ["plug"],
    category: ["owner"],
    desc: "Manage plugin files",
    usage:
        ".plugins | .plugins --get [path] | .plugins --save [path] [code] | .plugins --delete [path]",
    example:
        ".plugins\n" +
        ".plugins --get owner/plugins.js\n" +
        ".plugins --save owner/test.js console.log('test')\n" +
        ".plugins --delete owner/test.js",
    isOwner: true,

    async run({ m, sock, text }) {
        text = text?.trim() || "";

        /* =========================
         * LIST
         * ========================= */

        if (!text) {
            try {
                await mkdir(PLUGINS_DIR, {
                    recursive: true
                });

                const plugins = await getAllPlugins();

                if (!plugins.length) {
                    return m.reply(
                        "📂 Tidak ada plugin ditemukan."
                    );
                }

                const list = plugins
                    .map((file, index) => {
                        const ext = extname(file);

                        let icon = "📄";

                        if (ext === ".js") icon = "🟨";
                        if (ext === ".ts") icon = "🔷";
                        if (ext === ".mjs") icon = "🟩";
                        if (ext === ".cjs") icon = "🟪";

                        return `${index + 1}. ${icon} ${file}`;
                    })
                    .join("\n");

                return m.reply(
                    `📂 *PLUGIN LIST*\n\n` +
                    `${list}\n\n` +
                    `Total: *${plugins.length} plugin*\n\n` +
                    `📥 Get:\n` +
                    `.plugins --get owner/plugins.js\n\n` +
                    `💾 Save:\n` +
                    `.plugins --save owner/test.js kode\n` +
                    `atau reply kode lalu:\n` +
                    `.plugins --save owner/test.js\n\n` +
                    `🗑️ Delete:\n` +
                    `.plugins --delete owner/test.js`
                );
            } catch (error) {
                console.error("Plugin list error:", error);

                return m.reply(
                    `❌ Gagal mengambil list plugin:\n${error.message}`
                );
            }
        }

        /* =========================
         * GET
         * ========================= */

        if (/^--get\b/i.test(text)) {
            const fileName = text
                .replace(/^--get\b/i, "")
                .trim();

            if (!fileName) {
                return m.reply(
                    "Masukkan path plugin.\n\n" +
                    "Contoh:\n" +
                    ".plugins --get owner/plugins.js"
                );
            }

            try {
                const filePath =
                    await validatePluginPath(fileName);

                if (!existsSync(filePath)) {
                    return m.reply(
                        `❌ Plugin *${fileName}* tidak ditemukan.`
                    );
                }

                const buffer = await readFile(filePath);

                return await sock.sendMessage(
                    m.chat,
                    {
                        document: buffer,
                        fileName: fileName.split("/").pop(),
                        mimetype:
                            extname(fileName) === ".ts"
                                ? "text/typescript"
                                : "text/javascript",
                        caption:
                            `📄 *${fileName}*\n\n` +
                            "```" +
                            buffer.toString("utf8") +
                            "```"
                    },
                    {
                        quoted: m
                    }
                );
            } catch (error) {
                console.error("Plugin get error:", error);

                return m.reply(
                    `❌ Gagal mengambil plugin:\n${error.message}`
                );
            }
        }

        /* =========================
         * SAVE
         * ========================= */

        if (/^--save\b/i.test(text)) {
            const saveText = text
                .replace(/^--save\b/i, "")
                .trim();

            if (!saveText) {
                return m.reply(
                    "Masukkan nama/path plugin.\n\n" +
                    "Contoh:\n" +
                    ".plugins --save owner/test.js console.log('test')"
                );
            }

            /*
             * Ambil path plugin.
             * Sisanya dianggap sebagai code.
             */
            const match = saveText.match(
                /^(\S+)(?:\s+([\s\S]*))?$/
            );

            if (!match) {
                return m.reply(
                    "Format save tidak valid."
                );
            }

            const fileName = match[1];

            /*
             * Jika ada quoted message,
             * quoted.text menjadi prioritas.
             *
             * Jika tidak ada quoted,
             * ambil code dari command.
             */
            let code = "";

            if (m.quoted?.text) {
                code = m.quoted.text.trim();
            } else {
                code = match[2]?.trim() || "";
            }

            if (!code) {
                return m.reply(
                    "❌ Tidak ada kode plugin.\n\n" +
                    "Gunakan:\n" +
                    ".plugins --save owner/test.js console.log('test')\n\n" +
                    "atau reply kode kemudian:\n" +
                    ".plugins --save owner/test.js"
                );
            }

            try {
                const filePath =
                    await validatePluginPath(fileName);

                const dirPath = dirname(filePath);

                await mkdir(dirPath, {
                    recursive: true
                });

                /*
                 * SIMPAN PLUGIN
                 */
                await writeFile(
                    filePath,
                    code,
                    "utf8"
                );

                /*
                 * Pastikan benar-benar ada
                 */
                if (!existsSync(filePath)) {
                    throw new Error(
                        "File gagal dibuat."
                    );
                }

                let message =
                    `✅ *Plugin berhasil disimpan!*\n\n` +
                    `📄 File: \`${fileName}\`\n` +
                    `📦 Size: ${Buffer.byteLength(code, "utf8")} bytes`;

                /*
                 * Compile TypeScript
                 */
                if (fileName.endsWith(".ts")) {
                    try {
                        await compilePluginFile(fileName);

                        message +=
                            `\n🔷 TypeScript: *compiled*`;
                    } catch (compileError) {
                        message +=
                            `\n⚠️ Compile gagal:\n${compileError.message}`;
                    }
                }

                message +=
                    `\n\n🔄 Plugin sudah tersimpan di:\n` +
                    `\`${filePath}\``;

                return m.reply(message);
            } catch (error) {
                console.error("Plugin save error:", error);

                return m.reply(
                    `❌ Gagal menyimpan plugin:\n${error.message}`
                );
            }
        }

        /* =========================
         * DELETE
         * ========================= */

        if (/^--delete\b/i.test(text)) {
            const fileName = text
                .replace(/^--delete\b/i, "")
                .trim();

            if (!fileName) {
                return m.reply(
                    "Masukkan path plugin.\n\n" +
                    "Contoh:\n" +
                    ".plugins --delete owner/test.js"
                );
            }

            try {
                const filePath =
                    await validatePluginPath(fileName);

                if (!existsSync(filePath)) {
                    return m.reply(
                        `❌ Plugin *${fileName}* tidak ditemukan.`
                    );
                }

                const content =
                    await readFile(filePath, "utf8");

                const preview =
                    content.length > 500
                        ? content.slice(0, 500) + "\n..."
                        : content;

                await unlink(filePath);

                /*
                 * Jika TS, hapus hasil JS compile.
                 */
                if (fileName.endsWith(".ts")) {
                    const relativeDir =
                        dirname(fileName);

                    const compiledName =
                        fileName.replace(
                            /\.ts$/,
                            ".js"
                        );

                    const compiledPath =
                        resolve(
                            DIST_DIR,
                            compiledName
                        );

                    if (existsSync(compiledPath)) {
                        await unlink(compiledPath);
                    }
                }

                return m.reply(
                    `🗑️ *Plugin berhasil dihapus!*\n\n` +
                    `📄 File: \`${fileName}\`\n\n` +
                    `Preview:\n` +
                    "```" +
                    preview +
                    "```"
                );
            } catch (error) {
                console.error(
                    "Plugin delete error:",
                    error
                );

                return m.reply(
                    `❌ Gagal menghapus plugin:\n${error.message}`
                );
            }
        }

        /* =========================
         * HELP
         * ========================= */

        return m.reply(
            `📚 *PLUGIN MANAGER*\n\n` +

            `📋 List plugin\n` +
            `.plugins\n\n` +

            `📥 Ambil plugin\n` +
            `.plugins --get owner/plugins.js\n\n` +

            `💾 Simpan plugin\n` +
            `.plugins --save owner/test.js console.log("test")\n\n` +

            `💾 Simpan dari reply\n` +
            `.plugins --save owner/test.js\n\n` +

            `🗑️ Hapus plugin\n` +
            `.plugins --delete owner/test.js`
        );
    }
});