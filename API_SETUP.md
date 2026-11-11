# ALL-POST production setup

ALL-POST has server-side OAuth and publishing flows for LinkedIn, X, and Facebook Page text posts, Facebook JPEG photo posts, Instagram photo/Reel posts, TikTok photo/video posts, and YouTube video uploads. Each provider still needs its own developer app, credentials, account consent, and sometimes platform review. Do not paste secrets into chat or commit them.

## Current production foundation

- App: [all-post.vercel.app](https://all-post.vercel.app)
- Privacy policy: [all-post.vercel.app/privacy.html](https://all-post.vercel.app/privacy.html)
- LinkedIn Production credentials and workspace access are already configured in Vercel.
- The private Blob store is used for encrypted provider tokens. A separate public Blob store exists for media, but it must be connected to the project with the `MEDIA` environment-variable prefix before uploads are enabled.
- The media upload UI supports JPG, PNG, WebP, MP4, MOV, and WebM files up to 250 MB. Public media URLs can be opened by anyone who has the link and remain in storage until you remove them.

## OAuth callback URLs

Register the exact callback URL in each provider’s developer portal:

| Provider | Callback |
| --- | --- |
| LinkedIn | `https://all-post.vercel.app/api/oauth/linkedin/callback` |
| X | `https://all-post.vercel.app/api/oauth/x/callback` |
| Instagram | `https://all-post.vercel.app/api/oauth/instagram/callback` |
| Facebook | `https://all-post.vercel.app/api/oauth/facebook/callback` |
| TikTok | `https://all-post.vercel.app/api/oauth/tiktok/callback` |
| YouTube / Google | `https://all-post.vercel.app/api/oauth/youtube/callback` |

If you switch the app to your custom domain, update `APP_BASE_URL` and each corresponding redirect variable in Vercel, then register the new exact URLs with the platform before reconnecting.

## Vercel media storage

The public media store `all-post-public-media` is connected to project `all-post` for Production with the custom environment prefix `MEDIA`. Vercel provides `MEDIA_READ_WRITE_TOKEN`; the existing private store’s `BLOB_READ_WRITE_TOKEN` remains separate. Redeploy after any storage connection changes.

The existing private store remains the store for encrypted OAuth tokens. Don’t replace or delete its token. Media is served through `/api/media/public` so a custom app domain can be used as the public media hostname.

## LinkedIn

Text posting is implemented through LinkedIn’s Posts API. The existing LinkedIn app should have **Share on LinkedIn** and OpenID Connect enabled, with the callback above registered. Connect it from the ALL-POST channel list and grant `openid`, `profile`, and `w_member_social`.

## X

Text posting uses OAuth 2.0 Authorization Code with PKCE. Add `X_CLIENT_ID`, `X_CLIENT_SECRET`, and `X_REDIRECT_URI=https://all-post.vercel.app/api/oauth/x/callback` as Production secrets in Vercel. Configure a confidential Web App OAuth client with read/write access and the callback above. Grant `tweet.read`, `tweet.write`, `users.read`, and `offline.access`.

## Instagram

Add `META_APP_ID`, `META_APP_SECRET`, and `INSTAGRAM_REDIRECT_URI=https://all-post.vercel.app/api/oauth/instagram/callback` as Production secrets. The integration uses Instagram Login and needs a Professional (Business or Creator) Instagram account with the Instagram API with Instagram Login product and `instagram_business_basic` plus `instagram_business_content_publish` permissions. Meta may require app review and an app mode change before non-role accounts can authorize or publish.

Supported media: JPEG photo posts and MP4/MOV Reels. The caption uses the composer text.

## Facebook Pages

Use the Meta app ID and secret already configured for Instagram, then add `FACEBOOK_REDIRECT_URI=https://all-post.vercel.app/api/oauth/facebook/callback` and `FACEBOOK_API_VERSION=v26.0` in Vercel Production. Enable Facebook Login and register that exact callback URL. ALL-POST requests `pages_show_list`, `pages_read_engagement`, and `pages_manage_posts`; the signed-in profile must have content creation access to at least one Facebook Page. Personal profile publishing is not supported. Meta app review / Advanced Access may be required before other people or production users can connect Pages.

After connecting, choose the Page in the composer. Text posts and single JPEG photo posts are supported; videos and multi-photo posts are not enabled yet. The Page access tokens are encrypted in private Blob storage.

## TikTok

Add `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, and `TIKTOK_REDIRECT_URI=https://all-post.vercel.app/api/oauth/tiktok/callback` as Production secrets. Enable Login Kit and Content Posting API / Direct Post, and request `user.info.basic` and `video.publish`.

TikTok requires media URLs to use a domain or URL prefix verified in the TikTok developer app. Vercel Blob’s own hostname is not your domain, so connect your purchased domain to this Vercel project, set `APP_BASE_URL` to that HTTPS origin, register the new TikTok callback, verify that domain or URL prefix in TikTok, and set `TIKTOK_VERIFIED_DOMAIN` to the hostname only (for example, `social.example.com`). The value must match the browser’s public hostname. ALL-POST will not send media to TikTok if the host does not match.

The composer queries the connected creator’s current privacy options and account interaction settings. You choose visibility and whether to allow comments, Duet, and Stitch; these are off by default. ALL-POST also asks for consent before sending media. Unreviewed TikTok apps may only publish privately until TikTok completes its audit. The app checks the post status while you wait.

## YouTube

Enable YouTube Data API v3 in Google Cloud and create a Web application OAuth client. Add `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `YOUTUBE_REDIRECT_URI=https://all-post.vercel.app/api/oauth/youtube/callback` as Production secrets. Register the callback above and authorize `https://www.googleapis.com/auth/youtube.upload`. The composer requires a video title and a privacy choice; the post text is used as the description. This API flow uploads videos, not YouTube Community text posts.

## Security and limitations

OAuth tokens are encrypted in private Blob storage. Keep the workspace password and all developer secrets in Vercel’s server-side environment settings. ALL-POST is currently a single-owner workspace, not a multi-user service. Published posts are sent to each selected provider; providers apply their own content, visibility, quota, review, and account restrictions. Media uploads are public by URL and are not automatically deleted after publishing, so remove uploaded files from the composer when they are no longer needed.

Scheduling, a persistent post history, multi-user accounts, and team workspaces are not part of this release.
