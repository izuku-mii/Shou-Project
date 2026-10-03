# Migrasi Baileys → zapo-js

## Penyebab pesan "test"
`getMessage()` di `start/shouConnect.js` lama selalu mengembalikan `{ conversation: 'test' }`.
Saat penerima gagal dekripsi dan minta kirim ulang (retry receipt), Baileys memakai isi palsu itu,
sehingga muncul pesan "test". Di versi zapo tidak ada hook itu: retry kirim ditangani cache
`retry` internal zapo, jadi bug-nya hilang.

## Yang berubah
- `start/shouConnect.js` — ditulis ulang pakai `WaClient` + `createStore` + `createSqliteStore` (pola contoh zapo).
- `src/zapo/shim.js` — pengganti helper `baileys` (jid, proto, download, upload media, dll).
- `src/zapo/compat.js` — membungkus `WaClient` jadi API ala Baileys (`sendMessage`, `groupMetadata`,
  `groupParticipantsUpdate`, `relayMessage`, `decodeJid`, ...) agar plugin lama tetap jalan.
- `src/zapo/serialize.js` — event `message` zapo → objek mirip WAMessage untuk `procMsg()`.
- `src/utils/socket.js` — tidak lagi membuat socket Baileys, memakai client zapo yang sudah di-wrap.
- `src/utils/useSQLite.js` dihapus (auth state ditangani store zapo).
- `package.json` — `baileys` dihapus; ditambah `zapo-js`, `@zapo-js/store-sqlite`, `@zapo-js/media-utils`, `file-type`, `async-mutex`.

## Menjalankan
```
npm install
npm start
```
Butuh Node >= 20.9 dan `ffmpeg`/`ffprobe` di PATH. Session lama Baileys tidak kompatibel:
pair ulang, atau konversi dengan `wa-store-migrate`.
