# Changelog

## 0.4.3

### Fixed
- **The aliases finally reach n8n's nodes panel.** The codex (categories, aliases, links) is now written **inline** in both nodes' descriptions, not only in the `.node.json` files. n8n's catalog of verified community nodes (`api.n8n.io/api/community-nodes`, what n8n Cloud's panel searches) is built from the description and never read the `.node.json`: on 9-oct-2026 it listed 0.4.2 with `codex: {}`, so searching *TikTok*, *Instagram*, *Reels* or *Shorts* never showed PostWire. Nodes whose aliases do show (`n8n-nodes-guni@2.2.0`, `n8n-nodes-htmlcsstopdf@3.2.9`) carry the codex inline in `dist/…/X.node.js`. The `.node.json` files stay (self-hosted n8n loads them) and `test/codex.test.js` fails if the two differ.
- **One error item when a publish reaches no network.** With *On Error: Continue*, a post that failed on all 3 of its networks came out as 3 per-network items **plus** 1 error item, so an error branch that sends an email sent 4. It is now a single item: `error`, `description`, `ok: false`, `posted: 0` and `results` (each network's result with its hint). Partial failures are unchanged (one item per network). Without *Continue*, the step fails as before.

### Added
- **New destinations** in version 2: **WordPress**, **Dev.to** and **Hashnode** (an article: *Title (YouTube and Blogs)* sets its title; Smart Distribute writes title, summary and tags), **Slack** and **Nostr**. Also in *Plan Week*, *Check Health*, *Create Connect Link* and the Trigger's network filter. Version 1 of the node keeps its frozen list.
- *Options* → **Thread**: the posts after the main one on X, Bluesky and Mastodon (`per_platform.<network>.thread`); *X Thread*, when set, still wins for X. **Split Long Text Into a Thread** sends `thread: true` so PostWire splits at each network's limit. A Bluesky or Mastodon thread over 10 posts, or an X one over 26, is refused before anything is sent.
- *Options* → **First Comment**: posted by the author under the post on LinkedIn, X, Bluesky and Mastodon (`options.<network>.first_comment`); on X it is the reply under the chain (*X Reply* wins when both are set) and is checked at 280 characters as X counts them. Dry Run shows each network's thread and first comment.
- Error with the fix for the API's `bad_thread` (a Bluesky/Mastodon thread or first comment the API refused before publishing anything).

### Changed
- Codex: `subcategories: { "Marketing & Content": ["Social Media"] }`; aliases for the new destinations (WordPress, Dev.to, Hashnode, Nostr, Slack channel, blog post, publish article) plus *X thread* and *first comment* — 41 in all, only networks PostWire publishes to.
- Node and package descriptions name the new destinations.

## 0.4.2

### Changed
- **Found by what people type in n8n's nodes panel.** Both codex files now carry `alias` (a search key of the nodes panel and of n8n's AI workflow builder, next to the display name): TikTok, Instagram Reels, YouTube Shorts, LinkedIn, Facebook, X, Bluesky, Mastodon, Telegram, Discord, "social media", "post", "publish", "auto post", "schedule post", "upload video" and similar. Only networks PostWire publishes to are listed (no Threads, Pinterest or Reddit).
- Node description names the formats people search for (Reels, Shorts) and says "publish or schedule".
- Clearer action labels: *Publish a post to social media*, *Schedule a social media post*, *Write social media post drafts*.
- Codex credential documentation link tagged `utm_medium=codex`.
- New test `test/codex.test.js` checks codex fields, categories against n8n's list and the aliases.

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
