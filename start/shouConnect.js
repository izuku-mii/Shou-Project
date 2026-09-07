// src/start/ShouConnect.js

'use strict';

import dotenv from 'dotenv';
dotenv.config();

import { parentPort } from 'worker_threads';
import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';
import NodeCache from '@cacheable/node-cache';

import {
    DisconnectReason,
    jidNormalizedUser,
    fetchLatestBaileysVersion,
    getAggregateVotesInPollMessage,
    makeCacheableSignalKeyStore,
    proto,
    Browsers
} from 'baileys';

import makeWASocket from '../src/utils/socket.js';
import * as P from 'pino';

import { procMsg } from '../src/utils/msg.js';
import { prMsg } from '../src/utils/fmt.js';
import useSQLiteAuthState from '../src/utils/useSQLite.js';

import { createStore } from '../src/utils/database.js';

const { default: CmdRegis } =
    await import('../src/commands/register.js');

try {
    await CmdRegis.load();
    await CmdRegis.watch();
} catch (error) {
    console.error(
        'Error loading or watching commands:',
        error
    );
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
        const dbFile =
            path.resolve('./data/database.db');

        fs.mkdirSync(
            path.dirname(dbFile),
            {
                recursive: true
            }
        );

        global.db.sqlite =
            new Database(dbFile);

        global.db.sqlite.pragma(
            'journal_mode = WAL'
        );

        global.db.sqlite.pragma(
            'synchronous = NORMAL'
        );

        global.db.sqlite.pragma(
            'wal_autocheckpoint = 1000'
        );
    }

    if (
        global.db.data !== null
    ) {
        return;
    }

    const stores =
        createStore(
            global.db.sqlite
        );

    global.db.stores =
        stores;

    global.db.data = {
        users:
            stores.users.proxy,

        chats:
            stores.chats.proxy,

        stats:
            stores.stats.proxy,

        sticker:
            stores.sticker.proxy,

        settings:
            stores.settings.proxy,

        guilds:
            stores.guilds.proxy,

        market:
            stores.market.proxy
    };

    global.db.flush = () => {
        for (
            const store of
            Object.values(stores)
        ) {
            try {
                store.flush();
            } catch (error) {
                console.error(
                    '[DB FLUSH]',
                    error
                );
            }
        }
    };

    const hasOld =
        global.db.sqlite
            .prepare(
                "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'database'"
            )
            .get();

    if (hasOld) {
        const row =
            global.db.sqlite
                .prepare(
                    'SELECT data FROM database WHERE id = 1'
                )
                .get();

        if (row?.data) {
            try {
                const data =
                    JSON.parse(
                        row.data
                    );

                for (
                    const key of [
                        'users',
                        'chats',
                        'settings',
                        'stats',
                        'sticker',
                        'guilds',
                        'market'
                    ]
                ) {
                    if (
                        !global.db.data[key]
                    ) {
                        continue;
                    }

                    for (
                        const [
                            id,
                            value
                        ] of Object.entries(
                            data[key] || {}
                        )
                    ) {
                        if (
                            !(id in global.db.data[key])
                        ) {
                            global.db.data[key][id] =
                                value;
                        }
                    }
                }
            } catch (error) {
                console.error(
                    '[DB] migrasi blob gagal:',
                    error
                );
            }
        }

        global.db.sqlite.exec(
            'DROP TABLE IF EXISTS database'
        );
    }
};

global.loadDatabase();

/* AUTO FLUSH */
setInterval(() => {
    try {
        global.db?.flush?.();
    } catch (error) {
        console.error(
            '[DB AUTO FLUSH]',
            error
        );
    }
}, 5000);

/* LOCAL STORE */
const LocalStore = {
    messages: {},
    groupMetadata: {},
    contacts: {}
};

const logger =
    P.pino({
        level: 'silent'
    });

const msgRetryCounterCache =
    new NodeCache();

const messageContext =
    new AsyncLocalStorage();

let whatsapp = null;
let shuttingDown = false;
let pairingRequested = false;
let sendQueue = Promise.resolve();

const sleep = (ms) =>
    new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );

function normalizePhone(input) {
    return String(
        input || ''
    ).replace(
        /\D/g,
        ''
    );
}

