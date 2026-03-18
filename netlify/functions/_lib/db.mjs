import { neon } from '@neondatabase/serverless';

const databaseUrl = () => Netlify.env.get('DATABASE_URL') || process.env.DATABASE_URL;

let sqlClient;
let schemaReady = false;
let schemaPromise;

export function sql() {
  const url = databaseUrl();
  if (!url) {
    throw new Error('Missing DATABASE_URL environment variable.');
  }
  if (!sqlClient) {
    sqlClient = neon(url);
  }
  return sqlClient;
}

export async function ensureSchema() {
  if (schemaReady) return;
  if (!schemaPromise) {
    schemaPromise = (async () => {
      const db = sql();
      await db`
        CREATE TABLE IF NOT EXISTS tools (
          id BIGSERIAL PRIMARY KEY,
          slug TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          source_type TEXT NOT NULL CHECK (source_type IN ('link', 'upload')),
          external_url TEXT,
          html_content TEXT,
          html_filename TEXT,
          thumbnail_data_url TEXT NOT NULL,
          enabled_student BOOLEAN NOT NULL DEFAULT FALSE,
          enabled_teacher BOOLEAN NOT NULL DEFAULT FALSE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          CONSTRAINT tools_source_check CHECK (
            (source_type = 'link' AND external_url IS NOT NULL AND html_content IS NULL)
            OR
            (source_type = 'upload' AND html_content IS NOT NULL AND external_url IS NULL)
          )
        );
      `;
      await db`CREATE INDEX IF NOT EXISTS tools_sort_idx ON tools (sort_order ASC, title ASC);`;
      await db`CREATE INDEX IF NOT EXISTS tools_enabled_student_idx ON tools (enabled_student) WHERE enabled_student = TRUE;`;
      await db`CREATE INDEX IF NOT EXISTS tools_enabled_teacher_idx ON tools (enabled_teacher) WHERE enabled_teacher = TRUE;`;
      schemaReady = true;
    })();
  }
  await schemaPromise;
}
