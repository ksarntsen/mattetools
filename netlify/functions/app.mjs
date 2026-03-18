import { ensureSchema, sql } from './_lib/db.mjs';

export const config = {
  path: ['/apps/*']
};

function htmlResponse(content, title = 'App') {
  return new Response(content, {
    status: 200,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
      'x-app-title': title
    }
  });
}

function notFoundResponse() {
  return new Response(
    `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Not found</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{font-family:Arial,sans-serif;background:#0f172a;color:#e5e7eb;margin:0;display:grid;place-items:center;min-height:100vh}
    .card{background:#111827;border:1px solid #334155;border-radius:16px;padding:24px;max-width:520px}
    h1{margin-top:0}
    p{color:#cbd5e1}
  </style>
</head>
<body>
  <div class="card">
    <h1>App not found</h1>
    <p>The requested uploaded app does not exist.</p>
  </div>
</body>
</html>`,
    {
      status: 404,
      headers: {
        'content-type': 'text/html; charset=utf-8'
      }
    }
  );
}

export default async (req) => {
  try {
    await ensureSchema();

    const url = new URL(req.url);
    const slug = url.pathname.replace(/^\/apps\//, '').replace(/\/+$/, '').trim();

    if (!slug) {
      return notFoundResponse();
    }

    const db = sql();
    const rows = await db.query(
      `SELECT title, html_content, enabled_student, enabled_teacher
         FROM tools
        WHERE slug = $1
          AND source_type = 'upload'
        LIMIT 1`,
      [slug]
    );

    const tool = rows[0];

    if (!tool?.html_content) {
      return notFoundResponse();
    }

    return htmlResponse(tool.html_content, tool.title || 'App');
  } catch (error) {
    console.error(error);
    return new Response('Internal server error', { status: 500 });
  }
};