/* DATABASE USER */
function ensureUser(m) {
    if (!m?.sender) {
        return;
    }

    const jid =
        jidNormalizedUser(
            m.sender
        );

    if (
        !global.db.data.users[jid]
    ) {
        global.db.data.users[jid] = {
            id: jid,
            name:
                m.pushName ||
                m.senderName ||
                '',
            registered: false,
            limit: 0,
            exp: 0,
            level: 0
        };

        return;
    }

    const user =
        global.db.data.users[jid];

    if (
        typeof user.id ===
        'undefined'
    ) {
        user.id = jid;
    }

    if (
        m.pushName &&
        !user.name
    ) {
        user.name =
            m.pushName;
    }
}

/* DATABASE CHAT/GROUP */
function ensureChat(m) {
    if (!m?.chat) {
        return;
    }

    const jid =
        jidNormalizedUser(
            m.chat
        );

    if (
        !global.db.data.chats[jid]
    ) {
        global.db.data.chats[jid] = {
            id: jid,

            isGroup:
                Boolean(
                    m.isGroup
                ),

            name:
                m.isGroup
                    ? (
                        m.metadata
                            ?.subject ||
                        ''
                    )
                    : (
                        m.pushName ||
                        m.senderName ||
                        ''
                    ),

            ephemeralDuration:
                m.metadata
                    ?.ephemeralDuration ||
                0
        };
    }

    const chat =
        global.db.data.chats[jid];

    chat.id ??= jid;

    chat.isGroup =
        Boolean(
            m.isGroup
        );

    if (m.isGroup) {
        if (
            m.metadata?.subject
        ) {
            chat.name =
                m.metadata.subject;
        }

        if (m.metadata) {
            chat.metadata =
                m.metadata;

            chat.ephemeralDuration =
                m.metadata
                    .ephemeralDuration ||
                0;
        }
    } else if (
        m.pushName ||
        m.senderName
    ) {
        chat.name ??=
            m.pushName ||
            m.senderName ||
            '';
    }
}

/* STATS */
function ensureStats(m) {
    if (!m?.sender) {
        return;
    }

    const jid =
        jidNormalizedUser(
            m.sender
        );

    if (
        !global.db.data.stats[jid]
    ) {
        global.db.data.stats[jid] = {
            id: jid,
            messages: 0,
            commands: 0
        };
    }

    global.db.data.stats[jid].messages =
        Number(
            global.db.data.stats[jid]
                .messages || 0
        ) + 1;
}

/* MESSAGE DB */
function updateDatabase(m) {
    try {
        ensureUser(m);
        ensureChat(m);
        ensureStats(m);

        global.db.data.settings ??=
            {};

        global.db.data.sticker ??=
            {};

        global.db.data.guilds ??=
            {};

        global.db.data.market ??=
            {};
    } catch (error) {
        console.error(
            '[DATABASE UPDATE]',
            error
        );
    }
}

