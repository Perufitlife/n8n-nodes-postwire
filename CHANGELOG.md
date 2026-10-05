# Changelog

## 0.4.0

### Added
- **PostWire Trigger** node: starts a workflow on PostWire's signed webhooks — *Post Published*, *Post Failed*, *Connection Needs Sign-In*, *Approval Requested*, *Approval Decided*. Activating the workflow registers the endpoint (`POST /api/webhooks`) for the selected events and keeps its signing secret; deactivating removes it. Every delivery's `PostWire-Signature` (HMAC-SHA256, 5-minute window) is checked and a mismatch is answered 401. Options: filter by networks and brand. A local or http n8n URL is refused at activation with the setting to change (`WEBHOOK_URL`).
- **X** is offered again in version 2 (PostWire publishes to X as a paid-plan add-on with X credits). *Options* → **X Thread** (posts 2..26, each a reply to the one before) and **X Reply** (one post under the last); every X post is checked at 280 characters as X counts them before anything is sent. Smart Distribute keeps the thread the writer returns.
- **Approvals**: a Publish or Schedule held for a person (HTTP 202 `pending_approval`) returns one item per network with `status: "pending_approval"`, `approval_id`, the post `id` and `review_url` — it no longer fails the step as "published to none". New resource **Approval** (Get, Get Many with status/brand filters and paging).
- **Schedule → When: In the Next Free Queue Slot** (`run_at: "next_slot"`), read in the brand's slots or the workflow's time zone; the answer carries the slot.
- **Get** operations for Brand and Scheduled Post; **Get Status** takes PostWire's own ID (scheduled or waiting for approval) without a network.
- **Plan Week**: Brand option, up to 7 days, and the IANA time zone is sent as such.
- **Account → Get** names the team workspace and the role the API key acts with.
- Media over 50 MB (up to 1 GB) is uploaded in parts and finalized as one file, for Binary File and Media → Upload.
- Errors with the fix for the codes added to the API since 0.3.2: X (`bad_x_thread`, `x_credits_required`, `x_paid_plan_required`, `x_daily_limit`), key limits, teams (`role_forbidden`, `brand_restricted`, `seat_read_only`, `workspace_forbidden`), `no_free_slot`, `bad_timezone`, `ambiguous_brand`, webhooks (`bad_url`, `too_many`).

### Changed
- Built and linted with `@n8n/node-cli` 0.50.4; `npm run scan:local` runs the lint legs of `@n8n/scan-community-package` on the checkout before tagging.
- Workflows saved with 0.3.x run unchanged: everything new is additive (a Schedule without *When* still uses *Publish At*).

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
