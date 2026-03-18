export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  return new Response(JSON.stringify(data), {
    ...init,
    headers
  });
}

export function html(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'text/html; charset=utf-8');
  return new Response(body, {
    ...init,
    headers
  });
}

export function text(body, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'text/plain; charset=utf-8');
  return new Response(body, {
    ...init,
    headers
  });
}

export async function readJson(req) {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requireAdmin(req) {
  const provided = req.headers.get('x-admin-password') || '';
  const expected = Netlify.env.get('ADMIN_PASSWORD') || process.env.ADMIN_PASSWORD || '';
  if (!expected) {
    throw new HttpError(500, 'Missing ADMIN_PASSWORD environment variable.');
  }
  if (provided !== expected) {
    throw new HttpError(401, 'Unauthorized.');
  }
}

export function slugify(input) {
  return String(input || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'tool';
}

export function toBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function validateHttpUrl(urlString) {
  try {
    const url = new URL(urlString);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('Invalid protocol');
    }
    return url.toString();
  } catch {
    throw new HttpError(400, 'External link must be a valid http or https URL.');
  }
}

export function validateThumbnailDataUrl(value, { required = true } = {}) {
  if (!value) {
    if (required) throw new HttpError(400, 'Thumbnail image is required.');
    return null;
  }
  if (!value.startsWith('data:image/')) {
    throw new HttpError(400, 'Thumbnail must be an image data URL.');
  }
  if (value.length > 3_000_000) {
    throw new HttpError(400, 'Thumbnail is too large. Keep it under roughly 2 MB.');
  }
  return value;
}

export function validateHtmlContent(value, { required = true } = {}) {
  if (!value) {
    if (required) throw new HttpError(400, 'HTML file is required.');
    return null;
  }
  if (value.length > 2_500_000) {
    throw new HttpError(400, 'Uploaded HTML file is too large.');
  }
  if (!/(<html|<!doctype html)/i.test(value)) {
    throw new HttpError(400, 'Uploaded file does not look like HTML.');
  }
  return value;
}

export function parseDataUrl(dataUrl) {
  const match = /^data:([^;]+);base64,(.+)$/s.exec(dataUrl || '');
  if (!match) {
    throw new HttpError(400, 'Invalid stored media.');
  }
  return {
    mime: match[1],
    bytes: Uint8Array.from(Buffer.from(match[2], 'base64'))
  };
}

export function normalizeText(value, fallback = '') {
  return String(value ?? fallback).trim();
}

export function launchUrlFor(row) {
  return row.source_type === 'upload' ? `/apps/${row.slug}` : row.external_url;
}

export function serializeTool(row) {
  return {
    id: Number(row.id),
    slug: row.slug,
    title: row.title,
    description: row.description,
    sourceType: row.source_type,
    externalUrl: row.external_url,
    htmlFilename: row.html_filename,
    enabledStudent: row.enabled_student,
    enabledTeacher: row.enabled_teacher,
    sortOrder: row.sort_order,
    thumbnailUrl: `/api/media/${row.id}`,
    launchUrl: launchUrlFor(row),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
