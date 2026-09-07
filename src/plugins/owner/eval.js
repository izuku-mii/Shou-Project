import cmd from "../../commands/map.js";
import { spawn } from "child_process";
import util from "util";
import { inspect } from "node:util";

export async function executeCode(code, context = {}) {
  let transformed = code;

  // === SUPPORT CJS (require) dengan fallback ke ESM ===
  // 1. require dengan destructuring
  transformed = transformed.replace(
    /const\s*\{([^}]+)\}\s*=\s*require\s*\(\s*(['"])([^'"]+)\2\s*\)/g,
    (_, names, q, mod) => {
      return `const { ${names} } = await (async () => { 
        try { 
          return require(${q}${mod}${q}); 
        } catch(e) { 
          return await import(${q}${mod}${q}); 
        } 
      })()`;
    }
  );

  // 2. require biasa
  transformed = transformed.replace(
    /const\s+(\w+)\s*=\s*require\s*\(\s*(['"])([^'"]+)\2\s*\)/g,
    (_, name, q, mod) => {
      return `const ${name} = await (async () => { 
        try { 
          return require(${q}${mod}${q}); 
        } catch(e) { 
          return (await import(${q}${mod}${q})).default; 
        } 
      })()`;
    }
  );

  // 3. require langsung (tanpa const)
  transformed = transformed.replace(
    /require\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
    (_, q, mod) => {
      return `await (async () => { 
        try { 
          return require(${q}${mod}${q}); 
        } catch(e) { 
          return (await import(${q}${mod}${q})).default; 
        } 
      })()`;
    }
  );

  // === SUPPORT ESM (import) ===
  // import default
  transformed = transformed.replace(
    /import\s+(\w+)\s+from\s+(['"])([^'"]+)\2/g,
    (_, name, q, mod) => {
      return `const ${name} = (await import(${q}${mod}${q})).default ?? (await import(${q}${mod}${q}))`;
    }
  );

  // import named
  transformed = transformed.replace(
    /import\s*\{([^}]+)\}\s*from\s*(['"])([^'"]+)\2/g,
    (_, names, q, mod) => {
      return `const { ${names} } = await import(${q}${mod}${q})`;
    }
  );

  // import namespace
  transformed = transformed.replace(
    /import\s+\*\s+as\s+(\w+)\s+from\s+(['"])([^'"]+)\2/g,
    (_, name, q, mod) => {
      return `const ${name} = await import(${q}${mod}${q})`;
    }
  );

  // === FIX: Handle top-level await dan function calls ===
  const lines = transformed.trim().split("\n");
  
  // Cari baris terakhir yang bukan komentar/empty
  let lastIndex = lines.length - 1;
  while (lastIndex >= 0 && (lines[lastIndex].trim() === '' || lines[lastIndex].trim().startsWith('//') || lines[lastIndex].trim().startsWith('/*'))) {
    lastIndex--;
  }
  
  if (lastIndex >= 0) {
    let last = lines[lastIndex].trim().replace(/;$/, "");
    
    // Cek apakah ini function/method call atau JSON.stringify
    const isFunctionCall = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)*\s*\([\s\S]*\)$/.test(last);
    const isJSONStringify = /^JSON\.stringify\s*\(/.test(last);
    
    if (isFunctionCall || isJSONStringify) {
      if (!last.startsWith('await') && !last.startsWith('return')) {
        lines[lastIndex] = `return await ${last}`;
        transformed = lines.join("\n");
      }
    }
  }

  // === EKSEKUSI ===
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  
  try {
    const fn = new AsyncFunction(
      "context", 
      ` with (context) { 
        ${transformed} 
      } `
    );
    const result = await fn(context);
    return toText(result);
  } catch (err) {
    return toText(err);
  }
}

function toText(value) {
  if (value === undefined) return "undefined";
  if (value instanceof Error) {
    return `${value.name}: ${value.message}\n${value.stack}`;
  }
  if (typeof value === "string") return value;
  return inspect(value, { 
    depth: Infinity, 
    colors: false, 
    compact: false,
    maxArrayLength: Infinity,
    maxStringLength: Infinity
  });
}

cmd.add({
  name: "exec",
  alias: ["shell", "$"],
  category: ["owner"],
  desc: "Execute shell command (owner only)",
  isOwner: true,

  async run({ m, args }) {
    const command = (args || []).join(" ").trim();

    if (!command)
      return m.reply("Masukkan command untuk dijalankan.");

    const commandParts = command.split(" ");
    const cmdName = commandParts[0];
    const cmdArgs = commandParts.slice(1);

    if (!cmdName)
      return m.reply("Invalid command.");

    const execProcess = spawn(cmdName, cmdArgs, {
      cwd: process.cwd(),
      shell: false,
      stdio: ["pipe", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    execProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    execProcess.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    const timeout = setTimeout(() => {
      execProcess.kill("SIGTERM");
      stderr += "\n[!] Command terminated: terlalu lama dijalankan.";
    }, 15000);

    execProcess.on("close", (code) => {
      clearTimeout(timeout);

      let output = "";

      if (code === 0 && stdout.trim()) {
        output = stdout.trim();
      } else if (stderr.trim()) {
        output = stderr.trim();
      } else {
        output = "No output.";
      }

      m.reply("```" + output + "```");
    });

    execProcess.on("error", (err) => {
      clearTimeout(timeout);
      m.reply(
        "Error menjalankan command:\n```" +
        err.message +
        "```"
      );
    });
  },
});

cmd.add({
  name: "execute",
  alias: ["eval", "ev"],
  category: ["owner"],
  desc: "Execute JavaScript",
  isOwner: true,

  async run({ m, sock, isOwner }) {
    const text = m.text
      .trim()
      .split(" ")
      .slice(1)
      .join(" ");

    if (!text) {
      return m.reply(
        `Contoh:
.execute
async function main() {
  return "test"
}

main()`
      );
    }

    const context = {
      sock,
      m,
      isOwner
    };

    const result = await executeCode(
      text,
      context
    );

    await m.reply(result);
  }
});