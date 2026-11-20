/**
 * Esquema relacional local (doc 02). Implementado sobre node:sqlite (builtin
 * do Node 22+) com SQL direto — zero dependência nativa, permite exe single-file.
 */

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  canonical_url TEXT NOT NULL UNIQUE,
  content_hash TEXT NOT NULL,
  source TEXT NOT NULL,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  description_markdown TEXT NOT NULL,
  scope TEXT NOT NULL,
  status TEXT NOT NULL,
  discovered_at TEXT NOT NULL,
  applied_at TEXT,
  resume_path TEXT,
  applied_skills TEXT
);

CREATE TABLE IF NOT EXISTS applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT NOT NULL REFERENCES jobs(id),
  status TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT,
  subject TEXT,
  attachment_path TEXT,
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS ai_usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id TEXT,
  tier TEXT NOT NULL,
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS profile_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  version INTEGER NOT NULL,
  master_md TEXT NOT NULL,
  compiled_json TEXT NOT NULL,
  approved_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;
