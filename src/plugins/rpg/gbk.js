import cmd from '../../commands/map.js'

const REWARD = 60000
const TIMEOUT = 60_000
const games = new Map()

function normalizeJid(jid) {
  if (!jid) return null

  jid = String(jid).trim()

  if (/^\d+:\d+@s\.whatsapp\.net$/.test(jid)) {
    jid = jid.replace(/:\d+@/, '@')
  }

  if (/^\d+@s\.whatsapp\.net$/.test(jid)) return jid
  if (/^\d+@lid$/.test(jid)) return jid
  if (/^\d+$/.test(jid)) return `${jid}@s.whatsapp.net`

  return jid
}

function stripDevice(jid) {
  jid = normalizeJid(jid)
  if (!jid) return null

  return jid.replace(/:\d+@/, '@')
}

function sameJid(a, b) {
  a = stripDevice(a)
  b = stripDevice(b)

  if (!a || !b) return false

  return a === b
}

function getUsers() {
  return global.db?.data?.users || {}
}

function findDBUser(jid) {
  const users = getUsers()

  jid = normalizeJid(jid)
  if (!jid) return null

  if (users[jid]) {
    return {
      user: users[jid],
      jid,
      lid: users[jid]?.lid || null
    }
  }

  const clean = stripDevice(jid)

  if (users[clean]) {
    return {
      user: users[clean],
      jid: clean,
      lid: users[clean]?.lid || null
    }
  }

  for (const [key, user] of Object.entries(users)) {
    if (!user?.lid) continue

    if (sameJid(user.lid, jid)) {
      return {
        user,
        jid: key,
        lid: user.lid
      }
    }
  }

  return null
}

function getParticipantByLid(conn, chat, lid) {
  const participants =
    conn?.store?.groupMetadata?.[chat]?.participants

  if (!Array.isArray(participants)) return null

  lid = normalizeJid(lid)

  return participants.find(p =>
    sameJid(p?.id, lid) &&
    p?.phoneNumber
  ) || null
}

function getPhoneNumberFromLid(conn, chat, lid) {
  const participant = getParticipantByLid(
    conn,
    chat,
    lid
  )

  if (!participant?.phoneNumber) return null

  return stripDevice(participant.phoneNumber)
}

async function resolveLid(conn, chat, lid) {
  const phoneNumber = getPhoneNumberFromLid(
    conn,
    chat,
    lid
  )

  if (phoneNumber) return phoneNumber

  try {
    const mapping =
      conn?.signalRepository?.lidMapping

    if (
      mapping &&
      typeof mapping.getPNForLID === 'function'
    ) {
      const result =
        await mapping.getPNForLID(lid)

      if (result) {
        return stripDevice(result)
      }
    }
  } catch (e) {
    console.error(
      '[GBK] LID mapping:',
      e?.message || e
    )
  }

  return null
}

function getSender(m) {
  return normalizeJid(
    m?.sender ||
    m?.key?.participant ||
    m?.participant ||
    m?.key?.remoteJid
  )
}

function getMentionedJid(m) {
  const result = []

  if (Array.isArray(m?.mentionedJid)) {
    result.push(...m.mentionedJid)
  }

  if (Array.isArray(m?.mentionedLid)) {
    result.push(...m.mentionedLid)
  }

  const context =
    m?.msg?.contextInfo ||
    m?.message?.extendedTextMessage?.contextInfo ||
    m?.quoted?.msg?.contextInfo ||
    {}

  if (Array.isArray(context.mentionedJid)) {
    result.push(...context.mentionedJid)
  }

  if (Array.isArray(context.mentionedLid)) {
    result.push(...context.mentionedLid)
  }

  return [
    ...new Set(
      result
        .map(normalizeJid)
        .filter(Boolean)
    )
  ]
}

function getText(m) {
  return String(
    m?.text ||
    m?.body ||
    m?.msg?.conversation ||
    m?.msg?.extendedTextMessage?.text ||
    m?.message?.conversation ||
    m?.message?.extendedTextMessage?.text ||
    ''
  ).trim()
}

function getQuotedId(m) {
  return (
    m?.quoted?.id ||
    m?.quoted?.key?.id ||
    m?.quoted?.stanzaId ||
    m?.quoted?.key?.stanzaId ||
    m?.msg?.contextInfo?.stanzaId ||
    m?.message?.extendedTextMessage?.contextInfo?.stanzaId ||
    null
  )
}

async function sendPM(conn, jid, text) {
  jid = stripDevice(jid)

  if (!jid) return null

  try {
    return await conn.sendMessage(jid, {
      text
    })
  } catch (e) {
    console.error(
      '[GBK] PM:',
      e?.message || e
    )

    return null
  }
}

function normalizeChoice(text) {
  text = String(text || '')
    .trim()
    .toLowerCase()

  if (text === 'batu') return 'batu'
  if (text === 'gunting') return 'gunting'
  if (text === 'kertas') return 'kertas'

  return null
}

