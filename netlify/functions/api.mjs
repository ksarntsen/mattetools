import { ensureSchema, sql } from './_lib/db.mjs';
import {
  HttpError,
  json,
  normalizeText,
  parseDataUrl,
  readJson,
  requireAdmin,
  serializeTool,
  slugify,
  toBool,
  toInt,
  validateHtmlContent,
  validateHttpUrl,
  validateThumbnailDataUrl
} from './_lib/http.mjs';

export const config = {
  path: '/api/*'
};

async function uniqueSlug(base) {
  const db = sql();
  const root = slugify(base);
  let candidate = root;
  let counter = 2;

  while (true) {
    const result = await db.query('SELECT 1 FROM tools WHERE slug = $1 LIMIT 1', [candidate]);
    if (result.rows.length === 0) return candidate;
    candidate = `${root}-${counter}`;
    counter += 1;
  }
}

function parseToolPayload(body, { isCreate = true } = {}) {
  const title = normalizeText(body.title);
  const description = normalizeText(body.description);
  const sortOrder = toInt(body.sortOrder, 0);
  const enabledStudent = toBool(body.enabledStudent);
  const enabledTeacher = toBool(body.enabledTeacher);
  const thumbnailDataUrl = validateThumbnailDataUrl(body.thumbnailDataUrl, { required: isCreate });

  const externalUrlRaw = normalizeText(body.externalUrl);
  const htmlContentRaw = body.htmlContent ? String(body.htmlContent) : '';
  const htmlFilename = normalizeText(body.htmlFilename);

  if (isCreate && !title) {
    throw new HttpError(400, 'Title is required.');
  }

  let sourceType = null;
  let externalUrl = null;
  let htmlContent = null;

  if (externalUrlRaw) {
    sourceType = 'link';
    externalUrl = validateHttpUrl(externalUrlRaw);
  }

  if (htmlContentRaw) {
    if (sourceType) {
      throw new HttpError(400, 'Choose either an external link or an uploaded HTML file, not both.');
    }
    sourceType = 'upload';
    htmlContent = validateHtmlContent(htmlContentRaw);
  }

  if (isCreate && !sourceType) {
    throw new HttpError(400, 'You must provide either an external link or an uploaded HTML file.');
  }

  return {
    title,
    description,
    sortOrder,
    enabledStudent,
    enabledTeacher,
    thumbnailDataUrl,
    sourceType,
    externalUrl,
    htmlContent,
    htmlFilename: htmlContent ? (htmlFilename || 'tool.html') : null
  };
}

async function listPublicTools(audience) {
  const db = sql();
  const column = audience === 'teacher' ? 'enabled_teacher' : 'enabled_student';
  const result = await db.query(
    `SELECT id, slug, title, description, source_type, external_url, html_filename,
            enabled_student, enabled_teacher, sort_order, created_at, updated_at
       FROM tools
      WHERE ${column} = TRUE
      ORDER BY sort_order ASC, title ASC`,
    []
  );
  return result.rows.map(serializeTool);
}

async function listAdminTools() {
  const db = sql();
  const result = await db.query(
    `SELECT id, slug, title, description, source_type, external_url, html_filename,
            enabled_student, enabled_teacher, sort_order, created_at, updated_at
       FROM tools
      ORDER BY sort_order ASC, title ASC`,
    []
  );
  return result.rows.map(serializeTool);
}

async function createTool(req) {
  const body = await readJson(req);
  const payload = parseToolPayload(body, { isCreate: true });
  const db = sql();
  const slug = await uniqueSlug(payload.title);

  const created = await db.query(
    `INSERT INTO tools (
        slug, title, description, source_type, external_url, html_content, html_filename,
        thumbnail_data_url, enabled_student, enabled_teacher, sort_order
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
      RETURNING id, slug, title, description, source_type, external_url, html_filename,
                enabled_student, enabled_teacher, sort_order, created_at, updated_at`,
    [
      slug,
      payload.title,
      payload.description,
      payload.sourceType,
      payload.externalUrl,
      payload.htmlContent,
      payload.htmlFilename,
      payload.thumbnailDataUrl,
      payload.enabledStudent,
      payload.enabledTeacher,
      payload.sortOrder
    ]
  );

  return json({ ok: true, tool: serializeTool(created.rows[0]) }, { status: 201 });
}

