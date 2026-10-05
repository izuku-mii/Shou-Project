🤖 Shou-Bot

<p align="center">
  <img src="https://raw.githubusercontent.com/Leoojonup/dat4/main/uploads/4923c7-1790087198981.mp4" width="500">
</p><p align="center">
  <b>Simple WhatsApp Bot — Zapo JavaScript</b>
</p><p align="center">
  <img src="https://img.shields.io/badge/Node.js-22.x-339933?style=for-the-badge&logo=node.js&logoColor=white">
  <img src="https://img.shields.io/badge/JavaScript-ESM-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black">
  <img src="https://img.shields.io/badge/Zapo-JavaScript-blue?style=for-the-badge">
  <img src="https://img.shields.io/badge/Database-JavaScript%20v20-orange?style=for-the-badge">
</p>---

📌 About

Shou-Bot adalah WhatsApp bot berbasis JavaScript dengan sistem command/plugin yang sederhana dan mudah dikembangkan.

Bot ini menggunakan:

- 🟨 JavaScript
- 🟢 Node.js 22
- 📦 npm
- ⚡ Zapo JavaScript
- 🗄️ Database JavaScript v20
- 🔌 Sistem plugin/command
- 👑 Owner & Premium system
- 📱 WhatsApp Baileys

---

🧩 Runtime

Type| Version
🟨 JavaScript| ESM
🟢 Node.js| 22.x
📦 npm| Latest
⚡ Zapo| JavaScript
🗄️ Database| JavaScript v20

«Recommended: Node.js 22 atau versi yang kompatibel dengan project.»

---

📁 Project Structure

Shou-Bot/
├── src/
│   ├── commands/
│   │   └── map.js
│   │
│   ├── plugins/
│   │   ├── owner/
│   │   ├── admin/
│   │   ├── fun/
│   │   ├── tools/
│   │   └── ...
│   │
│   ├── start/
│   │   ├── ShouDex.js
│   │   └── ShouConnect.js
│   │
│   └── ...
│
├── data/
│   └── database.db
│
├── sessions/
│
├── .env
├── .env.example
├── package.json
└── README.md

---

⚙️ Installation

1. Clone repository

git clone https://github.com/izuku-mii/Shou-Project.git
cd Shou-Project

2. Install dependencies

npm install

3. Buat ".env"

cp .env.example .env

Kemudian isi konfigurasi sesuai kebutuhan.

4. Jalankan bot

npm start

---

🔐 ".env.example"

# ==============================
# SHOU-BOT CONFIGURATION
# ==============================

BOT=Shou-Bot

# ==============================
# OWNER
# Format:
# [["number","name",true]]
# ==============================

OWNER=[["6283136099660","Shou-1",true],["584269782097","Shou-2",true],["6288277594380","Shou-3",true]]

# ==============================
# PREMIUM
# Owner tidak otomatis menjadi Premium.
# User hanya Premium jika tercantum di PREM
# atau memiliki status premium dari database.
# ==============================

PREM=[["6283172557743","REX",true],["6283136099660","Shou-1",true]]

# ==============================
# BOT SETTINGS
# ==============================

isSelf=false

# ==============================
# GIF / MEDIA
# ==============================

GIF=https://raw.githubusercontent.com/Leoojonup/dat4/main/uploads/4923c7-1790087198981.mp4

# ==============================
# WHATSAPP NEWSLETTER
# ==============================

NEWSLETTER_JID=120363410696658468@newsletter
NEWSLETTER_NAME=SHOU-BOT OWNER SHOUCODER

---

👑 Owner Configuration

Format Owner:

OWNER=[["6283136099660","Shou-1",true],["584269782097","Shou-2",true],["6288277594380","Shou-3",true]]

Setiap data memiliki format:

[number, name, isOwner]

Contoh:

[
  ["6283136099660", "Shou-1", true],
  ["584269782097", "Shou-2", true],
  ["6288277594380", "Shou-3", true]
]

---

💎 Premium Configuration

Format:

PREM=[["6283172557743","REX",true],["6283136099660","Shou-1",true]]

Premium tidak otomatis diberikan kepada semua Owner.

Contohnya:

OWNER
├── Shou-1
├── Shou-2
└── Shou-3

PREM
├── REX
└── Shou-1

Jadi Shou-2 dan Shou-3 tetap Owner tetapi bukan Premium apabila tidak tercantum pada "PREM".

---

🔌 Plugin System

Shou-Bot menggunakan sistem plugin dengan:

import cmd from "../../commands/map.js";

Setiap fitur dapat dibuat sebagai plugin terpisah.

---

🟨 JavaScript Plugin

Contoh plugin:

import cmd from "../../commands/map.js";

cmd.add({
  name: /^(namafitur)$/i,
  category: ["category"],
  admin: false,
  botAdmin: false,
  owner: false,
  desc: "",
  example: "",
  async run({ m, sock: conn }) {

  }
});

---

🧩 Plugin Template

Template lengkap:

import cmd from "../../commands/map.js";

