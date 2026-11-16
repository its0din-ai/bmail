CREATE TABLE IF NOT EXISTS aliases (
  id TEXT PRIMARY KEY,
  mail_domain TEXT NOT NULL,
  local_part TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (mail_domain, local_part)
);

CREATE INDEX IF NOT EXISTS idx_aliases_domain_created
  ON aliases (mail_domain, created_at);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  alias_id TEXT NOT NULL,
  mail_domain TEXT NOT NULL,
  from_addr TEXT NOT NULL,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  message_id TEXT,
  dmarc TEXT NOT NULL DEFAULT 'none',
  size INTEGER NOT NULL,
  raw_r2_key TEXT NOT NULL,
  received_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_domain_received
  ON messages (mail_domain, received_at);

CREATE INDEX IF NOT EXISTS idx_messages_alias_received
  ON messages (alias_id, received_at);

CREATE INDEX IF NOT EXISTS idx_messages_message_id
  ON messages (message_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_message_id_unique
  ON messages (message_id)
  WHERE message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS agent_tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  domains TEXT NOT NULL,
  expires_at TEXT,
  created_at TEXT NOT NULL
);