async function updateTool(req, id) {
  const body = await readJson(req);
  const db = sql();
  const existingResult = await db.query('SELECT * FROM tools WHERE id = $1 LIMIT 1', [id]);
  const existing = existingResult.rows[0];
  if (!existing) {
    throw new HttpError(404, 'Tool not found.');
  }

  const payload = parseToolPayload(body, { isCreate: false });

  let sourceType = existing.source_type;
  let externalUrl = existing.external_url;
  let htmlContent = existing.html_content;
  let htmlFilename = existing.html_filename;

  if (payload.sourceType === 'link') {
    sourceType = 'link';
    externalUrl = payload.externalUrl;
    htmlContent = null;
    htmlFilename = null;
  } else if (payload.sourceType === 'upload') {
    sourceType = 'upload';
    externalUrl = null;
    htmlContent = payload.htmlContent;
    htmlFilename = payload.htmlFilename;
  }

  const title = payload.title || existing.title;
  const description = body.description !== undefined ? payload.description : existing.description;
  const thumbnailDataUrl = payload.thumbnailDataUrl || existing.thumbnail_data_url;
  const enabledStudent = body.enabledStudent !== undefined ? payload.enabledStudent : existing.enabled_student;
  const enabledTeacher = body.enabledTeacher !== undefined ? payload.enabledTeacher : existing.enabled_teacher;
  const sortOrder = body.sortOrder !== undefined ? payload.sortOrder : existing.sort_order;

  const updated = await db.query(
    `UPDATE tools
        SET title = $2,
            description = $3,
            source_type = $4,
            external_url = $5,
            html_content = $6,
            html_filename = $7,
            thumbnail_data_url = $8,
            enabled_student = $9,
            enabled_teacher = $10,
            sort_order = $11,
            updated_at = NOW()
      WHERE id = $1
      RETURNING id, slug, title, description, source_type, external_url, html_filename,
                enabled_student, enabled_teacher, sort_order, created_at, updated_at`,
    [
      id,
      title,
      description,
      sourceType,
      externalUrl,
      htmlContent,
      htmlFilename,
      thumbnailDataUrl,
      enabledStudent,
      enabledTeacher,
      sortOrder
    ]
  );

  return json({ ok: true, tool: serializeTool(updated.rows[0]) });
}

async function deleteTool(id) {
  const db = sql();
  const result = await db.query('DELETE FROM tools WHERE id = $1 RETURNING id', [id]);
  if (result.rows.length === 0) {
    throw new HttpError(404, 'Tool not found.');
  }
  return json({ ok: true });
}

async function serveMedia(id) {
  const db = sql();
  const result = await db.query('SELECT thumbnail_data_url FROM tools WHERE id = $1 LIMIT 1', [id]);
  const row = result.rows[0];
  if (!row?.thumbnail_data_url) {
    throw new HttpError(404, 'Thumbnail not found.');
  }
  const { mime, bytes } = parseDataUrl(row.thumbnail_data_url);
  return new Response(bytes, {
    headers: {
      'content-type': mime,
      'cache-control': 'public, max-age=3600'
    }
  });
}

export default async function handler(req) {
  try {
    await ensureSchema();

    const url = new URL(req.url);
    const pathname = url.pathname.replace(/\/+$/, '') || '/';
    const method = req.method.toUpperCase();

    if (pathname === '/api/health' && method === 'GET') {
      return json({ ok: true });
    }

    if (pathname === '/api/public-tools' && method === 'GET') {
      const audience = url.searchParams.get('audience') === 'teacher' ? 'teacher' : 'student';
      const tools = await listPublicTools(audience);
      return json({ ok: true, tools });
    }

    if (pathname === '/api/admin/tools' && method === 'GET') {
      requireAdmin(req);
      const tools = await listAdminTools();
      return json({ ok: true, tools });
    }

    if (pathname === '/api/admin/tools' && method === 'POST') {
      requireAdmin(req);
      return await createTool(req);
    }

    const adminMatch = pathname.match(/^\/api\/admin\/tools\/(\d+)$/);
    if (adminMatch) {
      requireAdmin(req);
      const id = Number(adminMatch[1]);
      if (method === 'PATCH' || method === 'PUT') {
        return await updateTool(req, id);
      }
      if (method === 'DELETE') {
        return await deleteTool(id);
      }
    }

    const mediaMatch = pathname.match(/^\/api\/media\/(\d+)$/);
    if (mediaMatch && method === 'GET') {
      return await serveMedia(Number(mediaMatch[1]));
    }

    return json({ ok: false, error: 'Not found.' }, { status: 404 });
  } catch (error) {
    console.error(error);
    const status = error instanceof HttpError ? error.status : 500;
    const message = error instanceof HttpError ? error.message : 'Internal server error.';
    return json({ ok: false, error: message }, { status });
  }
}