function getWinner(a, b) {
  if (a === b) return 'draw'

  if (
    (a === 'batu' && b === 'gunting') ||
    (a === 'gunting' && b === 'kertas') ||
    (a === 'kertas' && b === 'batu')
  ) {
    return 'p1'
  }

  return 'p2'
}

function choiceName(choice) {
  if (choice === 'batu') return '🪨 Batu'
  if (choice === 'gunting') return '✂️ Gunting'
  if (choice === 'kertas') return '📄 Kertas'

  return '-'
}

function clearGame(game) {
  if (!game) return

  if (game.timer) {
    clearTimeout(game.timer)
  }

  games.delete(game.id)
}

function clearUserGame(game) {
  const users = getUsers()

  for (const user of Object.values(users)) {
    if (user?.gbk?.gameId === game.id) {
      delete user.gbk
    }
  }
}

function setUserGame(jid, gameId, role) {
  const found = findDBUser(jid)

  if (!found?.user) return

  found.user.gbk = {
    gameId,
    role
  }
}

function getActiveGame(jid) {
  const found = findDBUser(jid)

  if (!found?.user?.gbk?.gameId) {
    return null
  }

  return games.get(found.user.gbk.gameId) || null
}

function moneyText(number) {
  return Number(number || 0)
    .toLocaleString('id-ID')
}

async function finishGame(conn, game) {
  if (!game || game.finished) return

  if (
    !game.choices[game.p1.jid] ||
    !game.choices[game.p2.jid]
  ) {
    return
  }

  game.finished = true

  if (game.timer) {
    clearTimeout(game.timer)
  }

  const p1Choice =
    game.choices[game.p1.jid]

  const p2Choice =
    game.choices[game.p2.jid]

  const winner =
    getWinner(
      p1Choice,
      p2Choice
    )

  const users = getUsers()

  const p1DB = findDBUser(game.p1.jid)
  const p2DB = findDBUser(game.p2.jid)

  if (!p1DB?.user || !p2DB?.user) {
    clearUserGame(game)
    clearGame(game)
    return
  }

  /*
   * Seri:
   * saldo tidak berubah.
   */
  if (winner === 'draw') {
    await conn.sendMessage(
      game.chat,
      {
        text: [
          '🎮 *HASIL GBK*',
          '',
          `👤 @${game.p1.jid.split('@')[0]}: ${choiceName(p1Choice)}`,
          `👤 @${game.p2.jid.split('@')[0]}: ${choiceName(p2Choice)}`,
          '',
          '🤝 *HASIL: SERI*',
          '',
          '💰 Saldo kedua pemain tidak berubah.'
        ].join('\n'),
        mentions: [
          game.p1.jid,
          game.p2.jid
        ]
      }
    )

    clearUserGame(game)
    clearGame(game)
    return
  }

  const winnerJid =
    winner === 'p1'
      ? game.p1.jid
      : game.p2.jid

  const loserJid =
    winner === 'p1'
      ? game.p2.jid
      : game.p1.jid

  const winnerDB =
    winner === 'p1'
      ? p1DB
      : p2DB

  const loserDB =
    winner === 'p1'
      ? p2DB
      : p1DB

  /*
   * Yang kalah saldonya menjadi 0.
   */
  loserDB.user.money = 0

  /*
   * Yang menang mendapatkan 60.000.
   */
  winnerDB.user.money =
    Number(winnerDB.user.money || 0) +
    REWARD

  await conn.sendMessage(
    game.chat,
    {
      text: [
        '🎮 *HASIL GBK*',
        '',
        `👤 @${game.p1.jid.split('@')[0]}: ${choiceName(p1Choice)}`,
        `👤 @${game.p2.jid.split('@')[0]}: ${choiceName(p2Choice)}`,
        '',
        `🏆 *Pemenang:* @${winnerJid.split('@')[0]}`,
        `💀 *Kalah:* @${loserJid.split('@')[0]}`,
        '',
        `💰 Hadiah pemenang: Rp${moneyText(REWARD)}`,
        `💸 Saldo pemenang: Rp${moneyText(winnerDB.user.money)}`,
        `💸 Saldo yang kalah: Rp${moneyText(loserDB.user.money)}`
      ].join('\n'),
      mentions: [
        game.p1.jid,
        game.p2.jid
      ]
    }
  )

  clearUserGame(game)
  clearGame(game)
}

