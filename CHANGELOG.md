# Changelog

## 0.3.2

### Changed
- Optional fields now sit in collections, as requested in n8n's verification review: **Days** and **Hour** (Post → Plan Week) moved into *Options*, and **Network** (Connection → Create Connect Link) into a new *Options* collection. Workflows saved with 0.3.1 keep their values: the node still reads the old top-level parameters when the new options are not set.
- Version 2 of the node no longer offers X or Reddit, and the Reddit-only *Subreddit* option is gone: PostWire does not publish to either. README and package description updated to match. Version 1 (`LegacyDescription.ts`) is unchanged.

## 0.3.1

### Fixed
- Codex file (`PostWire.node.json`): `nodeVersion` is the codex schema version `"1.0"` (not the node's runtime version), and the category is `Marketing & Content`, as requested in n8n's verification review.

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
