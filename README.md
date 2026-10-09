# n8n-nodes-postwire

Publish one idea to every social network from n8n — with **a different post written for each network**, not the same text pasted everywhere.

This is the official n8n node for [PostWire](https://postwire.io), maintained by the PostWire team. PostWire already holds the platform approvals TikTok, Instagram (Meta) and YouTube require for publishing apps, so connecting an account is one OAuth click — there is no developer app or App Review on your side.

Networks: TikTok · Instagram · YouTube · LinkedIn · Facebook · X (paid plans, X credits) · Bluesky · Mastodon · Telegram · Discord · Slack · Nostr — and articles on WordPress · Dev.to · Hashnode.

Two nodes:

- **PostWire**: publish, schedule, write drafts, and manage brands, connections, approvals and media.
- **PostWire Trigger**: start a workflow when a post is published or fails on a network, a connection needs signing in again, or a post waits for approval or gets a decision. Signed webhooks, registered and removed by the node.

## Install

**n8n Cloud and self-hosted** — Settings → Community nodes → Install → `n8n-nodes-postwire`.

Self-hosted, from the command line:

```bash
cd ~/.n8n/nodes && npm install n8n-nodes-postwire
```

## Credentials

1. Create a free account at [postwire.io/dashboard.html](https://postwire.io/dashboard.html?utm_source=n8n&utm_medium=readme) and connect the networks you want to post to (Accounts).
2. Copy your API key from **API & MCP**.
3. In n8n, create a **PostWire API** credential, paste the key and press **Test** — it calls `GET /api/me`, so a wrong key fails now rather than at publish time.

Free plan: one brand, 20 posts a month, 2 networks per post, no card. Paid plans send each post to every network you connect.

## Resources and operations

| Resource | Operation | What it does |
|---|---|---|
| **Post** | **Publish** | Publishes now to one or more networks. *Content* can be **Smart Distribute** (one idea in, a native post per network), **Same Text on Every Network**, or **Drafts From a Previous Step** (for approval flows). |
| | **Write Drafts** | Preview only: writes a native draft per network — right length, hook, hashtags, YouTube title and tags — and publishes nothing. Also returns a readable `preview` for Slack/Telegram/email approval. |
| | **Schedule** | Queues a post for later: at a time, or **in the next free queue slot** of the brand (*When*). Connections and media are checked **now**, so a missing video shows up while you watch, not at 7am tomorrow. |
| | **Plan Week** | One topic in, up to seven days of different posts out (a lesson, a mistake, a number, a question, behind the scenes), already scheduled one per day, in the workflow's time zone. Text networks only. *Options* → **Days** (1–7, default 5), **Hour** (0–23, default 10), **Timezone** and **Brand**. |
| | **Get Status** | Whether a TikTok or YouTube upload has finished processing, or, with PostWire's own ID, where a scheduled post or one waiting for approval stands. |
| **Scheduled Post** | Get · Get Many · Update · Cancel | Read one post or the queue, move a post to another time, or cancel it. |
| **Brand** | Get · Get Many · Create · Rename · Delete | A brand is one business with all its networks — what PostWire plans count. |
| **Connection** | Get Many · Check Health · Create Connect Link | See connected accounts, ask a network whether a connection can still publish, or create a one-hour link a client can use to connect *their* account to your PostWire (agencies); *Options* → **Network** locks the link to one network. |
| **Approval** | Get · Get Many | Posts waiting for a person and the ones decided, with each network's preview, why it waits and who decided. Deciding is for people only (the emailed link or the dashboard), never an API key. |
| **Account** | Get | Plan, posts used this month, connected networks, and the team workspace and role the key acts with. |
| **Media** | Upload | Hosts a binary from a previous node (up to 1 GB; over 50 MB it is uploaded in parts) and returns a public URL the networks can download. |

The node is also available as an **AI agent tool** (`usableAsTool`): attach it to an AI Agent node and the agent can write drafts or publish.

## Threads and a first comment

*Options* → **Thread** lists the posts after the main one on **X, Bluesky and Mastodon** (each a reply to the one before; Bluesky and Mastodon take up to 9, X up to 25), or **Split Long Text Into a Thread** lets PostWire cut a long text at the network's limit. **First Comment** is posted by you right under the post on **LinkedIn, X, Bluesky and Mastodon** (under the last post of a thread): the place for a link, so the post keeps its reach. Facebook and Instagram cannot take one.

### X threads and replies

With **Same Text on Every Network**, *Options* → **X Thread** (overrides *Thread* for X) adds posts 2, 3… of a thread (each a reply to the one before) and **X Reply** adds one post under the last, the usual place for a link. With **Smart Distribute**, ask for a thread in the idea ("write a thread about…") and the X draft comes back with its thread. Every X post is at most 280 characters as X counts them (a link counts 23, an emoji 2): the node checks each one before anything is sent. X is part of the paid plans and each post uses X credits (1, or 10 with a link).

## When every network fails

A Publish that reached none of its networks fails the step. With *On Error: Continue*, it returns **one** item — `error`, `description` (the fix), `ok: false` and `results` (each network's own result and hint) — so an error branch that sends an email sends one, not one per network plus one.

## Approvals

If a brand's approval rules hold a post for a person (or the API key has "every post needs approval", or the key belongs to a Contributor), **Publish** and **Schedule** do not fail: each network comes back with `status: "pending_approval"`, the `approval_id`, the post's `id` and a `review_url`. Nothing is published until someone approves it. Follow it with **Post → Get Status** (Network: *PostWire ID*), **Approval → Get**, or a **PostWire Trigger** on *Approval Decided*.

## PostWire Trigger

| Event | When |
|---|---|
| Post Published | A network accepted the post (one event per network), with its ID and link |
| Post Failed | A network refused it or it could not be sent, with the reason and a `code` |
| Connection Needs Sign-In | A network's sign-in expired or was revoked, with the reconnect link |
| Approval Requested | A post is held for a person, with each network's text as the approver sees it, the reasons and the dashboard link |
| Approval Decided | Someone approved or rejected it: the networks approved, rejected and edited, the reason, and when it goes out |

When the workflow is **activated**, the node adds a webhook endpoint to your PostWire account (`POST /api/webhooks`) for the events you picked and keeps its signing secret; when it is **deactivated**, it removes it. Every delivery is checked against the `PostWire-Signature` header (HMAC-SHA256 over `<timestamp>.<raw body>`, at most 5 minutes old) and refused with 401 if it does not match. *Options* → **Networks** and **Brand ID** narrow which events start the workflow. The output is the event (`id`, `type`, `created_at`, `data`) plus `delivery_id`, which stays the same on PostWire's retries: dedupe on it.

PostWire calls n8n from the internet, so the instance needs a public **https** address (`WEBHOOK_URL`). A local `http://localhost:5678` cannot receive events; the node says so when you activate it. An account has up to 5 endpoints. Send a test from PostWire (*API & MCP* → *Webhooks* → *Send test*): `webhook.test` always gets through. Events and payloads: [postwire.io/docs/webhooks](https://postwire.io/docs/webhooks/).

## Media: the part that usually fails

TikTok and YouTube only publish video; Instagram needs a photo or a video. The networks **download the file from a link**, with no login — so the most common failure is a link that opens a page instead of the file.

- **Media → Binary File** (recommended): put a Google Drive *Download*, HTTP Request or Read File node before PostWire. The node uploads the file (up to 1 GB) and PostWire hosts it for 30 days.
- **Media → URL**: a public `https://` link straight to the `.mp4`/`.jpg` (up to 1 GB). Before anything is sent, the node checks the link the way the networks will: reachable without a login, a file and not a web page, under 1 GB, and a video when a video network is selected. Google Drive, Dropbox (`dl=0`), OneDrive and "link to a post" URLs are recognised and the error says exactly what to change.

## Nothing half-publishes, nothing double-posts

- PostWire refuses the whole call if any selected network is not connected, instead of publishing to half of them.
- Shared text over a network's limit is shortened for that network (Bluesky 300, Mastodon 500, Instagram 2,200…) instead of failing.
- **Idempotency Key** (Options): PostWire refuses a second post with the same key for 24 hours. With Smart Distribute the node sets one automatically per execution, so n8n's *Retry On Fail* can never post the same thing twice.
- **Dry Run** (Options): checks connections, media and length and returns exactly what would go out, per network — without publishing.

## Output

**Publish** returns one item per network, so a Filter or IF node can act on failures alone:

```json
{ "ok": true,  "platform": "bluesky", "id": "at://…", "url": "https://bsky.app/profile/…/post/…" }
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
| `x_credits_required`, `x_paid_plan_required`, `x_daily_limit`, `bad_x_thread` | What X needs (credits, a paid plan, tomorrow, a shorter post) — nothing was published |
| `role_forbidden`, `brand_restricted`, `workspace_forbidden` | The team role or brands of the member who created the key, and who can change them |
| `key_monthly_cap_reached`, `key_network_not_allowed` | A limit the owner set on this API key |
| `no_free_slot` | No free queue slot in 28 days: add slots or pick a time |
| 401 | Fix the API key in the credential |
| 429 | Daily AI-draft cap per plan, or a burst limit — wait or add a Wait node |

## Examples

**RSS → a native post per network**

`RSS Feed Trigger` → `PostWire: Post → Publish` (Content: Smart Distribute, Idea: `{{ $json.title }} — {{ $json.contentSnippet }} {{ $json.link }}`, Networks: LinkedIn, Bluesky, Mastodon, Options → Idempotency Key: `{{ $json.guid }}`).

**Google Drive video → TikTok, Reels and Shorts**

`Google Drive Trigger` → `Google Drive: Download` → `PostWire: Post → Publish` (Media: Binary File, Networks: TikTok, Instagram, YouTube, Idea: `{{ $json.name }}`).

**Approve in Slack before anything goes out**

`PostWire: Write Drafts` → `Slack: Send and Wait for Approval` (message: `{{ $json.preview }}`) → `IF approved` → `PostWire: Publish` (Content: Drafts From a Previous Step, Drafts: `{{ $('Write drafts').item.json.drafts }}`).

**Alert in Slack when a post fails or a login expires**

`PostWire Trigger` (Events: Post Failed, Connection Needs Sign-In) → `Slack: Send Message` (`{{ $json.data.platform }}: {{ $json.data.error || $json.data.reason }}`).

**Tell the client's channel when their post is approved**

`PostWire Trigger` (Events: Approval Decided, Options → Brand ID) → `IF {{ $json.data.decision }} is approved` → `Microsoft Teams` / `Slack` / `Gmail`.

Ready-to-import templates: [n8n.io/creators/postwire](https://n8n.io/creators/postwire/).

## Pricing

Priced per **brand** — one business with all of its networks — not per channel. Adding a fifth network to a brand never changes the bill. X is an add-on of the paid plans, billed in X credits.

| | Brands | Posts/month | |
|---|---|---|---|
| Free | 1 | 20 | no card |
| Starter | 3 | 300 | $9/mo |
| Pro | 10 | 2,000 | $29/mo |
| Agency | 50 | 15,000 | $99/mo |
| Scale | 200 | no monthly cap | $299/mo |

Current prices: [postwire.io/pricing](https://postwire.io/pricing/).

## Compatibility

Tested with n8n 2.40. Workflows built with version 1 of the node (package 0.1.x–0.2.x) keep working unchanged; new nodes use version 2. Everything added in 0.4.0 is additive: a workflow saved with 0.3.x opens and runs as before (a Schedule without *When* uses *Publish At*).

## Resources

- [PostWire API reference](https://postwire.io/docs/) · [OpenAPI](https://postwire.io/openapi.json)
- [Webhooks: events, payloads and signature](https://postwire.io/docs/webhooks/)
- [Approvals](https://postwire.io/docs/approvals/) · [Teams](https://postwire.io/docs/teams/) · [X](https://postwire.io/docs/x/)
- [n8n + PostWire guide](https://postwire.io/n8n-social-media-automation/)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)

## License

MIT