cmd.add({
  name: /^(namafitur)$/i,

  category: ["category"],

  admin: false,

  botAdmin: false,

  owner: false,

  desc: "Deskripsi fitur",

  example: ".namafitur",

  async run({ m, sock: conn }) {

    await conn.sendMessage(
      m.chat,
      {
        text: "Hello World!"
      },
      {
        quoted: m
      }
    );

  }
});

---

👑 Owner Only Plugin

import cmd from "../../commands/map.js";

cmd.add({
  name: /^(namafitur)$/i,

  category: ["owner"],

  admin: false,

  botAdmin: false,

  owner: true,

  desc: "Fitur khusus owner",

  example: ".namafitur",

  async run({ m, sock: conn }) {

    await conn.sendMessage(
      m.chat,
      {
        text: "Owner command!"
      },
      {
        quoted: m
      }
    );

  }
});

---

🛡️ Admin Plugin

import cmd from "../../commands/map.js";

cmd.add({
  name: /^(namafitur)$/i,

  category: ["admin"],

  admin: true,

  botAdmin: false,

  owner: false,

  desc: "Fitur khusus admin",

  example: ".namafitur",

  async run({ m, sock: conn }) {

    await conn.sendMessage(
      m.chat,
      {
        text: "Admin command!"
      },
      {
        quoted: m
      }
    );

  }
});

---

🤖 Bot Admin Plugin

import cmd from "../../commands/map.js";

cmd.add({
  name: /^(namafitur)$/i,

  category: ["admin"],

  admin: true,

  botAdmin: true,

  owner: false,

  desc: "Fitur yang membutuhkan bot sebagai admin",

  example: ".namafitur",

  async run({ m, sock: conn }) {

    await conn.sendMessage(
      m.chat,
      {
        text: "Bot harus menjadi admin."
      },
      {
        quoted: m
      }
    );

  }
});

---

🔥 Owner + Admin

import cmd from "../../commands/map.js";

cmd.add({
  name: /^(namafitur)$/i,

  category: ["owner"],

  admin: true,

  botAdmin: true,

  owner: true,

  desc: "Fitur Owner dan Admin",

  example: ".namafitur",

  async run({ m, sock: conn }) {

    await conn.sendMessage(
      m.chat,
      {
        text: "Access granted!"
      },
      {
        quoted: m
      }
    );

  }
});

---

🗄️ Database

Shou-Bot menggunakan database internal berbasis JavaScript.

Database Type

JavaScript v20

Contoh data user:

{
  users: {
    "6281234567890@s.whatsapp.net": {
      name: "User",
      money: 0,
      bank: 0,
      limit: 30,
      premium: false,
      premiumTime: 0
    }
  }
}

Contoh data chat:

{
  chats: {
    "120363xxxxxxxx@g.us": {
      welcome: true,
      marga: false,
      level: 1
    }
  }
}

---

📦 Database Schema

Contoh collection/table:

users
chats
stats
sticker
settings
guilds
market

---

🟢 JavaScript Version

Untuk source code:

import ...

Gunakan:

JavaScript ES Module

Contoh:

import cmd from "../../commands/map.js";

Bukan:

const cmd = require("../../commands/map.js");

---

📦 NPM

Install project:

npm install

Run:

npm start

Development:

npm run dev

---

🧪 Plugin Example

Plugin sederhana ".ping":

import cmd from "../../commands/map.js";

cmd.add({
  name: /^(ping)$/i,
  category: ["main"],
  admin: false,
  botAdmin: false,
  owner: false,
  desc: "Check bot response",
  example: ".ping",

  async run({ m, sock: conn }) {

    await conn.sendMessage(
      m.chat,
      {
        text: "🏓 Pong!"
      },
      {
        quoted: m
      }
    );

  }
});

---

📋 Command Property

Property| Type| Function
"name"| RegExp| Nama command
"category"| Array| Kategori fitur
"admin"| Boolean| Membutuhkan admin
"botAdmin"| Boolean| Bot harus admin
"owner"| Boolean| Khusus owner
"desc"| String| Deskripsi
"example"| String| Contoh penggunaan
"run"| Function| Fungsi utama

---

🧑‍💻 Developer

Bot Name    : Shou-Bot
Developer   : ShouCoder
Type        : Zapo JavaScript
Runtime     : Node.js 22
Database    : JavaScript v20

---

📢 Newsletter

Name:
SHOU-BOT OWNER SHOUCODER

JID:
120363410696658468@newsletter

---

⚠️ Important

Jangan upload file sensitif ke repository public:

.env
sessions/
data/
node_modules/
*.db
*.sqlite
*.sqlite3

Gunakan ".gitignore":

.env
sessions/
data/
node_modules/
*.db
*.sqlite
*.sqlite3
*.log
*.tmp

Untuk konfigurasi public, gunakan:

.env.example

dan jangan memasukkan token, password, session, atau credential asli.

---

📜 License

Project ini dibuat untuk penggunaan dan pengembangan pribadi.

© ShouCoder
Shou-Bot

---

<p align="center">
  🤖 <b>Shou-Bot</b> — Simple, Fast & Powerful WhatsApp Bot
</p><p align="center">
  Made with ❤️ by <b>ShouCoder</b>
</p>
