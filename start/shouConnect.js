// start/shouConnect.js  — versi zapo-js
'use strict';

import dotenv from 'dotenv';
dotenv.config();

import { parentPort } from 'worker_threads';
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

import { WaClient, ConsoleLogger, createStore as createZapoStore } from 'zapo-js';
import { createSqliteStore } from '@zapo-js/store-sqlite';
import { createMediaProcessor } from '@zapo-js/media-utils';

import { jidNormalizedUser } from '../src/zapo/shim.js';
import { wrapClient, mapGroupMetadata, isBotSent } from '../src/zapo/compat.js';
import { toWAMessage } from '../src/zapo/serialize.js';

import makeWASocket from '../src/utils/socket.js';
import { procMsg } from '../src/utils/msg.js';
import { ensureOwnerDb, learn as learnLid, bind as bindOwnId } from '../src/utils/identity.js';
import { trackMedia } from '../src/utils/albumStore.js';
import { prMsg } from '../src/utils/fmt.js';

import { createStore } from '../src/utils/database.js';
import { makeInStore } from '../src/utils/store.js';

const { default: CmdRegis } = await import('../src/commands/register.js');

try {
    await CmdRegis.load();
    await CmdRegis.watch();
} catch (error) {
    console.error('Error loading or watching commands:', error);
}

import handler from '../src/commands/handler.js';

/* DATABASE */
global.db = {
    sqlite: null,
    data: null,
    stores: null,
    flush: null
};

global.loadDatabase = function () {
    if (!global.db.sqlite) {
        const dbFile = path.resolve('./data/database.db');

        fs.mkdirSync(path.dirname(dbFile), { recursive: true });

        global.db.sqlite = new Database(dbFile);

        global.db.sqlite.pragma('journal_mode = WAL');
        global.db.sqlite.pragma('synchronous = NORMAL');
        global.db.sqlite.pragma('wal_autocheckpoint = 1000');
    }

    if (global.db.data !== null) {
        return;
    }

    const stores = createStore(global.db.sqlite);

    global.db.stores = stores;

    global.db.data = {
        users: stores.users.proxy,
        chats: stores.chats.proxy,
        stats: stores.stats.proxy,
        sticker: stores.sticker.proxy,
        settings: stores.settings.proxy,
        guilds: stores.guilds.proxy,
        market: stores.market.proxy
    };

    global.db.flush = () => {
        for (const store of Object.values(stores)) {
            try {
                store.flush();
            } catch (error) {
                console.error('[DB FLUSH]', error);
            }
        }
    };

    const hasOld = global.db.sqlite
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'database'")
        .get();

    if (hasOld) {
        const row = global.db.sqlite
            .prepare('SELECT data FROM database WHERE id = 1')
            .get();

        if (row?.data) {
            try {
                const data = JSON.parse(row.data);

                for (const key of [
                    'users',
                    'chats',
                    'settings',
                    'stats',
                    'sticker',
                    'guilds',
                    'market'
                ]) {
                    if (!global.db.data[key]) {
                        continue;
                    }

                    for (const [id, value] of Object.entries(data[key] || {})) {
                        if (!(id in global.db.data[key])) {
                            global.db.data[key][id] = value;
                        }
                    }
                }
            } catch (error) {
                console.error('[DB] migrasi blob gagal:', error);
            }
        }

        global.db.sqlite.exec('DROP TABLE IF EXISTS database');
    }
};

global.loadDatabase();
ensureOwnerDb();

/* AUTO FLUSH */
setInterval(() => {
    try {
        global.db?.flush?.();
    } catch (error) {
        console.error('[DB AUTO FLUSH]', error);
    }
}, 5000);

let whatsapp = null;
let store = null;
let shuttingDown = false;
let pairingRequested = false;
let pairingReady = false;
let pairingPrompted = false;
let pairingInFlight = false;
let pendingPhone = null;
let lastCode = null;

