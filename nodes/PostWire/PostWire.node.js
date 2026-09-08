"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PostWire = void 0;

const { NodeOperationError } = require("n8n-workflow");

const BASE = "https://postwire.io";

// Every network PostWire can publish to. `mediaNeed` mirrors the server's own rule so the node can
// warn in the editor rather than letting the call fail — TikTok and YouTube refuse a post with no
// video, and Instagram refuses one with no media at all.
const PLATFORMS = [
  { name: "TikTok", value: "tiktok", mediaNeed: "video" },
  { name: "Instagram", value: "instagram", mediaNeed: "any" },
  { name: "YouTube", value: "youtube", mediaNeed: "video" },
  { name: "LinkedIn", value: "linkedin", mediaNeed: null },
  { name: "X (Twitter)", value: "x", mediaNeed: null },
  { name: "Facebook", value: "facebook", mediaNeed: null },
  { name: "Reddit", value: "reddit", mediaNeed: null },
  { name: "Bluesky", value: "bluesky", mediaNeed: null },
  { name: "Mastodon", value: "mastodon", mediaNeed: null },
  { name: "Telegram", value: "telegram", mediaNeed: null },
  { name: "Discord", value: "discord", mediaNeed: null },
];

class PostWire {
  constructor() {
    this.description = {
      displayName: "PostWire",
      name: "postWire",
      icon: "file:postwire.svg",
      group: ["output"],
      version: 1,
      subtitle: '={{$parameter["operation"]}}',
      description: "Publish one idea natively to every social network",
      defaults: { name: "PostWire" },
      inputs: ["main"],
      outputs: ["main"],
      credentials: [{ name: "postWireApi", required: true }],
      requestDefaults: {
        baseURL: BASE,
        headers: { "Content-Type": "application/json" },
      },
      properties: [
        {
          displayName: "Operation",
          name: "operation",
          type: "options",
          noDataExpression: true,
          options: [
            {
              name: "Write a Post per Network",
              value: "generate",
              description:
                "One prompt in, a native draft out for each network — right length, hashtags and format per platform. Does not publish.",
              action: "Write a native post for each network",
            },
            {
              name: "Publish",
              value: "publish",
              description: "Publish to one or more networks in a single call",
              action: "Publish to social networks",
            },
            {
              name: "Write and Publish",
              value: "generateAndPublish",
              description: "Write a native draft per network, then publish them",
              action: "Write and publish in one step",
            },
            {
              name: "Schedule",
              value: "schedule",
              description: "Queue a post for a later time",
              action: "Schedule a post",
            },
            {
              name: "Get Account",
              value: "me",
              description: "Plan, usage this month and connected accounts",
              action: "Get the PostWire account",
            },
          ],
          default: "generateAndPublish",
        },

        {
          displayName: "Networks",
          name: "platforms",
          type: "multiOptions",
          options: PLATFORMS.map((p) => ({ name: p.name, value: p.value })),
          default: ["x", "linkedin"],
          required: true,
          description:
            "Connect these in the PostWire dashboard first. TikTok, Instagram and YouTube are one OAuth click — PostWire carries the platform approvals, so there is no app review on your side.",
          displayOptions: { show: { operation: ["generate", "publish", "generateAndPublish", "schedule"] } },
        },

        {
          displayName: "Idea",
          name: "prompt",
          type: "string",
          typeOptions: { rows: 3 },
          default: "",
          required: true,
          placeholder: "We shipped scheduling today — one idea, a native post per network",
          description: "What you want to say. More detail gives a better draft.",
          displayOptions: { show: { operation: ["generate", "generateAndPublish"] } },
        },

        {
          displayName: "Text",
          name: "text",
          type: "string",
          typeOptions: { rows: 3 },
          default: "",
          description: "Posted exactly as written to every selected network",
          displayOptions: { show: { operation: ["publish", "schedule"] } },
        },

        {
          displayName: "Media URL",
          name: "mediaUrl",
          type: "string",
          default: "",
          placeholder: "https://example.com/clip.mp4",
          description:
            "A direct link to an .mp4 or an image. TikTok and YouTube will not accept a post without a video, and Instagram needs a photo or a video. A Google Drive share link does not work — it returns a web page, not a file.",
          displayOptions: { show: { operation: ["generate", "publish", "generateAndPublish", "schedule"] } },
        },

        {
          displayName: "Publish At",
          name: "runAt",
          type: "dateTime",
          default: "",
          required: true,
          description: "When to publish. PostWire validates the post now, so a missing video is caught here rather than at 7am tomorrow.",
          displayOptions: { show: { operation: ["schedule"] } },
        },

        {
          displayName: "Options",
          name: "options",
          type: "collection",
          placeholder: "Add option",
          default: {},
          displayOptions: { show: { operation: ["generate", "publish", "generateAndPublish", "schedule"] } },
          options: [
            {
              displayName: "Title (YouTube)",
              name: "title",
              type: "string",
              default: "",
              description: "Overrides the generated YouTube title",
            },
            {
              displayName: "Brand",
              name: "brandId",
              type: "string",
              default: "",
              description: "Publish as a specific brand. Leave empty for your only brand.",
            },
            {
              displayName: "Visibility",
              name: "privacy",
              type: "options",
              options: [
                { name: "Public", value: "public" },
                { name: "Private", value: "private" },
                { name: "Unlisted", value: "unlisted" },
              ],
              default: "public",
              description: "Used by TikTok and YouTube",
            },
            {
              displayName: "Brand Voice",
              name: "brandVoice",
              type: "string",
              default: "",
              description: "A sentence describing how you want to sound, applied to every generated draft",
            },
          ],
        },
      ],
    };
  }

