# 🤖 Shou-Bot

<p align="center">
  <b>Simple WhatsApp Bot</b>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/JavaScript-ESM-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black" alt="JavaScript">
  <img src="https://img.shields.io/badge/Node.js-22.x-339933?style=for-the-badge&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/npm-Zapo-CB3837?style=for-the-badge&logo=npm&logoColor=white" alt="npm">
  <img src="https://img.shields.io/badge/Database-JavaScript%20v20-orange?style=for-the-badge&logo=javascript&logoColor=white" alt="Database">
</p>

---

## 📌 About

**Shou-Bot** adalah WhatsApp Bot berbasis JavaScript yang menggunakan sistem command/plugin sederhana dan mudah dikembangkan.

### ⚡ Information

| Property | Value |
|---|---|
| 🤖 Bot Name | Shou-Bot |
| 👨‍💻 Developer | ShouCoder |
| 🟨 Language | JavaScript |
| 🟢 Node.js | 22.x |
| 📦 Package Manager | npm |
| ⚡ Type | Zapo JavaScript |
| 🗄️ Database | JavaScript v20 |
| 📱 Platform | WhatsApp |
| 🔌 System | Plugin / Command |

---

# 🧰 Requirements

- Node.js **22.x**
- npm
- Git
- WhatsApp account

---

# 📥 Installation

Clone repository:

```bash
git clone https://github.com/izuku-mii/Shou-Project.git
cd Shou-Project
```

Install dependencies:

```bash
npm install
```

Buat file `.env`:

```bash
cp .env.example .env
```

Kemudian jalankan bot:

```bash
npm start
```

Untuk development:

```bash
npm run dev
```

---

# ⚙️ Environment

Buat file:

```text
.env
```

Gunakan konfigurasi berikut:

```env
BOT=Shou-Bot

OWNER=[["62xxxxxx","Shou-1",true],["62xxxxxx","Shou-2",true],["62xxxxxx","Shou-3",true]]

PREM=[["62xxxx","Shou-1",true],["62xxxx","Shou-2",true]]

isSelf=false

GIF=https://raw.githubusercontent.com/Leoojonup/dat4/main/uploads/4923c7-1790087198981.mp4

NEWSLETTER_JID=120363410696658468@newsletter

NEWSLETTER_NAME=SHOU-BOT OWNER SHOUCODER
```

---

# 🔐 Owner

Format:

```text
OWNER=[
  ["number","name",true]
]
```

Contoh:

```env
OWNER=[["62xxxxxx","Shou-1",true],["62xxxxxx","Shou-2",true],["62xxxxxx","Shou-3",true]]
```

Owner:

```text
Shou-1
Shou-2
Shou-3
```

---

# 💎 Premium

Premium menggunakan konfigurasi terpisah dari Owner.

```env
PREM=[["62xxxx","Shou-1",true],["62xxxx","Shou-2",true]]
```

**Owner tidak otomatis menjadi Premium.**

User hanya mendapatkan status Premium apabila

- terdapat di `PREM`
- memiliki `user.premium`
- memiliki `user.premiumTime`

Contoh:

```text
OWNER
├── Shou-1
├── Shou-2
└── Shou-3

PREMIUM
├── REX
└── Shou-1
```

Jadi `Shou-2` dan `Shou-3` tetap Owner tetapi tidak otomatis Premium.

---

# 🟨 JavaScript

Shou-Bot menggunakan **JavaScript ESM**.

Contoh import:

```js
import cmd from "../../commands/map.js";
```

Gunakan:

```js
import ...
```

bukan:

```js
const ...
```

untuk module internal yang menggunakan ESM.

---

# 📦 npm / Zapo

Project menggunakan:

```text
Type: Zapo JavaScript
Package Manager: npm
Node.js: 22.x
```

Install:

```bash
npm install
```

Run:

```bash
npm start
```

Development:

```bash
npm run dev
```

---

# 🗄️ Database

Database project menggunakan:

```text
JavaScript v20
```

Contoh struktur data:

