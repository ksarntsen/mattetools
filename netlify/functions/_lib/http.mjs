export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export function json(data, init = {}) {
  const headers = new Headers(init.headers || {});
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('cache-control', 'no-store');
  headers.set('access-control-allow-origin', '*');

  return new Response(JSON.stringify(data), {
    ...init,
    headers
  });
}

export function badRequest(message) {
  return new HttpError(400, message);
}

export function unauthorized(message = 'Unauthorized.') {
  return new HttpError(401, message);
}

export function notFound(message = 'Not found.') {
  return json({ ok: false, error: message }, { status: 404 });
}

export function methodNotAllowed(message = 'Method not allowed.') {
  return json({ ok: false, error: message }, { status: 405 });
}

export function serverError(message = 'Internal server error.') {
  return json({ ok: false, error: message }, { status: 500 });
}

export async function readJson(req) {
  let body;

  try {
    body = await req.json();
  } catch {
    throw badRequest('Invalid JSON body.');
  }

  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw badRequest('Request body must be a JSON object.');
  }

  return body;
}

export function requireAdmin(req) {
  const provided =
    req.headers.get('x-admin-password') ||
    req.headers.get('X-Admin-Password') ||
    '';

  const expected =
    process.env.ADMIN_PASSWORD ||
    globalThis.Netlify?.env?.get?.('ADMIN_PASSWORD') ||
    '';

  if (!expected || provided !== expected) {
    throw unauthorized('Unauthorized.');
  }
}