  async execute() {
    const items = this.getInputData();
    const out = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const operation = this.getNodeParameter("operation", i);

        if (operation === "me") {
          const me = await this.helpers.httpRequestWithAuthentication.call(this, "postWireApi", {
            method: "GET",
            url: `${BASE}/api/me`,
            json: true,
          });
          out.push({ json: me, pairedItem: { item: i } });
          continue;
        }

        const platforms = this.getNodeParameter("platforms", i);
        const opts = this.getNodeParameter("options", i, {});
        const mediaUrl = (this.getNodeParameter("mediaUrl", i, "") || "").trim();

        if (!platforms || !platforms.length) {
          throw new NodeOperationError(this.getNode(), "Pick at least one network.", { itemIndex: i });
        }

        // Media rules, checked before the request so the message names the fix rather than the symptom.
        const isVideo = /\.(mp4|mov|webm|m3u8|avi|mkv|m4v)(\?|$)/i.test(mediaUrl);
        const blocked = platforms.filter((p) => {
          const need = (PLATFORMS.find((x) => x.value === p) || {}).mediaNeed;
          if (!need) return false;
          if (need === "video") return !isVideo;
          return !mediaUrl;
        });
        if (blocked.length) {
          throw new NodeOperationError(
            this.getNode(),
            `${blocked.join(" and ")} will not accept a post without ${blocked.some((p) => (PLATFORMS.find((x) => x.value === p) || {}).mediaNeed === "video") ? "a video" : "an image or video"}. Set Media URL to a direct file link, or remove ${blocked.length > 1 ? "those networks" : "that network"} from the list.`,
            { itemIndex: i },
          );
        }

        const photo_url = mediaUrl && !isVideo ? mediaUrl : undefined;
        const video_url = isVideo ? mediaUrl : undefined;

        let per_platform;
        if (operation === "generate" || operation === "generateAndPublish") {
          const prompt = this.getNodeParameter("prompt", i);
          const gen = await this.helpers.httpRequestWithAuthentication.call(this, "postWireApi", {
            method: "POST",
            url: `${BASE}/api/generate`,
            body: { prompt, platforms, media_url: mediaUrl || undefined, brand_voice: opts.brandVoice || undefined },
            json: true,
          });
          per_platform = gen.drafts;
          if (operation === "generate") {
            out.push({ json: gen, pairedItem: { item: i } });
            continue;
          }
        }

        const body = {
          platforms,
          per_platform,
          text: per_platform ? undefined : this.getNodeParameter("text", i, ""),
          photo_url,
          video_url,
          title: opts.title || undefined,
          privacy: opts.privacy || undefined,
          brand_id: opts.brandId || undefined,
        };

        if (operation === "schedule") {
          const runAt = this.getNodeParameter("runAt", i);
          const r = await this.helpers.httpRequestWithAuthentication.call(this, "postWireApi", {
            method: "POST",
            url: `${BASE}/api/schedule`,
            body: { ...body, run_at: runAt },
            json: true,
          });
          out.push({ json: r, pairedItem: { item: i } });
          continue;
        }

        const r = await this.helpers.httpRequestWithAuthentication.call(this, "postWireApi", {
          method: "POST",
          url: `${BASE}/api/post`,
          body,
          json: true,
        });

        // One n8n item per network, so a Filter or IF node downstream can act on the failures alone
        // instead of unpacking an array by hand.
        const results = r.results || [r];
        for (const res of results) {
          out.push({ json: res, pairedItem: { item: i } });
        }
        // A 200 whose every network failed used to leave the node green with the error buried in
        // the output, so a scheduled flow could publish nothing for weeks and never say so. If not
        // one network went out, that is a failed execution.
        const failed = results.filter((res) => res && res.ok === false);
        if (results.length && failed.length === results.length) {
          const why = failed.map((f) => `${f.platform || "?"}: ${f.error || f.code || "failed"}`).join("; ");
          const limited = failed.find((f) => f.code === "brand_limit_reached" || f.upgrade_url);
          throw new NodeOperationError(
            this.getNode(),
            `PostWire published to none of the ${results.length} selected network(s). ${why}` +
              (limited && limited.upgrade_url ? ` — upgrade: ${limited.upgrade_url}` : ""),
            { itemIndex: i },
          );
        }
      } catch (error) {
        if (this.continueOnFail()) {
          out.push({ json: { error: error.message }, pairedItem: { item: i } });
          continue;
        }
        throw error;
      }
    }

    return [out];
  }
}
exports.PostWire = PostWire;
