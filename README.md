# Mattetools hubs for Netlify + Neon

This project contains:

- `mattetoolsstudent.html` — public student hub
- `mattetoolsteacher.html` — public teacher hub
- `mattetoolsadmin.html` — admin page for creating and managing tools
- Netlify Functions for CRUD, public listing, thumbnail serving, and serving uploaded one-file HTML apps
- Neon/Postgres storage for metadata, uploaded HTML, and thumbnails

## Environment variables in Netlify

Set these in Netlify site settings:

- `DATABASE_URL` — your Neon connection string
- `ADMIN_PASSWORD` — password required by the admin API

## Database setup

You can either:

1. Let the functions create the `tools` table automatically on first request, or
2. Run `sql/schema.sql` manually in Neon.

## Local development

```bash
npm install
netlify dev
```

## Notes

- Uploaded apps must be single self-contained HTML files.
- External tools can be added as regular links.
- Thumbnails are stored in the database as data URLs.
- Uploaded HTML tools are served from `/apps/<slug>`.
