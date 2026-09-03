# n8n-nodes-postwire

Publish one idea to every social network from n8n — with **a different post written for each one**, not the same text pasted everywhere.

[PostWire](https://postwire.io) handles the part that usually stops an n8n workflow: TikTok, Instagram and YouTube all require an approved developer app, and TikTok's App Review asks for a demo video of the integration you cannot build until you are approved. PostWire already holds those approvals, so connecting an account is a single OAuth click.

## What the node does

| Operation | What it does |
|---|---|
| **Write a Post per Network** | One idea in, a native draft out per network — correct length, hashtag conventions, an SEO title and tags for YouTube, a hook-first caption for TikTok, link-in-comment for LinkedIn. Does not publish. |
| **Publish** | Sends to every selected network in one call. |
| **Write and Publish** | Both, in one node. |
| **Schedule** | Queues a post for later, and validates it **now** — so a missing video surfaces while you are watching, not at 7am tomorrow. |
| **Get Account** | Plan, posts used this month, connected accounts. |

Networks: TikTok · Instagram · YouTube · LinkedIn · X · Facebook · Reddit · Bluesky · Mastodon · Telegram · Discord.

## Install

**n8n Cloud** — Settings → Community nodes → Install → `n8n-nodes-postwire`

**Self-hosted** — Settings → Community nodes → Install, or:

```bash
npm install n8n-nodes-postwire
```

## Credentials

1. Get a free API key at [postwire.io/dashboard.html](https://postwire.io/dashboard.html) and connect the accounts you want to post to.
2. In n8n, create a **PostWire API** credential and paste the key.
3. Press **Test** — it calls `/api/me` and returns your plan and connected accounts, so a wrong key fails now rather than at publish time.

Free plan: one brand with every network it connects, 30 posts a month, no card.

## Nothing half-publishes

The most common way a cross-posting workflow goes wrong is a partial send: you ask for four networks and two go out. This node checks before anything is published — that each network is connected, that the caption is inside that platform's character limit, and that video networks actually have a video. If any of them would fail, the whole call is refused and the error tells you which one and what to change.

The node also validates media in the editor, so `youtube will not accept a post without a video` appears before you run the workflow rather than after.

## Output

**Publish** returns one n8n item per network, so you can wire a Filter or IF node straight onto the failures:

```json
{ "ok": true,  "platform": "x",       "id": "1934…", "url": "https://x.com/…" }
{ "ok": false, "platform": "youtube", "error": "youtube needs a video…", "code": "media_required" }
```

**Write a Post per Network** returns `{ drafts: { "<platform>": { text, title?, tags? } } }`.

## Pricing

Priced per **brand** — one business with all of its networks — not per channel or per social account. Adding a fifth network to a brand never changes the bill.

| | Brands | Posts/month | |
|---|---|---|---|
| Free | 1 | 30 | no card |
| Starter | 3 | 300 | $9/mo |
| Pro | 10 | 2,000 | $29/mo |
| Agency | 50 | 15,000 | $99/mo |

## Also available

A REST API and a hosted MCP server (`https://postwire.io/api/mcp`) for AI agents in Claude, Cursor or VS Code. See [postwire.io/mcp](https://postwire.io/mcp/).

## License

MIT
