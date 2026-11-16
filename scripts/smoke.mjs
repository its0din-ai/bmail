#!/usr/bin/env node

const api = (process.env.bmail_api_url ?? "").replace(/\/+$/, "");
const key = process.env.bmail_api_key ?? "";
const address = process.env.bmail_address ?? "";

if (!api || !key || !address) {
  process.stderr.write(
    "Set bmail_api_url, bmail_api_key, and bmail_address before running the smoke test.\n",
  );
  process.exit(1);
}

const localEmailBase = (
  process.env.bmail_local_email_url ??
  (api.startsWith("http://127.0.0.1") || api.startsWith("http://localhost")
    ? api
    : "")
).replace(/\/+$/, "");

const stamp = Date.now();
const subject = `bmail smoke ${stamp}`;
const marker = `smoke-${stamp}`;
const raw = [
  "From: Smoke Test <smoke@example.com>",
  `To: ${address}`,
  `Subject: ${subject}`,
  `Message-ID: <${marker}@example.com>`,
  "Content-Type: text/plain; charset=utf-8",
  "",
  `This is a bmail sanity check. Marker: ${marker}`,
].join("\r\n");

let failures = 0;
function check(name, condition, detail = "") {
  if (condition) {
    console.log(`ok   ${name}`);
  } else {
    failures += 1;
    console.log(`FAIL ${name}${detail ? ` (${detail})` : ""}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function call(path, options = {}) {
  const response = await fetch(`${api}${path}`, {
    ...options,
    headers: {
      authorization: `Bearer ${key}`,
      ...(options.headers ?? {}),
    },
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, text, json };
}

async function main() {
  const health = await call("/health");
  check("health endpoint", health.status === 200 && health.json?.ok === true, health.status);
  check(
    "worker ready",
    health.json?.ready === true,
    JSON.stringify(health.json?.checks ?? {}),
  );
  if (health.json?.ready !== true) {
    console.log("health checks:", JSON.stringify(health.json?.checks ?? {}));
  }

  const badKey = await fetch(
    `${api}/v1/inbox/${encodeURIComponent(address)}`,
    { headers: { authorization: "Bearer definitely-wrong" } },
  );
  check("wrong API key returns 401", badKey.status === 401, badKey.status);

  const denied = await call(
    `/v1/inbox/${encodeURIComponent("test@notallowed.invalid")}`,
  );
  check("unlisted address returns 403", denied.status === 403, denied.status);

  if (localEmailBase) {
    const deliveryUrl = new URL(`${localEmailBase}/cdn-cgi/handler/email`);
    deliveryUrl.searchParams.set("from", "smoke@example.com");
    deliveryUrl.searchParams.set("to", address);
    const delivered = await fetch(deliveryUrl, { method: "POST", body: raw });
    check("local email delivery", delivered.status === 200, delivered.status);
  } else {
    console.log("");
    console.log(`Send a real email to ${address}`);
    console.log(`with subject: ${subject}`);
    console.log("Waiting up to 90 seconds...");
    console.log("");
  }

  let message = null;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const listed = await call(
      `/v1/inbox/${encodeURIComponent(address)}?limit=50`,
    );
    if (listed.status === 200 && Array.isArray(listed.json?.messages)) {
      message = listed.json.messages.find((item) => item.subject === subject);
      if (message) break;
    }
    await sleep(3000);
  }
  check("message arrives", Boolean(message));
  if (!message) {
    process.exit(1);
  }

  const rawMessage = await call(
    `/v1/inbox/${encodeURIComponent(address)}/${encodeURIComponent(message.id)}`,
  );
  check(
    "raw message contains the marker",
    rawMessage.status === 200 && rawMessage.text.includes(marker),
    rawMessage.status,
  );

  const acknowledged = await call(
    `/v1/inbox/${encodeURIComponent(address)}/${encodeURIComponent(message.id)}`,
    { method: "DELETE" },
  );
  check("ack returns 204", acknowledged.status === 204, acknowledged.status);

  const afterAck = await call(
    `/v1/inbox/${encodeURIComponent(address)}/${encodeURIComponent(message.id)}`,
  );
  check("raw after ack returns 404", afterAck.status === 404, afterAck.status);

  const afterList = await call(
    `/v1/inbox/${encodeURIComponent(address)}?limit=50`,
  );
  check(
    "message no longer listed",
    afterList.status === 200 &&
      Array.isArray(afterList.json?.messages) &&
      !afterList.json.messages.some((item) => item.id === message.id),
    afterList.status,
  );

  if (failures > 0) {
    console.error(`\n${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nSmoke test passed.");
}

main().catch((error) => {
  console.error(`Smoke test failed: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
});
