import { neon } from '@neondatabase/serverless';

let cached = null;

const databaseUrl = () =>
  process.env.DATABASE_URL ||
  globalThis.Netlify?.env?.get?.('DATABASE_URL') ||
  '';

export function sql() {
  const url = databaseUrl();

  if (!url) {
    throw new Error('DATABASE_URL is not configured.');
  }

  if (!cached) {
    cached = neon(url);
  }

  return {
    query(text, params = []) {
      return cached.query(text, params);
    }
  };
}

let schemaReady = false;

export async function ensureSchema() {
  if (schemaReady) return;

  const db = sql();
  await db.query(`
    CREATE TABLE IF NOT EXISTS tools (
      id BIGSERIAL PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      source_type TEXT NOT NULL CHECK (source_type IN ('link', 'upload')),
      external_url TEXT,
      html_content TEXT,
      html_filename TEXT,
      thumbnail_data_url TEXT,
      enabled_student BOOLEAN NOT NULL DEFAULT FALSE,
      enabled_teacher BOOLEAN NOT NULL DEFAULT FALSE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_tools_enabled_student
    ON tools (enabled_student, sort_order, title)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_tools_enabled_teacher
    ON tools (enabled_teacher, sort_order, title)
  `);

  schemaReady = true;
}
