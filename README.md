Shou-Project

«Simple WhatsApp Bot berbasis JavaScript
Bot WhatsApp yang ringan, modular, dan mudah dikembangkan.»

Shou-Project adalah base bot WhatsApp sederhana dengan berbagai fitur seperti Group Security, JID Support, Downloader, sistem Owner/Premium, database, dan command handler yang modular.

---

✨ Features

🛡️ Group Security

Menyediakan fitur keamanan dan management grup, seperti:

- Anti-link
- Anti-spam
- Anti-delete
- Anti-view once
- Welcome & goodbye
- Group settings
- Auto moderation
- Detect perubahan subject grup
- Detect perubahan description grup
- Protection untuk member grup
- Support berbagai jenis JID WhatsApp

📱 JID Support

Shou-Project mendukung berbagai format JID WhatsApp dan dapat digunakan untuk kebutuhan:

- User JID
- Group JID
- Participant JID
- LID
- Quoted message
- Mention
- Reply
- Group participant management

⬇️ Downloader

Berbagai fitur downloader dapat ditambahkan sebagai command/plugin, contohnya:

- YouTube
- TikTok
- Instagram
- Facebook
- Spotify
- Pinterest
- Media downloader lainnya

«Downloader dapat membutuhkan dependency atau cookies tertentu tergantung sumber yang digunakan.»

⚙️ Command System

Command dibuat menggunakan sistem map sehingga mudah ditambahkan dan dikelola.

Contoh command:

import cmd from "../commands/map.js";

cmd.add({
    name: "menu",
    alias: ["help", "list"],
    category: ["info"],
    desc: "Show all commands or filter by category with detailed information",
    async run({ m, args }) {
        return m.reply("Hello World");
    }
});

Setelah command ditambahkan, command tersebut dapat dipanggil menggunakan:

.menu

Alias juga dapat digunakan:

.help
.list

---

📦 Installation

Clone repository:

git clone https://github.com/USERNAME/Shou-Project.git
cd Shou-Project

Install dependency:

npm install

atau menggunakan Bun:

bun install

Kemudian buat file:

.env

---

🔐 Environment

Contoh konfigurasi ".env":

BOT=Shou-Bot

OWNER=[["Nomor Owner","Name Owner",true]]

PREM=[["Nomor Prem","Nama Prem",true]]

isSelf=false

OWNER

Format:

OWNER=[["Nomor Owner","Name Owner",true]]

Contoh:

OWNER=[["628xxxxxxxxxx","Shou",true]]

Struktur:

["Nomor", "Nama", true]

Nilai "true" dapat digunakan sebagai penanda owner utama sesuai implementasi bot.

PREM

Format:

PREM=[["Nomor Prem","Nama Prem",true]]

Contoh:

PREM=[["628xxxxxxxxxx","Premium User",true]]

---

🍪 YouTube Cookies

Beberapa downloader YouTube dapat membutuhkan cookies agar proses download lebih stabil atau dapat mengakses video yang memerlukan autentikasi.

Jika menggunakan VPS, cookies YouTube dapat disimpan sebagai:

cookies.txt

Letakkan file tersebut sesuai path yang digunakan oleh downloader/project.

Firefox

Salah satu cara mendapatkan cookies adalah menggunakan extension Firefox seperti:

Get cookies.txt LOCALLY

Cari extension tersebut di Firefox Add-ons, install, lalu gunakan untuk mengekspor cookies dari YouTube ke format:

cookies.txt

«⚠️ Jangan upload "cookies.txt" ke repository publik. Cookies dapat berisi informasi autentikasi akun.»

Tambahkan ke ".gitignore":

cookies.txt
.env
auth/
sessions/

---

📁 Project Structure

Contoh struktur project:

Shou-Project/
│
├── commands/
│   ├── map.js
│   └── ...
│
├── plugins/
│   ├── info/
│   ├── owner/
│   ├── group/
│   ├── downloader/
│   └── ...
│
├── utils/
│   ├── ...
│
├── scrape/
│   ├── ...
│
├── database/
│   └── ...
│
├── media/
│   └── ...
│
├── tmp/
│   └── ...
│
├── sessions/
│   └── ...
│
├── .env
├── .gitignore
├── package.json
└── README.md

Struktur folder dapat berbeda tergantung versi dan konfigurasi project.

---

🧩 Membuat Command

Import command map:

import cmd from "../commands/map.js";

Kemudian tambahkan command:

cmd.add({
    name: "menu",
    alias: ["help", "list"],
    category: ["info"],
    desc: "Show all commands or filter by category with detailed information",
    async run({ m, args }) {
        return m.reply("Hello World");
    }
});

Parameter

Property| Fungsi
"name"| Nama utama command
"alias"| Alias command
"category"| Kategori command
"desc"| Deskripsi command
"run"| Function yang dijalankan

Contoh:

cmd.add({
    name: "ping",
    alias: ["p"],
    category: ["info"],
    desc: "Check bot response",
    async run({ m }) {
        return m.reply("Pong!");
    }
});

Command:

.ping

atau:

.p

---

💬 Command Example

Setelah bot berjalan:

.menu

Contoh command lainnya:

.ping
.help
.owner
.runtime
.speed
.tiktok <url>
.youtube <url>
.play <query>
.sticker

Command yang tersedia bergantung pada plugin yang terpasang.

---

👑 Owner & Premium

Shou-Project memiliki sistem akses yang dapat digunakan untuk membedakan:

- Owner
- Premium user
- User biasa

Contoh penggunaan:

cmd.add({
    name: "owner",
    category: ["owner"],
    desc: "Owner only command",
    owner: true,

    async run({ m }) {
        return m.reply("Owner command");
    }
});

Implementasi permission dapat disesuaikan dengan handler project.

---

🛠️ Development

Untuk menambahkan fitur baru, buat plugin/command kemudian daftarkan menggunakan:

import cmd from "../commands/map.js";

cmd.add({
    name: "example",
    alias: [],
    category: ["tools"],
    desc: "Example command",

    async run({ m, args }) {
        return m.reply("Example");
    }
});

Dengan sistem ini, command dapat dipisahkan menjadi beberapa plugin tanpa harus membuat satu file handler yang sangat besar.

---

🔒 Security

Jangan pernah membagikan file berikut ke publik:

.env
cookies.txt
sessions/
auth/
credentials/
database/

Terutama:

- Session WhatsApp
- Authentication credentials
- YouTube cookies
- API keys
- Token
- Password
- Private configuration

Gunakan ".gitignore":

.env
cookies.txt
auth/
sessions/
credentials/
node_modules/
tmp/
.cache/

---

📜 License

Gunakan dan modifikasi project ini sesuai license yang terdapat di repository.

Jika melakukan redistribusi atau modifikasi besar, disarankan tetap memberikan credit kepada developer/original project.

---

❤️ Shou-Project

Simple. Modular. Easy to Customize.

Dibuat untuk mempermudah pengembangan bot WhatsApp berbasis JavaScript.
