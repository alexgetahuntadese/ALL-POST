# ALL-POST

ALL-POST is a single-owner social publishing workspace with protected Vercel API routes, signed sessions, OAuth state checks, and encrypted provider-token storage in private Vercel Blob.

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

- LinkedIn and X: protected OAuth connections and text posts.
- Instagram: protected OAuth connection and photo/Reel publishing.
- TikTok: protected OAuth connection and photo/video publishing, with creator privacy/interactions, consent, status polling, and a verified custom media domain requirement.
- YouTube: protected OAuth connection and video uploads with title and privacy settings.
- Scheduling, workspaces, queue persistence, and multi-user sign-in are not implemented.

See [API_SETUP.md](API_SETUP.md) for the platform-by-platform access, credential, and approval checklist.

The original browser-only preview can still be opened as a static page, but API actions require the Node server.