cmd.add({
  name: 'gbk',
  alias: [
    'batuguntingkertas',
    'batu-gunting-kertas'
  ],
  category: 'rpg',
  desc: 'Main batu gunting kertas',
  usage: '.gbk @user',

  async run({ m, sock }) {
    const conn = sock

    if (!m.isGroup) {
      return m.reply(
        '❌ Command ini hanya bisa digunakan di grup.'
      )
    }

    const sender = getSender(m)

    if (!sender) {
      return m.reply(
        '❌ Sender tidak ditemukan.'
      )
    }

    const senderDB =
      findDBUser(sender)

    if (!senderDB?.user) {
      return m.reply(
        '❌ Kamu belum terdaftar.'
      )
    }

    const mentioned =
      getMentionedJid(m)

    if (!mentioned.length) {
      return m.reply(
        '❌ Tag user yang ingin ditantang.'
      )
    }

    let targetJid =
      mentioned.find(
        jid => jid.endsWith('@lid')
      ) || mentioned[0]

    /*
     * Ambil phoneNumber dari:
     * store.groupMetadata[m.chat].participants
     */
    if (targetJid.endsWith('@lid')) {
      const phoneNumber =
        await resolveLid(
          conn,
          m.chat,
          targetJid
        )

      if (!phoneNumber) {
        return m.reply(
          '❌ Nomor user tidak ditemukan.'
        )
      }

      targetJid = phoneNumber
    }

    targetJid =
      stripDevice(targetJid)

    if (sameJid(sender, targetJid)) {
      return m.reply(
        '❌ Tidak bisa menantang diri sendiri.'
      )
    }

    const targetDB =
      findDBUser(targetJid)

    if (!targetDB?.user) {
      return m.reply(
        '❌ User yang ditantang belum terdaftar.'
      )
    }

    /*
     * Keduanya harus punya saldo.
     */
    const senderMoney =
      Number(senderDB.user.money || 0)

    const targetMoney =
      Number(targetDB.user.money || 0)

    if (senderMoney <= 0) {
      return m.reply(
        '❌ Saldo kamu harus lebih dari 0.'
      )
    }

    if (targetMoney <= 0) {
      return m.reply(
        '❌ Saldo user yang ditantang harus lebih dari 0.'
      )
    }

    if (getActiveGame(sender)) {
      return m.reply(
        '❌ Kamu masih memiliki permainan GBK.'
      )
    }

    if (getActiveGame(targetJid)) {
      return m.reply(
        '❌ User tersebut masih memiliki permainan GBK.'
      )
    }

    const gameId =
      `${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 10)}`

    const game = {
      id: gameId,
      chat: m.chat,

      p1: {
        jid: stripDevice(sender),
        lid: senderDB.lid || null
      },

      p2: {
        jid: stripDevice(targetJid),
        lid: targetDB.lid || null
      },

      choices: {},
      messages: {},
      finished: false,
      timer: null
    }

    games.set(gameId, game)

    setUserGame(
      game.p1.jid,
      gameId,
      'p1'
    )

    setUserGame(
      game.p2.jid,
      gameId,
      'p2'
    )

    /*
     * PM pemain pertama.
     */
    const pm1 = await sendPM(
      conn,
      game.p1.jid,
      [
        '🎮 *BATU GUNTING KERTAS*',
        '',
        `Kamu ditantang oleh @${game.p2.jid.split('@')[0]}.`,
        '',
        'Balas pesan ini dengan:',
        '• batu',
        '• gunting',
        '• kertas',
        '',
        '⏱️ Waktu: 60 detik'
      ].join('\n')
    )

    /*
     * PM pemain kedua.
     */
    const pm2 = await sendPM(
      conn,
      game.p2.jid,
      [
        '🎮 *BATU GUNTING KERTAS*',
        '',
        `Kamu menantang @${game.p1.jid.split('@')[0]}.`,
        '',
        'Balas pesan ini dengan:',
        '• batu',
        '• gunting',
        '• kertas',
        '',
        '⏱️ Waktu: 60 detik'
      ].join('\n')
    )

    game.messages[game.p1.jid] =
      pm1?.key?.id || null

    game.messages[game.p2.jid] =
      pm2?.key?.id || null

    game.timer = setTimeout(
      async () => {
        if (game.finished) return

        game.finished = true

        await conn.sendMessage(
          game.chat,
          {
            text: [
              '🎮 *GBK DIBATALKAN*',
              '',
              '⏱️ Waktu habis.',
              '',
              'Tidak ada saldo yang berubah.'
            ].join('\n')
          }
        )

        clearUserGame(game)
        clearGame(game)
      },
      TIMEOUT
    )
  }
})

cmd.add({
  async events({ m, conn }) {
    if (!m) return

    const sender =
      getSender(m)

    if (!sender) return

    const game =
      getActiveGame(sender)

    if (!game) return

    const text =
      getText(m)

    const choice =
      normalizeChoice(text)

    if (!choice) return

    const challengeId =
      game.messages[stripDevice(sender)]

    if (!challengeId) return

    const quotedId =
      getQuotedId(m)

    /*
     * Harus membalas pesan GBK
     * milik pemain tersebut.
     */
    if (!quotedId) return

    if (quotedId !== challengeId) {
      return
    }

    const playerJid =
      stripDevice(sender)

    if (
      game.choices[playerJid]
    ) {
      return
    }

    game.choices[playerJid] =
      choice

    if (
      game.choices[game.p1.jid] &&
      game.choices[game.p2.jid]
    ) {
      await finishGame(
        conn,
        game
      )
    }
  }
})