# ALL-POST

An early interface for composing one post and selecting the social channels it should target.

## Run locally

From this folder, run `python -m http.server 4173 --bind 127.0.0.1` and open <http://127.0.0.1:4173>.

## Current scope

- Responsive compose screen with Instagram, LinkedIn, X, YouTube, and TikTok channel selectors.
- Draft text and channel selections saved in this browser using local storage.
- Local image preview, emoji insertion, link insertion, hashtag insertion, and a keyboard shortcut (`Ctrl/Cmd + N`).
- Platform preview tabs are visual prototypes. Social account connection, uploading media to social platforms, scheduling, and publishing are not implemented yet.
- The queue is sample content.

## Launch requirements

Before production launch, configure the purchased domain and hosting, add a backend and database, implement secure OAuth/API connections for each selected platform, and replace the prototype queue and publish actions with persisted jobs. Platform API access and content formats vary by network.
