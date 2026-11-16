import { readFileSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

function parseEnv(path) {
  const values = {};
  let raw;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`${path} not found; copy .env.example to .env first`);
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const index = trimmed.indexOf("=");
    if (index <= 0) continue;
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

const env = parseEnv(".env");
const keys = [
  "bmail_mail_domains",
  "bmail_fixed_addresses",
  "bmail_default_mail_domain",
  "bmail_forward_to",
  "bmail_retention_days",
  "bmail_token_pepper",
  "bmail_admin_token",
];
const lines = keys
  .filter((key) => env[key] !== undefined)
  .map((key) => `${key}=${env[key]}`);
writeFileSync("worker/.dev.vars", `${lines.join("\n")}\n`);

const child = spawn(
  "wrangler",
  ["dev", "--ip", "127.0.0.1", "--port", "8787"],
  { cwd: "worker", stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 0));
