import { ensureSchema, sql } from './_lib/db.mjs';
import {
  HttpError,
  badRequest,
  json,
  methodNotAllowed,
  notFound,
  readJson,
  serverError
} from './_lib/http.mjs';

export const config = {
  path: ['/api/*']
};

function slugify(input) {
  return String(input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'tool';
}

function serializeTool(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    sourceType: row.source_type,
    externalUrl: row.external_url,
    htmlFilename: row.html_filename,
    enabledStudent: row.enabled_student,
    enabledTeacher: row.enabled_teacher,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    thumbnailUrl: `/api/media/${row.id}`,
    launchUrl: row.source_type === 'link' ? row.external_url : `/apps/${row.slug}`
  };
}

function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || '');
  if (!match) {
    throw new HttpError(400, 'Invalid thumbnail format.');
  }
  const mime = match[1];
  const bytes = Uint8Array.from(Buffer.from(match[2], 'base64'));
  return { mime, bytes };
}

function parseToolPayload(body, { isCreate }) {
  const sourceType = body.sourceType;

  if (sourceType !== 'link' && sourceType !== 'upload') {
    throw badRequest('sourceType must be "link" or "upload".');
  }

  const title = String(body.title || '').trim();
  if (isCreate && !title) {
    throw badRequest('Title is required.');
  }

  const description = String(body.description || '').trim();

  let externalUrl = null;
  let htmlContent = null;
  let htmlFilename = null;

  if (sourceType === 'link') {
    externalUrl = String(body.externalUrl || '').trim();
    if (isCreate && !externalUrl) {
      throw badRequest('External URL is required for link tools.');
    }
  } else {
    htmlContent = String(body.htmlContent || '');
    htmlFilename = String(body.htmlFilename || '').trim() || 'app.html';
    if (isCreate && !htmlContent) {
      throw badRequest('HTML content is required for uploaded tools.');
    }
  }

  const thumbnailDataUrl = String(body.thumbnailDataUrl || '').trim();
  if (isCreate && !thumbnailDataUrl) {
    throw badRequest('Thumbnail is required.');
  }

  const enabledStudent = Boolean(body.enabledStudent);
  const enabledTeacher = Boolean(body.enabledTeacher);
  const sortOrder = Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0;

  return {
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
  };
}

async function uniqueSlug(base) {
  const db = sql();
  const root = slugify(base);
  let candidate = root;
  let counter = 2;

  while (true) {
    const rows = await db.query('SELECT 1 FROM tools WHERE slug = $1 LIMIT 1', [candidate]);
    if (rows.length === 0) return candidate;
    candidate = `${root}-${counter}`;
    counter += 1;
  }
}

async function listPublicTools(audience) {
  const db = sql();
  const column = audience === 'teacher' ? 'enabled_teacher' : 'enabled_student';

  const rows = await db.query(
    `SELECT id, slug, title, description, source_type, external_url, html_filename,
            enabled_student, enabled_teacher, sort_order, created_at, updated_at
       FROM tools
      WHERE ${column} = TRUE
      ORDER BY sort_order ASC, title ASC`,
    []
  );

  return rows.map(serializeTool);
}

async function listAdminTools() {
  const db = sql();

  const rows = await db.query(
    `SELECT id, slug, title, description, source_type, external_url, html_filename,
            enabled_student, enabled_teacher, sort_order, created_at, updated_at
       FROM tools
      ORDER BY sort_order ASC, title ASC`,
    []
  );

  return rows.map(serializeTool);
}

