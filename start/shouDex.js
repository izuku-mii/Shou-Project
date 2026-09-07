console.log('🐾 Starting...');

import { Worker } from 'worker_threads';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { watchFile, unwatchFile } from 'fs';
import readline from 'readline';

import {
    mkdir,
    chmod,
    rename,
    access,
    writeFile
} from 'node:fs/promises';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerFile = join(__dirname, 'shouConnect.js');

const HOME = process.env.HOME || '/root';
const BIN_DIR = `${HOME}/.local/bin`;
const YTDLP_PATH = `${BIN_DIR}/yt-dlp`;

async function exists(file) {
    try {
        await access(file);
        return true;
    } catch {
        return false;
    }
}

async function setupYtdlp() {
    await mkdir(BIN_DIR, {
        recursive: true
    });

    if (!(await exists(YTDLP_PATH))) {
        const res = await fetch(
            'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux'
        );

        if (!res.ok) {
            throw new Error(
                `Gagal download yt-dlp: ${res.status}`
            );
        }

        const buffer = Buffer.from(
            await res.arrayBuffer()
        );

        const temp = `${BIN_DIR}/yt-dlp.tmp`;

        await writeFile(temp, buffer);

        await chmod(temp, 0o755);

        await rename(
            temp,
            YTDLP_PATH
        );
    }

    await chmod(
        YTDLP_PATH,
        0o755
    );

    process.env.PATH =
        `${BIN_DIR}:${process.env.PATH || ''}`;

    return YTDLP_PATH;
}

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

let worker = null;
let restartTimer = null;
let restarting = false;

function normalizePhone(input) {
    return String(input || '').replace(/\D/g, '');
}

function spawn() {
    if (worker) return;

    const w = new Worker(workerFile);
    worker = w;
    restarting = false;

    w.on('message', async (msg) => {
        if (!msg) return;

        if (msg.type === 'connected') {
            console.log('✅ Connected');
            return;
        }

        if (msg.type === 'pairing-required') {
            rl.question('Nomor: ', (input) => {
                const phoneNumber = normalizePhone(input);

                if (!phoneNumber) {
                    console.log('❌ Nomor tidak valid');
                    return;
                }

                worker?.postMessage({
                    type: 'pairing',
                    phoneNumber
                });
            });
            return;
        }

        if (msg.type === 'pairing-code') {
            console.log(`🔑 Pairing Code: ${msg.code}`);
            return;
        }

        if (msg.type === 'pairing-error') {
            console.error('❌ Pairing Error:', msg.error);
            return;
        }

        if (msg === 'restart' || msg === 'reset') {
            restart();
            return;
        }

        console.log('[MESSAGE]', msg);
    });

    w.on('error', (error) => {
        console.error('❌ Worker Error:', error);
    });

    w.on('exit', (code) => {
        if (w !== worker) return;

        worker = null;

        console.log('❗ Worker exited with code', code);

        if (code !== 0 && !restarting) {
            restartTimer = setTimeout(() => {
                restartTimer = null;
                console.log('⏳ Auto restart...');
                spawn();
            }, 5000);
        }
    });
}

function restart() {
    if (restarting) return;

    restarting = true;

    if (restartTimer) {
        clearTimeout(restartTimer);
        restartTimer = null;
    }

    const old = worker;
    worker = null;

    if (old) {
        old.terminate().catch(() => {});
    }

    setTimeout(() => {
        restarting = false;
        spawn();
    }, 1000);
}

function shutdown() {
    const old = worker;

    if (!old) {
        process.exit(0);
        return;
    }

    worker = null;

    old.postMessage('shutdown');

    setTimeout(() => {
        old.terminate().catch(() => {});
        process.exit(0);
    }, 3000);
}

watchFile(workerFile, { interval: 1000 }, () => {
    console.log('♻️ ShouConnect.js diubah → restart...');
    restart();
});

rl.on('line', (line) => {
    const cmd = line.trim().toLowerCase();

    if (!cmd) return;

    if (cmd === 'exit') {
        console.log('⛔ Exiting...');
        shutdown();
        return;
    }

    if (cmd === 'restart' || cmd === 'reset') {
        console.log('🍃 Restart...');
        restart();
    }
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

await setupYtdlp();

spawn();