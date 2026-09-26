# Changelog

## 0.3.0 — unreleased

Node version 2. Workflows built with version 1 keep working unchanged.

### Added
- Resources: **Post** (Publish, Write Drafts, Schedule, Plan Week, Get Status), **Scheduled Post** (Get Many, Update, Cancel), **Brand** (Get Many, Create, Rename, Delete), **Connection** (Get Many, Check Health, Create Connect Link), **Account** (Get), **Media** (Upload).
- Publish content modes: Smart Distribute, same text, or drafts from a previous step (approval flows).
- Media from a **binary file** (uploaded and hosted by PostWire) or a URL.
- Media URL check before sending: https, reachable without login, a file and not a web page, under 1 GB, video for video networks; specific fixes for Google Drive, Dropbox, OneDrive and post links.
- Dry Run, Idempotency Key (automatic per execution with Smart Distribute), Subreddit, Label, Timezone options; Brand as a resource locator.
- Actionable errors for every API code, including `media_unreachable`; a `hint` on each failed network in a partial publish.
- One automatic retry for a network the AI writer returned empty.
- Account → Get has a Simplify option.
- Unit tests; lint and tests run in CI before publishing.

### Changed
- Built and linted with `@n8n/node-cli` (the n8n-node tool).
- `npm publish` outside CI is refused, so every release carries npm provenance.

## 0.2.4 — 2026-09-11
- Do not refuse a video whose URL has no extension; alphabetised options for the scanner.

## 0.2.2 — 2026-09-08
- First version that passes `@n8n/scan-community-package`; published from GitHub Actions with provenance.