async function createTool(req) {
  const body = await readJson(req);
  const payload = parseToolPayload(body, { isCreate: true });
  const db = sql();
  const slug = await uniqueSlug(payload.title);

  const rows = await db.query(
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

  return json({ ok: true, tool: serializeTool(rows[0]) }, { status: 201 });
}

async function updateTool(req, id) {
  const body = await readJson(req);
  const db = sql();

  const existingRows = await db.query('SELECT * FROM tools WHERE id = $1 LIMIT 1', [id]);
  const existing = existingRows[0];

  if (!existing) {
    throw new HttpError(404, 'Tool not found.');
  }

  const title = body.title !== undefined ? String(body.title).trim() || existing.title : existing.title;
  const description = body.description !== undefined ? String(body.description).trim() : existing.description;
  const enabledStudent = body.enabledStudent !== undefined ? Boolean(body.enabledStudent) : existing.enabled_student;
  const enabledTeacher = body.enabledTeacher !== undefined ? Boolean(body.enabledTeacher) : existing.enabled_teacher;
  const sortOrder = body.sortOrder !== undefined
    ? (Number.isFinite(Number(body.sortOrder)) ? Number(body.sortOrder) : 0)
    : existing.sort_order;
  const thumbnailDataUrl = body.thumbnailDataUrl || existing.thumbnail_data_url;

  let sourceType = existing.source_type;
  let externalUrl = existing.external_url;
  let htmlContent = existing.html_content;
  let htmlFilename = existing.html_filename;

  if (body.sourceType) {
    if (body.sourceType !== 'link' && body.sourceType !== 'upload') {
      throw badRequest('sourceType must be "link" or "upload".');
    }
    sourceType = body.sourceType;
    if (sourceType === 'link') {
      externalUrl = body.externalUrl !== undefined ? String(body.externalUrl).trim() : existing.external_url;
      htmlContent = null;
      htmlFilename = null;
    } else {
      htmlContent = body.htmlContent !== undefined ? String(body.htmlContent) : existing.html_content;
      htmlFilename = body.htmlFilename !== undefined ? String(body.htmlFilename).trim() || 'app.html' : existing.html_filename;
      externalUrl = null;
    }
  }

  const rows = await db.query(
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

  return json({ ok: true, tool: serializeTool(rows[0]) });
}

async function deleteTool(id) {
  const db = sql();
  const rows = await db.query('DELETE FROM tools WHERE id = $1 RETURNING id', [id]);

  if (rows.length === 0) {
    throw new HttpError(404, 'Tool not found.');
  }

  return json({ ok: true });
}

async function serveMedia(id) {
  const db = sql();
  const rows = await db.query('SELECT thumbnail_data_url FROM tools WHERE id = $1 LIMIT 1', [id]);
  const row = rows[0];

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

export default async (req) => {
  try {
    await ensureSchema();

    const url = new URL(req.url);
    const path = url.pathname.replace(/^\/api/, '') || '/';

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
          'access-control-allow-headers': 'content-type,x-admin-password'
        }
      });
    }

    if (path === '/health' && req.method === 'GET') {
      return json({ ok: true });
    }

    if (path === '/public-tools' && req.method === 'GET') {
      const audience = url.searchParams.get('audience') === 'teacher' ? 'teacher' : 'student';
      const tools = await listPublicTools(audience);
      return json({ ok: true, tools });
    }

    if (path.startsWith('/media/') && req.method === 'GET') {
      const id = Number(path.split('/')[2]);
      if (!Number.isFinite(id)) {
        throw badRequest('Invalid media id.');
      }
      return await serveMedia(id);
    }

    const adminPassword =
      req.headers.get('x-admin-password') ||
      req.headers.get('X-Admin-Password') ||
      '';

    const expected =
      process.env.ADMIN_PASSWORD ||
      globalThis.Netlify?.env?.get?.('ADMIN_PASSWORD') ||
      '';

    if (!expected || adminPassword !== expected) {
      throw new HttpError(401, 'Unauthorized.');
    }

    if (path === '/admin/tools' && req.method === 'GET') {
      const tools = await listAdminTools();
      return json({ ok: true, tools });
    }

    if (path === '/admin/tools' && req.method === 'POST') {
      return await createTool(req);
    }

    if (path.startsWith('/admin/tools/')) {
      const id = Number(path.split('/')[3]);
      if (!Number.isFinite(id)) {
        throw badRequest('Invalid tool id.');
      }

      if (req.method === 'PUT' || req.method === 'PATCH') {
        return await updateTool(req, id);
      }

      if (req.method === 'DELETE') {
        return await deleteTool(id);
      }
    }

    return notFound('Route not found.');
  } catch (error) {
    if (error instanceof HttpError) {
      return json({ ok: false, error: error.message }, { status: error.status });
    }
    console.error(error);
    return serverError();
  }
};
