import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";

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
const dryRun = process.env.bmail_deploy_dry_run === "1";
if (!env.bmail_mail_domains) throw new Error("bmail_mail_domains is required");
if (!env.bmail_api_key) throw new Error("bmail_api_key is required");
if (env.bmail_api_key.length < 16) {
  throw new Error("bmail_api_key must be at least 16 characters");
}
if (!env.cloudflare_r2_bucket_name) {
  throw new Error("cloudflare_r2_bucket_name is required");
}
const lifecycleDays = env.bmail_lifecycle_days
  ? Number(env.bmail_lifecycle_days)
  : 7;
if (!Number.isInteger(lifecycleDays) || lifecycleDays < 1 || lifecycleDays > 3650) {
  throw new Error("bmail_lifecycle_days must be an integer from 1 to 3650");
}

const config = JSON.parse(readFileSync("wrangler.jsonc", "utf8"));
if (env.cloudflare_worker_name) config.name = env.cloudflare_worker_name;
if (config.r2_buckets?.[0]) {
  config.r2_buckets[0].bucket_name = env.cloudflare_r2_bucket_name;
}

const generated = "wrangler.deploy.jsonc";
writeFileSync(generated, `${JSON.stringify(config, null, 2)}\n`);

const args = ["deploy", "--config", "wrangler.deploy.jsonc"];
if (dryRun) args.push("--dry-run");
if (env.cloudflare_account_id) {
  args.push("--account-id", env.cloudflare_account_id);
}
args.push("--var", `bmail_mail_domains:${env.bmail_mail_domains}`);
args.push("--var", `bmail_forward_to:${env.bmail_forward_to || "none"}`);

const deployed = spawnSync("wrangler", args, {
  stdio: "inherit",
});

if (deployed.status !== 0) {
  rmSync(generated, { force: true });
  process.exit(deployed.status ?? 1);
}

if (!dryRun) {
  const secret = spawnSync(
    "wrangler",
    ["secret", "put", "bmail_api_key", "--config", "wrangler.deploy.jsonc"],
    {
      input: `${env.bmail_api_key}\n`,
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  if (secret.status !== 0) {
    rmSync(generated, { force: true });
    process.exit(secret.status ?? 1);
  }
}

if (!dryRun) {
  const lifecycleFile = "lifecycle.json";
  const maxAge = lifecycleDays * 24 * 60 * 60;
  writeFileSync(
    lifecycleFile,
    `${JSON.stringify(
      {
        rules: [
          {
            id: "bmail-expire-mail",
            conditions: { prefix: "mail/" },
            enabled: true,
            deleteObjectsTransition: {
              condition: { type: "Age", maxAge },
            },
          },
          {
            id: "bmail-expire-latest",
            conditions: { prefix: "latest/" },
            enabled: true,
            deleteObjectsTransition: {
              condition: { type: "Age", maxAge },
            },
          },
        ],
      },
      null,
      2,
    )}\n`,
  );
  const lifecycle = spawnSync(
    "wrangler",
    [
      "r2",
      "bucket",
      "lifecycle",
      "set",
      env.cloudflare_r2_bucket_name,
      "--file",
      "lifecycle.json",
      "--force",
    ],
    { stdio: "inherit" },
  );
  rmSync(lifecycleFile, { force: true });
  if (lifecycle.status !== 0) {
    rmSync(generated, { force: true });
    process.stderr.write(
      `bmail: worker deployed, but the R2 lifecycle rule failed. Set it manually or fix permissions.\n`,
    );
    process.exit(lifecycle.status ?? 1);
  }
}

rmSync(generated, { force: true });
process.stdout.write(dryRun ? "bmail deploy dry run ok\n" : "bmail deployed\n");