function sendPairingCode(code) {
    if (!code || code === lastCode) return;

    lastCode = code;

    const pretty = String(code).match(/.{1,4}/g)?.join('-') || code;

    parentPort?.postMessage({ type: 'pairing-code', code: pretty });
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function normalizePhone(input) {
    return String(input || '').replace(/\D/g, '');
}

/* DATABASE USER */
function ensureUser(m) {
    if (!m?.sender) {
        return;
    }

    const jid = jidNormalizedUser(m.sender);

    if (!global.db.data.users[jid]) {
        global.db.data.users[jid] = {
            id: jid,
            name: m.pushName || m.senderName || '',
            registered: false,
            limit: 0,
            exp: 0,
            level: 0
        };

        return;
    }

    const user = global.db.data.users[jid];

    if (typeof user.id === 'undefined') {
        user.id = jid;
    }

    if (m.pushName && !user.name) {
        user.name = m.pushName;
    }
}

/* DATABASE CHAT/GROUP */
function ensureChat(m) {
    if (!m?.chat) {
        return;
    }

    const jid = jidNormalizedUser(m.chat);

    if (!global.db.data.chats[jid]) {
        global.db.data.chats[jid] = {
            id: jid,
            isGroup: Boolean(m.isGroup),
            name: m.isGroup
                ? (m.metadata?.subject || '')
                : (m.pushName || m.senderName || ''),
            ephemeralDuration: m.metadata?.ephemeralDuration || 0
        };
    }

    const chat = global.db.data.chats[jid];

    chat.id ??= jid;
    chat.isGroup = Boolean(m.isGroup);

    if (m.isGroup) {
        if (m.metadata?.subject) {
            chat.name = m.metadata.subject;
        }

        if (m.metadata) {
            chat.metadata = m.metadata;
            chat.ephemeralDuration = m.metadata.ephemeralDuration || 0;
        }
    } else if (m.pushName || m.senderName) {
        chat.name ??= m.pushName || m.senderName || '';
    }
}

/* STATS */
function ensureStats(m) {
    if (!m?.sender) {
        return;
    }

    const jid = jidNormalizedUser(m.sender);

    if (!global.db.data.stats[jid]) {
        global.db.data.stats[jid] = {
            id: jid,
            messages: 0,
            commands: 0
        };
    }

    global.db.data.stats[jid].messages =
        Number(global.db.data.stats[jid].messages || 0) + 1;
}

/* MESSAGE DB */
function updateDatabase(m) {
    try {
        ensureUser(m);
        ensureChat(m);
        ensureStats(m);

        global.db.data.settings ??= {};
        global.db.data.sticker ??= {};
        global.db.data.guilds ??= {};
        global.db.data.market ??= {};
    } catch (error) {
        console.error('[DATABASE UPDATE]', error);
    }
}


/* ───────────────────────── ZAPO CONNECTION ───────────────────────── */

const sessionDir = path.resolve('./sessions');
fs.mkdirSync(sessionDir, { recursive: true });

const zapoStore = createZapoStore({
    backends: {
        sqlite: createSqliteStore({ path: path.join(sessionDir, 'session.sqlite') })
    },
    providers: {
        auth: 'sqlite',
        signal: 'sqlite',
        preKey: 'sqlite',
        session: 'sqlite',
        identity: 'sqlite',
        senderKey: 'sqlite',
        appState: 'sqlite',
        privacyToken: 'sqlite',
        // arsip pesan tidak dipakai; retry kirim ditangani zapo sendiri
        // (cache 'retry' internal) → tidak ada lagi getMessage() palsu "test".
        messages: 'none',
        threads: 'none',
        contacts: 'none'
    },
    cacheProviders: {
        groupMetadata: 'sqlite',
        chatMetadata: 'sqlite',
        deviceList: 'sqlite',
        messageSecret: 'sqlite'
    }
});

const client = new WaClient(
    {
        store: zapoStore,
        sessionId: 'default',
        recoverFromClientTooOld: true,
        media: {
            processor: createMediaProcessor(),
            generateThumbnail: true,
            generateWaveform: true,
            normalizeVoiceNote: true,
            generateStickerThumbnail: true
        },
        linkPreview: { enabled: true, uploadHqThumbnail: false }
    },
    new ConsoleLogger('error')
);

async function createConnection() {
    wrapClient(client);

    whatsapp = await makeWASocket(client);
    global.conn = whatsapp;

    store = makeInStore(whatsapp, { messageLimit: 20 });

    whatsapp.db = global.db;
    whatsapp.dbData = global.db.data;
    whatsapp.store = store;

    /* PAIRING */
    parentPort?.on('message', async msg => {
        if (!msg) return;

        if (msg === 'shutdown') {
            shuttingDown = true;

            try { await client.disconnect(); } catch {}

            process.exit(0);
        }

        if (msg.type === 'pairing') {
            const phoneNumber = normalizePhone(msg.phoneNumber);

            if (!phoneNumber) {
                parentPort?.postMessage({ type: 'pairing-error', error: 'Nomor tidak valid' });
                return;
            }

            pendingPhone = phoneNumber;

            parentPort?.postMessage({ type: 'log', text: `Meminta pairing code untuk ${phoneNumber}...` });

            // kalau client sudah siap → langsung minta, kalau belum → ditunggu event auth
            if (pairingReady) {
                requestCode();
            }
        }
    });

    /* AUTH */
    function markPairingReady() {
        pairingReady = true;

        if (!pairingPrompted) {
            pairingPrompted = true;

            parentPort?.postMessage({ type: 'pairing-required' });
        }

        if (pendingPhone) {
            requestCode();
        }
    }

    async function requestCode() {
        if (!pendingPhone || pairingInFlight) return;

        pairingInFlight = true;

        const phone = pendingPhone;

        try {
            const code = await Promise.race([
                client.auth.requestPairingCode(phone),
                new Promise((_, reject) =>
                    setTimeout(() => reject(new Error('Timeout 30 detik menunggu pairing code')), 30_000)
                )
            ]);

            sendPairingCode(code);
        } catch (error) {
            pendingPhone = null;
            pairingInFlight = false;

            parentPort?.postMessage({
                type: 'pairing-error',
                error: error?.message || String(error)
            });
        }
    }

    client.on('auth_pairing_required', markPairingReady);
    client.on('auth_qr', markPairingReady);

    client.on('auth_pairing_code', ({ code }) => sendPairingCode(code));

    client.on('auth_paired', ({ credentials }) => {
        pairingReady = false;
        pairingPrompted = false;
        pairingInFlight = false;
        pendingPhone = null;

        console.log(`[INFO] Paired as ${credentials?.meJid}`);
    });

    /* CONNECTION */
    client.on('connection', async ({ status }) => {
        if (status === 'open') {
            pairingRequested = false;

            try {
                const c = whatsapp.getCredentials?.() || client.getCredentials?.() || {};
                if (c.meJid && c.meLid) bindOwnId(c.meJid, c.meLid);
            } catch {}

            try {
                const groups = await whatsapp.groupFetchAllParticipating();

                for (const [id, metadata] of Object.entries(groups || {})) {
                    store.setGroupMetadata(id, metadata);
                }
            } catch (error) {
                console.warn('[GROUPS.INIT] Failed loading group metadata:', error?.message || error);
            }

            parentPort?.postMessage({ type: 'connected' });

            console.log('Success Connect to WhatsApp');
            return;
        }

        if (status === 'close' && !shuttingDown) {
            console.log('[INFO] Connection close event');
            console.log('Connection closed. Worker restarting...');

            // zapo tidak auto-reconnect: keluar dengan kode 1 → shouDex spawn ulang worker.
            process.exit(1);
        }
    });

    /* MESSAGES */
    async function processIncoming(waMsg) {
        try {
            if (!waMsg?.message || Object.keys(waMsg.message).length === 0) return;

            trackMedia(waMsg);

            const jid = waMsg.key.participant ?? waMsg.key.remoteJid;

            if (jid) {
                store.pushMessage(jid, waMsg);
            }

            const processedMessage = await procMsg(waMsg, whatsapp, store);

            if (!processedMessage) return;

            learnLid(processedMessage);
            updateDatabase(processedMessage);

            global.store = store;

            await handler.handleCommand(processedMessage, whatsapp, store);

            prMsg(processedMessage);
        } catch (error) {
            console.error('[MESSAGE]', error);
        }
    }

    client.on('message', event => {
        if (event.key?.isNewsletter) return;

        if (event.key?.fromMe) {
            // pesan yang dikirim bot sendiri -> abaikan (anti-loop)
            if (isBotSent(event.key.id)) return;

            // command yang diketik manual dari akun bot sendiri (mis. HP bot dipakai chat) -> proses
            const msg = event.message || {};
            const body = msg.conversation || msg.extendedTextMessage?.text || '';
            if (!/^[.!/]\S/.test(String(body).trim())) return;
        }

        processIncoming(toWAMessage(event));
    });

    // plugin alias-msg memakai conn.ev.emit('messages.upsert') untuk
    // menyuntik pesan sintetis — arahkan ke pipeline yang sama.
    client.ev.emit = (name, payload) => {
        if (name === 'messages.upsert') {
            for (const m of payload?.messages || []) {
                processIncoming(m);
            }
        }
    };

    /* GROUP */
    client.on('group', async event => {
        const id = event?.groupJid;

        if (!id) return;

        try {
            whatsapp.invalidateGroup(id);

            const metadata = await whatsapp.groupMetadata(id);

            if (!metadata) return;

            store.setGroupMetadata(id, metadata);

            global.db.data.chats[id] ??= {
                id,
                isGroup: true,
                name: metadata.subject || '',
                metadata,
                ephemeralDuration: metadata.ephemeralDuration || 0
            };

            const chat = global.db.data.chats[id];

            chat.isGroup = true;
            chat.name = metadata.subject || chat.name || '';
            chat.metadata = metadata;
            chat.participants = metadata.participants || [];
            chat.ephemeralDuration = metadata.ephemeralDuration || 0;
        } catch (error) {
            console.error(`[GROUP] Error updating group ${id}:`, error?.message || error);
        }
    });

    client.on('call', event => {
        console.log(`[INFO] Call from ${event.callerPnJid || event.callCreatorJid}`);
    });

    await client.connect();

    return whatsapp;
}

/* PROCESS ERRORS */
process.on('uncaughtException', error => {
    console.error('[UNCAUGHT EXCEPTION]', error);
});

process.on('unhandledRejection', error => {
    console.error('[UNHANDLED REJECTION]', error);
});

/* START */
try {
    await createConnection();
} catch (error) {
    console.error('[START CONNECTION]', error);

    process.exit(1);
}