```js
{
  users: {},
  chats: {},
  stats: {},
  sticker: {},
  settings: {},
  guilds: {},
  market: {}
}
```

### User

```js
{
  name: "User",
  money: 0,
  bank: 0,
  limit: 30,
  premium: false,
  premiumTime: 0
}
```

### Chat

```js
{
  welcome: false,
  marga: false,
  level: 1
}
```

---

# 🔌 Plugin System

Plugin Shou-Bot menggunakan:

```js
import cmd from "../../commands/map.js";
```

Kemudian command ditambahkan menggunakan:

```js
cmd.add({
  ...
});
```

---

# 🧩 Plugin Example

Contoh plugin `.ping`:

```js
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
```

---

# 🛠️ Plugin Template

Template dasar:

```js
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
```

---

# 👑 Owner Plugin

Untuk command yang hanya dapat digunakan Owner:

```js
import cmd from "../../commands/map.js";

cmd.add({
  name: /^(namafitur)$/i,
  category: ["owner"],
  admin: false,
  botAdmin: false,
  owner: true,
  desc: "Owner command",
  example: ".namafitur",

  async run({ m, sock: conn }) {

  }
});
```

---

# 🛡️ Admin Plugin

```js
import cmd from "../../commands/map.js";

cmd.add({
  name: /^(namafitur)$/i,
  category: ["admin"],
  admin: true,
  botAdmin: false,
  owner: false,
  desc: "Admin command",
  example: ".namafitur",

  async run({ m, sock: conn }) {

  }
});
```

---

# 🤖 Bot Admin Plugin

```js
import cmd from "../../commands/map.js";

cmd.add({
  name: /^(namafitur)$/i,
  category: ["admin"],
  admin: true,
  botAdmin: true,
  owner: false,
  desc: "Command yang membutuhkan Bot Admin",
  example: ".namafitur",

  async run({ m, sock: conn }) {

  }
});
```

---

# 📋 Command Properties

| Property | Type | Description |
|---|---|---|
| `name` | `RegExp` | Nama atau pola command |
| `category` | `Array` | Kategori fitur |
| `admin` | `Boolean` | Membutuhkan status Admin |
| `botAdmin` | `Boolean` | Bot harus menjadi Admin |
| `owner` | `Boolean` | Hanya Owner |
| `desc` | `String` | Deskripsi command |
| `example` | `String` | Contoh penggunaan |
| `run` | `Function` | Fungsi utama command |

---

# 📁 Project Structure

```text
Shou-Project/
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
├── sessions/
├── .env
├── .env.example
├── .gitignore
├── package.json
└── README.md
```

---

# 📢 Newsletter

### Name

```text
SHOU-BOT OWNER SHOUCODER
```

### JID

```text
120363410696658468@newsletter
```

---

# 🎞️ GIF / Media

Media default:

```text
https://raw.githubusercontent.com/Leoojonup/dat4/main/uploads/4923c7-1790087198981.mp4
```

Environment:

```env
GIF=https://raw.githubusercontent.com/Leoojonup/dat4/main/uploads/4923c7-1790087198981.mp4
```

---

# 🔒 Security

Jangan upload file sensitif ke repository.

Tambahkan ke `.gitignore`:

```gitignore
.env
node_modules/
sessions/
data/
*.db
*.sqlite
*.sqlite3
*.log
*.tmp
```

Gunakan:

```text
.env.example
```

untuk memberikan contoh konfigurasi tanpa credential rahasia.

---

# 🚀 Start

Setelah `.env` selesai:

```bash
npm install
npm start
```

Development:

```bash
npm run dev
```

---

# 👨‍💻 Developer

```text
Bot      : Shou-Bot
Developer: ShouCoder
Language : JavaScript
Type     : Zapo JavaScript
Node.js  : 22.x
Database : JavaScript v20
```

---

# 📜 License

© ShouCoder

Shou-Bot — WhatsApp Bot Project.

---

<p align="center">
  🤖 <b>Shou-Bot</b>
</p>

<p align="center">
  Made with ❤️ by <b>ShouCoder</b>
</p>