/* CONNECTION */
async function createConnection() {
    async function getMessage(key) {
        if (
            !key.remoteJid ||
            !key.id
        ) {
            return undefined;
        }

        return proto.Message.fromObject({
            conversation:
                'test'
        });
    }

    const {
        state,
        saveCreds
    } =
        await useSQLiteAuthState(
            'sessions'
        );

    const {
        version,
        isLatest
    } =
        await fetchLatestBaileysVersion();

    console.log(
        `using WA v${version.join('.')}, isLatest: ${isLatest}`
    );

    const groupCache =
        new NodeCache({
            stdTTL:
                10 * 60,

            checkperiod:
                60,

            useClones:
                false
        });

    const groupMetadataQueue =
        new Map();

    const groupMetadataCooldown =
        new Map();

    const GROUP_METADATA_COOLDOWN =
        30_000;

    const GROUP_METADATA_ERROR_COOLDOWN =
        60_000;

    async function getGroupMetadataSafe(
        jid
    ) {
        if (!jid) {
            return null;
        }

        const now =
            Date.now();

        const cached =
            groupCache.get(
                jid
            );

        const localCached =
            LocalStore
                .groupMetadata?.[
                jid
            ];

        if (cached) {
            return cached;
        }

        if (localCached) {
            groupCache.set(
                jid,
                localCached
            );

            return localCached;
        }

        const lastFetch =
            groupMetadataCooldown.get(
                jid
            ) || 0;

        if (
            now <
            lastFetch
        ) {
            return null;
        }

        if (
            groupMetadataQueue.has(
                jid
            )
        ) {
            return groupMetadataQueue.get(
                jid
            );
        }

        const promise =
            (async () => {
                try {
                    const metadata =
                        await whatsapp
                            .groupMetadata(
                                jid
                            );

                    if (metadata) {
                        groupCache.set(
                            jid,
                            metadata
                        );

                        LocalStore
                            .groupMetadata[
                            jid
                        ] =
                            metadata;
                    }

                    groupMetadataCooldown.set(
                        jid,
                        Date.now() +
                            GROUP_METADATA_COOLDOWN
                    );

                    return metadata;
                } catch (error) {
                    const message =
                        error?.message ||
                        String(
                            error
                        );

                    if (
                        message.includes(
                            'rate-overlimit'
                        )
                    ) {
                        console.warn(
                            `[GROUP-METADATA] rate-overlimit: ${jid}`
                        );

                        groupMetadataCooldown.set(
                            jid,
                            Date.now() +
                                GROUP_METADATA_ERROR_COOLDOWN
                        );
                    }

                    return null;
                } finally {
                    groupMetadataQueue.delete(
                        jid
                    );
                }
            })();

        groupMetadataQueue.set(
            jid,
            promise
        );

        return promise;
    }

    const config = {
        version,

        printQRInTerminal:
            false,

        browser:
            Browsers.macOS(
                'Safari'
            ),

        logger,

        auth: {
            creds:
                state.creds,

            keys:
                makeCacheableSignalKeyStore(
                    state.keys,
                    logger
                )
        },

        msgRetryCounterCache,

        generateHighQualityLinkPreview:
            true,

        getMessage,

        cachedGroupMetadata:
            async jid =>
                Promise.resolve(
                    groupCache.get(
                        jid
                    )
                )
    };

    whatsapp =
        await makeWASocket(
            config
        );

    global.conn =
        whatsapp;

    /* DB ACCESS */
    whatsapp.db =
        global.db;

    whatsapp.dbData =
        global.db.data;

    whatsapp.store =
        LocalStore;

    /* SEND QUEUE */
    const originalSendMessage =
        whatsapp.sendMessage.bind(
            whatsapp
        );

    whatsapp.sendMessage =
        (
            jid,
            content,
            options = {}
        ) => {
            const ctx =
                messageContext.getStore();

            const ephemeralExpiration =
                options.ephemeralExpiration ??
                ctx?.ephemeralExpiration ??
                null;

            const task =
                sendQueue.then(
                    async () => {
                        await sleep(
                            350
                        );

                        return originalSendMessage(
                            jid,
                            content,
                            {
                                ...options,
                                ephemeralExpiration
                            }
                        );
                    }
                );

            sendQueue =
                task.catch(
                    () => {}
                );

            return task;
        };

    /* PAIRING */
    if (
        !state.creds.registered &&
        !pairingRequested
    ) {
        pairingRequested =
            true;

        parentPort?.postMessage({
            type:
                'pairing-required'
        });
    }

    parentPort?.on(
        'message',
        async msg => {
            if (!msg) {
                return;
            }

            if (
                msg ===
                'shutdown'
            ) {
                shuttingDown =
                    true;

                try {
                    whatsapp?.end?.(
                        new Error(
                            'Shutdown'
                        )
                    );
                } catch {}

                process.exit(
                    0
                );
            }

            if (
                msg.type ===
                'pairing'
            ) {
                const phoneNumber =
                    normalizePhone(
                        msg.phoneNumber
                    );

                if (!phoneNumber) {
                    parentPort?.postMessage({
                        type:
                            'pairing-error',

                        error:
                            'Nomor tidak valid'
                    });

                    return;
                }

                try {
                    const code =
                        await whatsapp
                            .requestPairingCode(
                                phoneNumber
                            );

                    parentPort?.postMessage({
                        type:
                            'pairing-code',

                        code
                    });
                } catch (error) {
                    parentPort?.postMessage({
                        type:
                            'pairing-error',

                        error:
                            error?.message ||
                            String(
                                error
                            )
                    });
                }
            }
        }
    );

    /* EVENTS */
    whatsapp.ev.process(
        async events => {
            try {
                /* CONNECTION */
                if (
                    events[
                        'connection.update'
                    ]
                ) {
                    const update =
                        events[
                            'connection.update'
                        ];

                    const {
                        connection,
                        lastDisconnect
                    } =
                        update;

                    if (
                        connection ===
                        'close'
                    ) {
                        const statusCode =
                            lastDisconnect
                                ?.error
                                ?.output
                                ?.statusCode;

                        if (
                            statusCode ===
                            DisconnectReason.loggedOut
                        ) {
                            console.log(
                                'Connection closed. You are logged out.'
                            );

                            shuttingDown =
                                true;

                            setTimeout(
                                () =>
                                    process.exit(
                                        0
                                    ),
                                500
                            );

                            return;
                        }

                        if (
                            !shuttingDown
                        ) {
                            console.log(
                                'Connection closed. Worker restarting...'
                            );

                            process.exit(
                                1
                            );
                        }

                        return;
                    }

                    if (
                        connection ===
                        'open'
                    ) {
                        pairingRequested =
                            false;

                        try {
                            const groups =
                                await whatsapp
                                    .groupFetchAllParticipating();

                            for (
                                const [
                                    id,
                                    metadata
                                ] of Object.entries(
                                    groups ||
                                    {}
                                )
                            ) {
                                groupCache.set(
                                    id,
                                    metadata
                                );

                                LocalStore
                                    .groupMetadata[
                                    id
                                ] =
                                    metadata;
                            }
                        } catch (error) {
                            console.warn(
                                '[GROUPS.INIT] Failed loading group metadata:',
                                error?.message ||
                                error
                            );
                        }

                        parentPort?.postMessage({
                            type:
                                'connected'
                        });

                        console.log(
                            'Success Connect to WhatsApp'
                        );
                    }
                }

                /* CREDS */
                if (
                    events[
                        'creds.update'
                    ]
                ) {
                    await saveCreds();
                }

                /* LABELS */
                if (
                    events[
                        'labels.association'
                    ]
                ) {
                    console.log(
                        events[
                            'labels.association'
                        ]
                    );
                }

                if (
                    events[
                        'labels.edit'
                    ]
                ) {
                    console.log(
                        events[
                            'labels.edit'
                        ]
                    );
                }

                /* HISTORY */
                if (
                    events[
                        'messaging-history.set'
                    ]
                ) {
                    const {
                        chats,
                        contacts,
                        messages,
                        isLatest,
                        progress,
                        syncType
                    } =
                        events[
                            'messaging-history.set'
                        ];

                    if (
                        syncType ===
                        proto.HistorySync
                            .HistorySyncType
                            .ON_DEMAND
                    ) {
                        console.log(
                            'received on-demand history sync, messages=',
                            messages
                        );
                    }

                    console.log(
                        `recv ${chats.length} chats, ${contacts.length} contacts, ${messages.length} msgs (is latest: ${isLatest}, progress: ${progress}%), type: ${syncType}`
                    );
                }

                /* MESSAGES UPSERT */
                if (
                    events[
                        'messages.upsert'
                    ]
                ) {
                    const upsert =
                        events[
                            'messages.upsert'
                        ];

                    if (
                        upsert.requestId
                    ) {
                        console.log(
                            'placeholder message received for request of id=' +
                                upsert.requestId,
                            upsert
                        );
                    }

                    for (
                        const msg of
                        upsert.messages
                    ) {
                        try {
                            const jid =
                                msg.key
                                    .participant ??
                                msg.key
                                    .remoteJid;

                            if (jid) {
                                if (
                                    !LocalStore
                                        .messages[
                                        jid
                                    ]
                                ) {
                                    LocalStore
                                        .messages[
                                        jid
                                    ] = [];
                                }

                                LocalStore
                                    .messages[
                                    jid
                                ].push(
                                    msg
                                );

                                if (
                                    LocalStore
                                        .messages[
                                        jid
                                    ].length >
                                    20
                                ) {
                                    LocalStore
                                        .messages[
                                        jid
                                    ] =
                                        LocalStore
                                            .messages[
                                            jid
                                        ].slice(
                                            -20
                                        );
                                }
                            }

                            if (
                                upsert.type !==
                                'notify'
                            ) {
                                continue;
                            }

                            const processedMessage =
                                await procMsg(
                                    msg,
                                    whatsapp,
                                    LocalStore
                                );

                            if (
                                !processedMessage
                            ) {
                                continue;
                            }

                            updateDatabase(
                                processedMessage
                            );

                            /* GROUP METADATA */
                            if (
                                processedMessage.isGroup
                            ) {
                                const store =
                                    processedMessage
                                        ?.metadata;

                                if (store) {
                                    try {
                                        const metadata =
                                            await getGroupMetadataSafe(
                                                processedMessage.chat
                                            );

                                        if (
                                            metadata
                                        ) {
                                            if (
                                                typeof store.ephemeralDuration ===
                                                'undefined'
                                            ) {
                                                store.ephemeralDuration =
                                                    0;
                                            }

                                            if (
                                                store.ephemeralDuration &&
                                                store.ephemeralDuration !==
                                                    metadata?.ephemeralDuration
                                            ) {
                                                console.log(
                                                    `ephemeralDuration for ${processedMessage.chat} has changed!\nupdate groupMetadata...`
                                                );

                                                processedMessage.metadata =
                                                    metadata;

                                                groupCache.set(
                                                    processedMessage.chat,
                                                    metadata
                                                );

                                                if (
                                                    global.db.data.chats[
                                                        processedMessage.chat
                                                    ]
                                                ) {
                                                    global.db.data.chats[
                                                        processedMessage.chat
                                                    ].metadata =
                                                        metadata;

                                                    global.db.data.chats[
                                                        processedMessage.chat
                                                    ].name =
                                                        metadata?.subject ||
                                                        '';
                                                }
                                            }
                                        }
                                    } catch (error) {
                                        console.error(
                                            '[GROUP-METADATA]',
                                            error
                                        );
                                    }
                                }
                            }

                            /* EPHEMERAL */
                            const ephemeralExpiration =
                                processedMessage.isGroup
                                    ? (
                                        processedMessage
                                            .metadata
                                            ?.ephemeralDuration ||
                                        null
                                    )
                                    : (
                                        processedMessage
                                            .message?.[
                                            processedMessage.type
                                        ]?.contextInfo
                                            ?.expiration ||
                                        null
                                    );

                            global.store =
                                LocalStore;

                            /* HANDLER */
                            await messageContext.run(
                                {
                                    ephemeralExpiration
                                },
                                async () => {
                                    await handler.handleCommand(
                                        processedMessage,
                                        whatsapp,
                                        LocalStore
                                    );
                                }
                            );

                            prMsg(
                                processedMessage
                            );
                        } catch (error) {
                            console.error(
                                '[MESSAGE]',
                                error
                            );
                        }
                    }
                }

                /* MESSAGES UPDATE */
                if (
                    events[
                        'messages.update'
                    ]
                ) {
                    for (
                        const {
                            update
                        } of events[
                            'messages.update'
                        ]
                    ) {
                        try {
                            if (
                                update.pollUpdates
                            ) {
                                const pollCreation =
                                    {};

                                if (
                                    pollCreation
                                ) {
                                    console.log(
                                        'got poll update, aggregation: ',
                                        getAggregateVotesInPollMessage(
                                            {
                                                message:
                                                    pollCreation,

                                                pollUpdates:
                                                    update.pollUpdates
                                            }
                                        )
                                    );
                                }
                            }
                        } catch (error) {
                            console.error(
                                '[MESSAGES.UPDATE]',
                                error
                            );
                        }
                    }
                }

                /* CONTACTS UPSERT */
                if (
                    events[
                        'contacts.upsert'
                    ]
                ) {
                    const update =
                        events[
                            'contacts.upsert'
                        ];

                    for (
                        const contact of
                        update
                    ) {
                        try {
                            const id =
                                jidNormalizedUser(
                                    contact.id
                                );

                            if (
                                LocalStore &&
                                LocalStore.contacts
                            ) {
                                LocalStore
                                    .contacts[
                                    id
                                ] = {
                                    ...(contact ||
                                        {}),

                                    isContact:
                                        true
                                };
                            }
                        } catch (error) {
                            console.error(
                                '[CONTACTS.UPSERT]',
                                error
                            );
                        }
                    }
                }

                /* CONTACTS UPDATE */
                if (
                    events[
                        'contacts.update'
                    ]
                ) {
                    for (
                        const contact of
                        events[
                            'contacts.update'
                        ]
                    ) {
                        try {
                            if (
                                typeof contact.imgUrl !==
                                'undefined'
                            ) {
                                const newUrl =
                                    contact.imgUrl ===
                                    null
                                        ? null
                                        : await whatsapp
                                              .profilePictureUrl(
                                                  contact.id
                                              )
                                              .catch(
                                                  () =>
                                                      null
                                              );

                                console.log(
                                    `contact ${contact.id} has a new profile pic: ${newUrl}`
                                );
                            }

                            const id =
                                jidNormalizedUser(
                                    contact.id
                                );

                            if (
                                LocalStore &&
                                LocalStore.contacts
                            ) {
                                LocalStore
                                    .contacts[
                                    id
                                ] = {
                                    ...(LocalStore
                                        .contacts
                                        ?.[
                                        id
                                    ] || {}),

                                    ...(contact ||
                                        {})
                                };
                            }
                        } catch (error) {
                            console.error(
                                '[CONTACTS.UPDATE]',
                                error
                            );
                        }
                    }
                }

                /* GROUP UPSERT */
                if (
                    events[
                        'groups.upsert'
                    ]
                ) {
                    const newGroups =
                        events[
                            'groups.upsert'
                        ];

                    for (
                        const groupMetadata of
                        newGroups
                    ) {
                        try {
                            groupCache.set(
                                groupMetadata.id,
                                groupMetadata
                            );

                            LocalStore
                                .groupMetadata[
                                groupMetadata.id
                            ] =
                                groupMetadata;

                            const id =
                                groupMetadata.id;

                            global.db.data.chats[id] ??=
                                {
                                    id,

                                    isGroup:
                                        true,

                                    name:
                                        groupMetadata
                                            .subject ||
                                        '',

                                    metadata:
                                        groupMetadata,

                                    ephemeralDuration:
                                        groupMetadata
                                            .ephemeralDuration ||
                                        0
                                };

                            global.db.data.chats[
                                id
                            ].name =
                                groupMetadata
                                    .subject ||
                                '';

                            global.db.data.chats[
                                id
                            ].metadata =
                                groupMetadata;
                        } catch (error) {
                            console.error(
                                `[GROUPS.UPSERT] Error adding group ${groupMetadata.id}:`,
                                error
                            );
                        }
                    }
                }

                /* GROUP UPDATE */
                if (
                    events[
                        'groups.update'
                    ]
                ) {
                    const updates =
                        events[
                            'groups.update'
                        ];

                    for (
                        const update of
                        updates
                    ) {
                        const id =
                            update.id;

                        if (!id) {
                            continue;
                        }

                        try {
                            const cached =
                                groupCache.get(
                                    id
                                ) ||
                                LocalStore
                                    .groupMetadata[
                                    id
                                ] ||
                                global.db
                                    .data
                                    .chats[id]
                                    ?.metadata ||
                                {
                                    id,

                                    isCommunity:
                                        false
                                };

                            const metadata = {
                                ...cached,
                                ...update,
                                id
                            };

                            groupCache.set(
                                id,
                                metadata
                            );

                            LocalStore
                                .groupMetadata[
                                id
                            ] =
                                metadata;

                            global.db.data.chats[id] ??=
                                {
                                    id,

                                    isGroup:
                                        true,

                                    name:
                                        metadata
                                            ?.subject ||
                                        '',

                                    metadata,

                                    ephemeralDuration:
                                        metadata
                                            ?.ephemeralDuration ||
                                        0
                                };

                            global.db.data.chats[
                                id
                            ].isGroup =
                                true;

                            if (
                                metadata?.subject
                            ) {
                                global.db
                                    .data
                                    .chats[id]
                                    .name =
                                    metadata.subject;
                            }

                            global.db
                                .data
                                .chats[id]
                                .metadata =
                                metadata;

                            if (
                                typeof metadata
                                    ?.ephemeralDuration !==
                                'undefined'
                            ) {
                                global.db
                                    .data
                                    .chats[id]
                                    .ephemeralDuration =
                                    metadata
                                        .ephemeralDuration ||
                                    0;
                            }
                        } catch (error) {
                            console.error(
                                `[GROUPS.UPDATE] Error updating group ${id}:`,
                                error
                            );
                        }
                    }
                }

                /* GROUP PARTICIPANTS */
                if (
                    events[
                        'group-participants.update'
                    ]
                ) {
                    const {
                        id,
                        participants,
                        action
                    } =
                        events[
                            'group-participants.update'
                        ];

                    if (id) {
                        try {
                            let metadata =
                                groupCache.get(
                                    id
                                ) ||
                                LocalStore
                                    .groupMetadata[
                                    id
                                ];

                            if (!metadata) {
                                metadata =
                                    await getGroupMetadataSafe(
                                        id
                                    );
                            }

                            /*
                             * Jangan pakai continue/return di sini.
                             * Kalau metadata tidak tersedia,
                             * event tetap selesai dengan aman.
                             */
                            if (
                                metadata
                            ) {
                                groupCache.set(
                                    id,
                                    metadata
                                );

                                LocalStore
                                    .groupMetadata[
                                    id
                                ] =
                                    metadata;

                                if (
                                    LocalStore
                                        .groupMetadata[
                                        id
                                    ]?.participants
                                ) {
                                    const participantList =
                                        LocalStore
                                            .groupMetadata[
                                            id
                                        ].participants;

                                    const normalizedParticipants =
                                        participants.map(
                                            jid =>
                                                jidNormalizedUser(
                                                    jid
                                                )
                                        );

                                    switch (
                                        action
                                    ) {
                                        case 'add': {
                                            const existing =
                                                new Set(
                                                    participantList.map(
                                                        p =>
                                                            jidNormalizedUser(
                                                                p.id
                                                            )
                                                    )
                                                );

                                            for (
                                                const jid of
                                                normalizedParticipants
                                            ) {
                                                if (
                                                    existing.has(
                                                        jid
                                                    )
                                                ) {
                                                    continue;
                                                }

                                                participantList.push(
                                                    {
                                                        id:
                                                            jid,

                                                        admin:
                                                            null
                                                    }
                                                );
                                            }

                                            break;
                                        }

                                        case 'demote':
                                            for (
                                                const participant of
                                                participantList
                                            ) {
                                                const participantId =
                                                    jidNormalizedUser(
                                                        participant.id
                                                    );

                                                if (
                                                    normalizedParticipants.includes(
                                                        participantId
                                                    )
                                                ) {
                                                    participant.admin =
                                                        null;
                                                }
                                            }

                                            break;

                                        case 'promote':
                                            for (
                                                const participant of
                                                participantList
                                            ) {
                                                const participantId =
                                                    jidNormalizedUser(
                                                        participant.id
                                                    );

                                                if (
                                                    normalizedParticipants.includes(
                                                        participantId
                                                    )
                                                ) {
                                                    participant.admin =
                                                        'admin';
                                                }
                                            }

                                            break;

                                        case 'remove':
                                            LocalStore
                                                .groupMetadata[
                                                id
                                            ].participants =
                                                participantList.filter(
                                                    p =>
                                                        !normalizedParticipants.includes(
                                                            jidNormalizedUser(
                                                                p.id
                                                            )
                                                        )
                                                );

                                            break;
                                    }
                                }

                                global.db.data.chats[id] ??=
                                    {
                                        id,

                                        isGroup:
                                            true,

                                        name:
                                            metadata
                                                ?.subject ||
                                            '',

                                        metadata,

                                        ephemeralDuration:
                                            metadata
                                                ?.ephemeralDuration ||
                                            0
                                    };

                                global.db
                                    .data
                                    .chats[id]
                                    .metadata =
                                    metadata;

                                global.db
                                    .data
                                    .chats[id]
                                    .name =
                                    metadata
                                        ?.subject ||
                                    '';

                                global.db
                                    .data
                                    .chats[id]
                                    .participants =
                                    metadata
                                        ?.participants ||
                                    [];
                            } else {
                                console.warn(
                                    `[GROUP-PARTICIPANTS.UPDATE] Metadata unavailable for ${id}`
                                );
                            }
                        } catch (error) {
                            console.error(
                                `[GROUP-PARTICIPANTS.UPDATE] Error processing group ${id}:`,
                                error
                            );
                        }
                    }
                }

                /* CHATS DELETE */
                if (
                    events[
                        'chats.delete'
                    ]
                ) {
                    console.log(
                        'chats deleted ',
                        events[
                            'chats.delete'
                        ]
                    );
                }
            } catch (error) {
                console.error(
                    '[EVENT PROCESS]',
                    error
                );
            }
        }
    );

    return whatsapp;
}

/* PROCESS ERRORS */
process.on(
    'uncaughtException',
    error => {
        console.error(
            '[UNCAUGHT EXCEPTION]',
            error
        );
    }
);

process.on(
    'unhandledRejection',
    error => {
        console.error(
            '[UNHANDLED REJECTION]',
            error
        );
    }
);

/* START */
try {
    await createConnection();
} catch (error) {
    console.error(
        '[START CONNECTION]',
        error
    );

    process.exit(
        1
    );
}