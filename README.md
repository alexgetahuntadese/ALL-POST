# ALL-POST

ALL-POST is a private, single-owner social publishing workspace with protected Vercel API routes, signed sessions, OAuth state checks, encrypted provider-token storage, a multi-platform queue, a calendar, delivery analytics, and persistent drafts.

## Run locally

Requires Node.js 20 or newer. Copy `.env.example` to `.env`, then run:

```powershell
npm start
```

Open <http://127.0.0.1:4173>.

## Provider setup

Production credentials and callback requirements are documented in [API_SETUP.md](API_SETUP.md). Keep provider secrets in Vercel’s server-side environment settings, not in frontend code or Git.

## Vercel deployment

Production URL: <https://all-post.vercel.app>. Vercel provides HTTPS without a custom domain. The app is protected by its workspace password and private Blob-backed OAuth storage. The public media store must be connected with the `MEDIA` environment prefix to enable uploads.

## Current API coverage

- Facebook and LinkedIn: protected account connections and publishing.
- X: protected OAuth 2.0 connection, text, photo, and MP4 video posts.
- Instagram: protected OAuth connection and photo/Reel publishing.
- TikTok: protected OAuth connection and photo/video publishing, with creator privacy/interactions, consent, status polling, and a verified custom media domain requirement.
- YouTube: protected OAuth connection and video uploads with title and privacy settings.
- Telegram: Bot API messages, photos, videos, media groups, and multiple destinations.
- Signed HTTPS webhooks: structured delivery with HMAC authentication and idempotency keys.
- Scheduled posts use a private Blob-backed queue. GitHub Actions checks after each push to `main` and about every five minutes. GitHub may delay scheduled runs under load.
- The workspace remains single-owner. Multi-user sign-in, teams, billing, and cross-user workspaces are not included. Analytics currently reports delivery outcomes, not audience engagement.

See [API_SETUP.md](API_SETUP.md) for the platform-by-platform access, credential, and approval checklist.

The original browser-only preview can still be opened as a static page, but API actions require the Node server.
