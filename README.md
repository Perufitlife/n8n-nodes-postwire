# n8n-nodes-postwire

Publish one idea to every social network from n8n — with **a different post written for each network**, not the same text pasted everywhere.

This is the official n8n node for [PostWire](https://postwire.io), maintained by the PostWire team. PostWire already holds the platform approvals TikTok, Instagram (Meta) and YouTube require for publishing apps, so connecting an account is one OAuth click — there is no developer app or App Review on your side.

Networks: TikTok · Instagram · YouTube · LinkedIn · X · Facebook · Reddit · Bluesky · Mastodon · Telegram · Discord.

## Install

**n8n Cloud and self-hosted** — Settings → Community nodes → Install → `n8n-nodes-postwire`.

Self-hosted, from the command line:

```bash
cd ~/.n8n/nodes && npm install n8n-nodes-postwire
```

## Credentials

1. Create a free account at [postwire.io/dashboard.html](https://postwire.io/dashboard.html) and connect the networks you want to post to (Accounts).
2. Copy your API key from **API & MCP**.
3. In n8n, create a **PostWire API** credential, paste the key and press **Test** — it calls `GET /api/me`, so a wrong key fails now rather than at publish time.

Free plan: one brand with every network it connects, 30 posts a month, no card.

## Resources and operations

| Resource | Operation | What it does |
|---|---|---|
| **Post** | **Publish** | Publishes now to one or more networks. *Content* can be **Smart Distribute** (one idea in, a native post per network), **Same Text on Every Network**, or **Drafts From a Previous Step** (for approval flows). |
| | **Write Drafts** | Preview only: writes a native draft per network — right length, hook, hashtags, YouTube title and tags — and publishes nothing. Also returns a readable `preview` for Slack/Telegram/email approval. |
| | **Schedule** | Queues a post for later. Connections and media are checked **now**, so a missing video shows up while you watch, not at 7am tomorrow. |
| | **Plan Week** | One topic in, up to five days of different posts out (a lesson, a mistake, a number, a question, behind the scenes), already scheduled one per day at the hour you choose, in the workflow's time zone. Text networks only. |
| | **Get Status** | Whether a TikTok or YouTube upload has finished processing. |
| **Scheduled Post** | Get Many · Update · Cancel | Read the queue, move a post to another time, or cancel it. |
| **Brand** | Get Many · Create · Rename · Delete | A brand is one business with all its networks — what PostWire plans count. |
| **Connection** | Get Many · Check Health · Create Connect Link | See connected accounts, ask a network whether a connection can still publish, or create a one-hour link a client can use to connect *their* account to your PostWire (agencies). |
| **Account** | Get | Plan, posts used this month, connected networks. |
| **Media** | Upload | Hosts a binary from a previous node and returns a public URL the networks can download. |

The node is also available as an **AI agent tool** (`usableAsTool`): attach it to an AI Agent node and the agent can write drafts or publish.

## Media: the part that usually fails

TikTok and YouTube only publish video; Instagram needs a photo or a video. The networks **download the file from a link**, with no login — so the most common failure is a link that opens a page instead of the file.

- **Media → Binary File** (recommended): put a Google Drive *Download*, HTTP Request or Read File node before PostWire. The node uploads the file (up to 50 MB) and PostWire hosts it for 30 days.
- **Media → URL**: a public `https://` link straight to the `.mp4`/`.jpg` (up to 1 GB). Before anything is sent, the node checks the link the way the networks will: reachable without a login, a file and not a web page, under 1 GB, and a video when a video network is selected. Google Drive, Dropbox (`dl=0`), OneDrive and "link to a post" URLs are recognised and the error says exactly what to change.

## Nothing half-publishes, nothing double-posts

- PostWire refuses the whole call if any selected network is not connected, instead of publishing to half of them.
- Shared text over a network's limit is shortened for that network (X 280, Bluesky 300, Mastodon 500…) instead of failing.
- **Idempotency Key** (Options): PostWire refuses a second post with the same key for 24 hours. With Smart Distribute the node sets one automatically per execution, so n8n's *Retry On Fail* can never post the same thing twice.
- **Dry Run** (Options): checks connections, media and length and returns exactly what would go out, per network — without publishing.

## Output

**Publish** returns one item per network, so a Filter or IF node can act on failures alone:

```json
{ "ok": true,  "platform": "x", "id": "1934…", "url": "https://x.com/…" }
{ "ok": false, "platform": "youtube", "error": "…", "hint": "YouTube could not download the media. It must be a public https link…" }
```

If **no** network was published, the step fails (so a scheduled workflow cannot go silent for weeks), with the reason and the fix.

**Write Drafts** returns:

```json
{
  "drafts": { "linkedin": { "text": "…" }, "youtube": { "text": "…", "title": "…", "tags": ["…"] } },
  "platforms": ["linkedin", "youtube"],
  "preview": "*LinkedIn*\n…\n\n*YouTube*\n…"
}
```

Map `{{ $json.drafts }}` into a later Publish with *Content → Drafts From a Previous Step*.

## Errors say what to do

Every refusal from the API carries a code, and the node turns it into a message plus the fix:

| Code | What you see |
|---|---|
| `not_connected` | Which network, and where to connect it (or send a client a Connect Link) |
| `media_required` | Which network needs a video/photo, and how to add one |
| `media_unreachable` | Why PostWire could not download the file (403, 404, a Drive page…) — nothing was published |
| `too_long` | The limit and how far over it the text is |
| `limit_reached`, `brand_limit_reached` | The plan limit and the upgrade link |
| `duplicate_post` | That the post was already sent moments ago and was not sent twice |
| 401 | Fix the API key in the credential |
| 429 | Daily AI-draft cap per plan, or a burst limit — wait or add a Wait node |

## Examples

**RSS → a native post per network**

`RSS Feed Trigger` → `PostWire: Post → Publish` (Content: Smart Distribute, Idea: `{{ $json.title }} — {{ $json.contentSnippet }} {{ $json.link }}`, Networks: LinkedIn, X, Bluesky, Options → Idempotency Key: `{{ $json.guid }}`).

**Google Drive video → TikTok, Reels and Shorts**

`Google Drive Trigger` → `Google Drive: Download` → `PostWire: Post → Publish` (Media: Binary File, Networks: TikTok, Instagram, YouTube, Idea: `{{ $json.name }}`).

**Approve in Slack before anything goes out**

`PostWire: Write Drafts` → `Slack: Send and Wait for Approval` (message: `{{ $json.preview }}`) → `IF approved` → `PostWire: Publish` (Content: Drafts From a Previous Step, Drafts: `{{ $('Write drafts').item.json.drafts }}`).

Ready-to-import templates: [n8n.io/creators/postwire](https://n8n.io/creators/postwire/).

## Pricing

Priced per **brand** — one business with all of its networks — not per channel. Adding a fifth network to a brand never changes the bill.

| | Brands | Posts/month | |
|---|---|---|---|
| Free | 1 | 30 | no card |
| Starter | 3 | 300 | $9/mo |
| Pro | 10 | 2,000 | $29/mo |
| Agency | 50 | 15,000 | $99/mo |

## Compatibility

Tested with n8n 2.40. Workflows built with version 1 of the node (package 0.1.x–0.2.x) keep working unchanged; new nodes use version 2.

## Resources

- [PostWire API reference (OpenAPI)](https://postwire.io/openapi.json)
- [n8n + PostWire guide](https://postwire.io/n8n-social-media-automation/)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)

## License

MIT
