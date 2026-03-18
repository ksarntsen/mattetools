import { ensureSchema, sql } from './_lib/db.mjs';
import { html } from './_lib/http.mjs';

export const config = {
  path: '/apps/:slug'
};

const notFoundHtml = (title, message) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 0; background: #f6f7fb; color: #19202a; }
    .wrap { max-width: 720px; margin: 80px auto; padding: 24px; }
    .card { background: white; border-radius: 20px; padding: 28px; box-shadow: 0 12px 32px rgba(20, 30, 55, 0.08); }
    h1 { margin-top: 0; }
    a { color: #2054d3; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${title}</h1>
      <p>${message}</p>
      <p><a href="/mattetoolsstudent.html">Student hub</a></p>
    </div>
  </div>
</body>
</html>`;

export default async function handler(req, context) {
  try {
    await ensureSchema();
    const slug = context.params?.slug;

    if (!slug) {
      return html(notFoundHtml('Not found', 'No app slug was provided.'), { status: 404 });
    }

    const db = sql();
    const result = await db.query(
      `SELECT title, html_content, enabled_student, enabled_teacher
         FROM tools
        WHERE slug = $1
          AND source_type = 'upload'
        LIMIT 1`,
      [slug]
    );

    const tool = result.rows[0];
    if (!tool || !tool.html_content || (!tool.enabled_student && !tool.enabled_teacher)) {
      return html(notFoundHtml('App not available', 'This uploaded tool was not found or is currently disabled.'), { status: 404 });
    }

    return new Response(tool.html_content, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-store'
      }
    });
  } catch (error) {
    console.error(error);
    return html(notFoundHtml('Server error', 'The app could not be loaded.'), { status: 500 });
  }
}
