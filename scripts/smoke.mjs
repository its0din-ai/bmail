const api = process.env.BMAIL_API_URL ?? "http://127.0.0.1:8787";
const admin = process.env.BMAIL_ADMIN_TOKEN;
const catchAll = process.env.BMAIL_CATCH_ALL ?? "mail.example.com";
const fixedDomain = process.env.BMAIL_FIXED ?? "inbound.example.net";
const fixedAddress = process.env.BMAIL_FIXED_ADDRESS ?? "programs@inbound.example.net";

if (!admin) throw new Error("BMAIL_ADMIN_TOKEN is required");

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`ok   ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name} ${detail}`);
  }
}

async function call(path, options = {}, token = admin) {
  const response = await fetch(`${api}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${token}`,
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: response.status, body };
}

const created = await call("/v1/tokens", {
  method: "POST",
  body: JSON.stringify({ name: "e2e-full", domains: "*" }),
});
check("create full token", created.status === 201 && created.body.token, created.status);
const fullToken = created.body.token;

const scoped = await call("/v1/tokens", {
  method: "POST",
  body: JSON.stringify({ name: "e2e-scoped", domains: [catchAll] }),
});
check("create scoped token", scoped.status === 201 && scoped.body.token, scoped.status);
const scopedToken = scoped.body.token;
const runId = Date.now().toString(36);
const localPart = `e2e-${runId}`;
const catchAllMessageId = `<e2e-${runId}@example.com>`;
const fixedMessageId = `<e2e-fixed-${runId}@example.com>`;

const config = await call("/v1/config", {}, fullToken);
check("full token sees both domains", config.body.mail_domains.length === 2);

const scopedConfig = await call("/v1/config", {}, scopedToken);
check(
  "scoped token sees one domain",
  scopedConfig.body.mail_domains.length === 1 &&
    scopedConfig.body.mail_domains[0].domain === catchAll,
  JSON.stringify(scopedConfig.body),
);

const alias = await call(
  "/v1/aliases",
  { method: "POST", body: JSON.stringify({ local_part: localPart, label: "e2e" }) },
  fullToken,
);
check("create alias", alias.status === 201 && alias.body.address === `${localPart}@${catchAll}`, alias.status);
const aliasId = alias.body.id;

const aliasQuery = `alias_id=${encodeURIComponent(aliasId)}`;

const fixedCreate = await call(
  "/v1/aliases",
  {
    method: "POST",
    body: JSON.stringify({ mail_domain: fixedDomain, local_part: "other" }),
  },
  fullToken,
);
check("reject alias creation on fixed domain", fixedCreate.status === 409, fixedCreate.status);

const raw = `From: Security <security@example.com>
To: ${localPart}@${catchAll}
Subject: Verification
Message-ID: ${catchAllMessageId}
Content-Type: text/plain; charset=utf-8

Your code is 482913.
Open https://example.com/verify?token=abc123 to continue.
`;

async function deliver(to, rawBody) {
  const url = new URL(`${api}/cdn-cgi/handler/email`);
  url.searchParams.set("from", "security@example.com");
  url.searchParams.set("to", to);
  const response = await fetch(url, { method: "POST", body: rawBody });
  return response.status;
}

check("deliver catch-all mail", (await deliver(alias.body.address, raw)) === 200);
const delivered = await call(`/v1/messages?${aliasQuery}&limit=10`, {}, fullToken);
check("message stored once", delivered.body.messages.length === 1, JSON.stringify(delivered.body));
const messageId = delivered.body.messages[0]?.id;
const stored = delivered.body.messages[0];
check("message metadata", stored?.to_addr === alias.body.address && stored?.subject === "Verification");
check("dmarc recorded", stored?.dmarc === "none");

const message = await call(`/v1/messages/${messageId}`, {}, fullToken);
check("get message", message.status === 200 && message.body.id === messageId);

const rawResponse = await fetch(`${api}/v1/messages/${messageId}/raw`, {
  headers: { authorization: `Bearer ${fullToken}` },
});
const rawText = await rawResponse.text();
check("raw message", rawResponse.status === 200 && rawText.includes("482913"));

check("duplicate delivery accepted", (await deliver(alias.body.address, raw)) === 200);
const afterDuplicate = await call(`/v1/messages?${aliasQuery}&limit=10`, {}, fullToken);
check(
  "duplicate message deduplicated",
  afterDuplicate.body.messages.length === 1,
  String(afterDuplicate.body.messages.length),
);

check("deliver fixed-domain mail", (await deliver(fixedAddress, raw.replace(catchAllMessageId, fixedMessageId))) === 200);
const fixedAlias = await call(`/v1/aliases?mail_domain=${fixedDomain}`, {}, fullToken);
check(
  "fixed alias auto-created",
  fixedAlias.body.aliases.length === 1 &&
    fixedAlias.body.aliases[0].address === fixedAddress,
  JSON.stringify(fixedAlias.body),
);
const fixedAliasId = fixedAlias.body.aliases[0]?.id ?? "";
const fixedMessages = await call(
  `/v1/messages?mail_domain=${fixedDomain}&alias_id=${encodeURIComponent(fixedAliasId)}&order=desc&limit=1`,
  {},
  fullToken,
);
check(
  "fixed message stored",
  fixedMessages.body.messages[0]?.message_id === fixedMessageId,
  JSON.stringify(fixedMessages.body.messages[0] ?? null),
);

const scopedOther = await call(`/v1/messages?mail_domain=${fixedDomain}`, {}, scopedToken);
check("scoped token cannot read other domain", scopedOther.status === 403, scopedOther.status);

const scopedList = await call("/v1/messages?limit=10", {}, scopedToken);
check(
  "scoped list only returns allowed domain",
  scopedList.body.messages.every((item) => item.mail_domain === catchAll),
);

const scopedDelete = await call(
  `/v1/aliases/${fixedAliasId}`,
  { method: "DELETE" },
  scopedToken,
);
check("scoped token cannot delete other alias", scopedDelete.status === 404, scopedDelete.status);

const badAuth = await call("/v1/config", {}, "bmail_deadbeefdeadbeef_" + "0".repeat(64));
check("invalid token rejected", badAuth.status === 401, badAuth.status);

const tokens = await call("/v1/tokens");
check("list tokens", tokens.status === 200 && tokens.body.tokens.length >= 2);

const removed = await call(`/v1/tokens/${scoped.body.id}`, { method: "DELETE" });
check("delete token", removed.status === 204, removed.status);

const removedAlias = await call(`/v1/aliases/${alias.body.id}`, { method: "DELETE" }, fullToken);
check("delete alias", removedAlias.status === 204, removedAlias.status);

const removedFull = await call(`/v1/tokens/${created.body.id}`, { method: "DELETE" });
check("delete full token", removedFull.status === 204, removedFull.status);

if (failures > 0) {
  console.error(`${failures} failure(s)`);
  process.exit(1);
}
console.log("smoke test passed");
