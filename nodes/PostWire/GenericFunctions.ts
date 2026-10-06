import {
	NodeApiError,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type IHookFunctions,
	type IHttpRequestMethods,
	type IHttpRequestOptions,
	type ILoadOptionsFunctions,
	type JsonObject,
} from 'n8n-workflow';

export const BASE = 'https://postwire.io';
// Tagged so an account opened from n8n is attributed to the node (PostWire's signup reads the first-touch utm).
export const DASHBOARD = `${BASE}/dashboard.html?utm_source=n8n&utm_medium=node`;

export type MediaNeed = 'video' | 'any' | null;

// Every network PostWire can publish to. `mediaNeed` mirrors the server's own rule so the node can
// explain the fix before a request is spent. `max` is the character ceiling the server enforces.
export const PLATFORMS: Array<{ name: string; value: string; mediaNeed: MediaNeed; max: number }> = [
	{ name: 'Bluesky', value: 'bluesky', mediaNeed: null, max: 300 },
	{ name: 'Discord', value: 'discord', mediaNeed: null, max: 2000 },
	{ name: 'Facebook', value: 'facebook', mediaNeed: null, max: 2000 },
	{ name: 'Instagram', value: 'instagram', mediaNeed: 'any', max: 2200 },
	{ name: 'LinkedIn', value: 'linkedin', mediaNeed: null, max: 3000 },
	{ name: 'Mastodon', value: 'mastodon', mediaNeed: null, max: 500 },
	{ name: 'Reddit', value: 'reddit', mediaNeed: null, max: 10000 },
	{ name: 'Telegram', value: 'telegram', mediaNeed: null, max: 4000 },
	{ name: 'TikTok', value: 'tiktok', mediaNeed: 'video', max: 2200 },
	{ name: 'X (Twitter)', value: 'x', mediaNeed: null, max: 280 },
	{ name: 'YouTube', value: 'youtube', mediaNeed: 'video', max: 5000 },
];

/**
 * Length as X counts it: every link is 23 characters whatever its length, and an emoji (any character outside the
 * Basic Multilingual Plane) is 2. The same rule the PostWire API applies before it spends X credits.
 */
export function xLength(text: string): number {
	const withoutLinks = String(text ?? '').replace(/https?:\/\/\S+/gi, '');
	const links = (String(text ?? '').match(/https?:\/\/\S+/gi) || []).length;
	let n = 0;
	for (const ch of withoutLinks) n += (ch.codePointAt(0) ?? 0) > 0xffff ? 2 : 1;
	return n + links * 23;
}

export const needOf = (value: string): MediaNeed =>
	PLATFORMS.find((p) => p.value === value)?.mediaNeed ?? null;
export const maxOf = (value: string): number | undefined =>
	PLATFORMS.find((p) => p.value === value)?.max;
export const nameOf = (value: string): string =>
	PLATFORMS.find((p) => p.value === value)?.name ?? value;

// The server refuses a single remote file above this, and an upload through the node above the
// storage bucket's ceiling. Both numbers come from the PostWire API itself (src/store.js).
export const REMOTE_MEDIA_MAX_BYTES = 1024 * 1024 * 1024;
export const UPLOAD_MAX_BYTES = 50 * 1024 * 1024;

export type MediaKind = 'video' | 'image' | 'unknown' | 'none';

/**
 * Video or photo, from the URL alone. Three answers, and "unknown" is never grounds for refusing:
 * a signed CDN link or one ending in #t=30 has no readable extension and publishes perfectly well.
 */
export function classifyMedia(url: string, declared = 'auto'): MediaKind {
	if (!url) return 'none';
	if (declared === 'video' || declared === 'image') return declared;
	if (/\.(mp4|mov|webm|m3u8|avi|mkv|m4v)(\?|#|$)/i.test(url)) return 'video';
	if (/\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?)(\?|#|$)/i.test(url)) return 'image';
	return 'unknown';
}

/** Networks in `platforms` that cannot accept a post with this media, with the reason. */
export function mediaBlocks(platforms: string[], kind: MediaKind): string[] {
	return platforms.filter((p) => {
		const need = needOf(p);
		if (!need) return false;
		if (need === 'video') return kind === 'image' || kind === 'none';
		return kind === 'none';
	});
}

/**
 * Links that open a web page rather than the file itself. The networks download the media from
 * the URL, get HTML back, and fail with "could not fetch the video" — the single most common
 * reason a video post failed in PostWire's logs (Sept 2026). Each entry names the fix.
 */
export function pageLinkFix(url: string): string | null {
	let host = '';
	let path = '';
	try {
		const u = new URL(url);
		host = u.hostname.toLowerCase();
		path = u.pathname + u.search;
	} catch {
		return null;
	}
	if (host.endsWith('drive.google.com') || host.endsWith('docs.google.com'))
		return 'A Google Drive share link opens a web page, not the file. Add a Google Drive node set to "Download", then set \'Media\' to "Binary File" — PostWire hosts it for you.';
	if (host.endsWith('dropbox.com') && !/[?&](dl=1|raw=1)/.test(path))
		return 'A Dropbox share link opens a preview page. Change "dl=0" to "dl=1" at the end of the link, or download the file with the Dropbox node and use "Binary File".';
	if (host === '1drv.ms' || host.endsWith('onedrive.live.com') || host.endsWith('sharepoint.com'))
		return 'A OneDrive/SharePoint share link opens a web page. Download the file with the Microsoft OneDrive node and set \'Media\' to "Binary File".';
	if (
		host.endsWith('youtube.com') ||
		host === 'youtu.be' ||
		host.endsWith('tiktok.com') ||
		host.endsWith('instagram.com') ||
		host.endsWith('vimeo.com')
	)
		return 'This is a link to a post on another platform, not a video file. Use a direct link to the .mp4 file, or download it first and set \'Media\' to "Binary File".';
	return null;
}

const MB = (n: number) => `${(n / 1048576).toFixed(n > 10485760 ? 0 : 1)} MB`;

/**
 * Checks the media link the way the networks will: is it reachable without a login, is it a file
 * and not a page, and is it a size they accept. Returns a sentence naming the fix, or null.
 *
 * A link we cannot check (the host refuses HEAD, a timeout) is never grounds for refusing: the
 * network is the one that decides, and a false "your link is broken" is worse than none.
 */
export async function checkMediaUrl(
	ctx: IExecuteFunctions,
	url: string,
	platforms: string[],
): Promise<string | null> {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return `'Media URL' is not a valid link: "${url.slice(0, 80)}". Use a full https:// address.`;
	}
	if (parsed.protocol !== 'https:')
		return `'Media URL' must start with https:// — TikTok, Instagram and YouTube refuse to download media over plain http.`;
	const page = pageLinkFix(url);
	if (page) return page;

	const probe = async (method: IHttpRequestMethods, headers: IDataObject = {}) =>
		(await ctx.helpers.httpRequest({
			method,
			url,
			headers,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
			encoding: 'arraybuffer',
			timeout: 15000,
		} as IHttpRequestOptions)) as { statusCode: number; headers: IDataObject };

	let res: { statusCode: number; headers: IDataObject };
	try {
		res = await probe('HEAD');
		// Many CDNs and signed-URL hosts refuse HEAD but serve a one-byte range.
		if (res.statusCode === 405 || res.statusCode === 403 || res.statusCode === 400)
			res = await probe('GET', { Range: 'bytes=0-0' });
	} catch {
		return null;
	}
	const h = (k: string) => String(res.headers?.[k] ?? res.headers?.[k.toLowerCase()] ?? '');
	if (res.statusCode === 401 || res.statusCode === 403)
		return `The media link answered ${res.statusCode} (needs a login or has expired). The networks download it from the internet with no credentials, so it must be public — or set 'Media' to "Binary File" and PostWire will host it.`;
	if (res.statusCode === 404) return `The media link answered 404: there is no file at that address any more.`;
	if (res.statusCode >= 400)
		return `The media link answered HTTP ${res.statusCode}, so the networks would not be able to download it either. Check the link opens in a private browser window.`;

	const type = h('content-type').toLowerCase();
	if (type.includes('text/html'))
		return `The media link returns a web page (text/html), not a video or image file. Use the direct file link (it usually ends in .mp4 or .jpg), or set 'Media' to "Binary File".`;

	const range = /\/(\d+)\s*$/.exec(h('content-range'));
	const size = range ? Number(range[1]) : Number(h('content-length')) || 0;
	if (size > REMOTE_MEDIA_MAX_BYTES)
		return `The file is ${MB(size)}; PostWire accepts up to ${MB(REMOTE_MEDIA_MAX_BYTES)} per file. Export a shorter or more compressed version (H.264 MP4, 1080p is plenty).`;

	const wantsVideo = platforms.some((p) => needOf(p) === 'video');
	if (wantsVideo && type.startsWith('image/'))
		return `The link is an image (${type}), and ${platforms
			.filter((p) => needOf(p) === 'video')
			.map(nameOf)
			.join(' and ')} only accept video.`;
	if (platforms.includes('instagram') && /video\/(webm|x-matroska|x-msvideo)/.test(type))
		return `Instagram accepts MP4 or MOV video, and this file is ${type}. Convert it to H.264 MP4 first.`;
	return null;
}

// --- errors ---------------------------------------------------------------------------------

/** The fix for each machine-readable code the PostWire API returns. */
export function describeFailure(
	code: string | undefined,
	body: IDataObject,
	status?: number,
): { message: string; description: string } {
	const serverMsg = String(body?.error || body?.message || '').trim();
	const platforms = Array.isArray(body?.platforms) ? (body.platforms as string[]).map(nameOf) : [];
	const upgrade = (body?.upgrade_url as string) || `${DASHBOARD}#plans`;
	switch (code) {
		case 'not_connected':
			return {
				message: serverMsg || `${platforms.join(', ')} not connected`,
				description: `Connect ${platforms.join(', ') || 'that network'} in PostWire (${DASHBOARD} → Accounts; TikTok, Instagram and YouTube are one OAuth click — PostWire already holds the platform approvals), or remove it from 'Networks'. To let a client connect their own account, use Connection → Create Connect Link.`,
			};
		case 'media_required':
			return {
				message: serverMsg || 'This network needs media',
				description: `TikTok and YouTube only publish video, and Instagram needs a photo or video. Set 'Media' to a direct file URL or to "Binary File" (from a Google Drive, HTTP Request or Read File node), or remove those networks.`,
			};
		case 'media_unreachable':
			// Since 26-sep-2026 the API looks at the media link once, before ANY network is tried,
			// and names the reason (403/404, a Drive/Dropbox page, an empty file, http://).
			return {
				message: serverMsg || 'PostWire could not download the media',
				description: `Nothing was published. The networks download the file from the link with no login, so it must be a public https link to the file itself — not a share page. Or set 'Media' to "Binary File" (after a Google Drive / HTTP Request / Read File node) and PostWire hosts it for you.`,
			};
		case 'invalid_credentials':
			return {
				message: serverMsg || 'Those account details were not accepted',
				description: 'Check the value named in the message and connect the account again in the PostWire dashboard.',
			};
		case 'bad_request':
			return {
				message: serverMsg || 'PostWire could not read the request',
				description: "Check 'Networks' has at least one network and that expressions resolve to the expected values (open the input panel to see them).",
			};
		case 'too_long':
			return {
				message: serverMsg || 'The post is too long for this network',
				description: `Shorten the text, or switch 'Content' to Smart Distribute so each network gets a version written to its own limit.`,
			};
		case 'limit_reached':
		case 'quota_exhausted':
			return {
				message: serverMsg || 'Monthly post limit reached',
				description: `Nothing more will publish this month on the current plan. Upgrade at ${upgrade} — a post counts once per network.`,
			};
		case 'brand_limit_reached':
			return {
				message: serverMsg || 'Brand limit reached',
				description: `Add the account to an existing brand, or upgrade for more brands: ${upgrade}`,
			};
		case 'duplicate_post':
			return {
				message: serverMsg || 'This post was already published',
				description: `PostWire received the exact same post moments ago (usually n8n retrying the step) and did not publish it twice. If the repeat is deliberate, change the text or set 'Idempotency Key' in Options.`,
			};
		case 'preview_key':
		case 'email_unverified':
		case 'unverified':
			return {
				message: serverMsg || 'This API key cannot publish yet',
				description: `Confirm your email from the PostWire signup message, then copy the key shown in ${DASHBOARD} → API & MCP into the credential.`,
			};
		case 'unknown_endpoint':
			return {
				message: serverMsg,
				description: 'Update the n8n-nodes-postwire package to the latest version (Settings → Community nodes).',
			};
		// X (Twitter) is a pay-per-use add-on of the paid plans (Oct 2026).
		case 'bad_x_thread':
			return {
				message: serverMsg || 'The X thread or reply cannot be published',
				description: `Nothing was published to any network. Each X post must be text, at most 280 characters as X counts them (a link counts 23, an emoji 2), and a thread has at most 25 posts after the first. Fix 'X Thread' / 'X Reply' in Options, or the drafts.`,
			};
		case 'x_credits_required':
			return {
				message: serverMsg || 'Not enough X credits',
				description: `Each X post uses X credits (1, or 10 with a link; every post of a thread counts). Nothing was published. Top up in ${DASHBOARD}#x, or remove X from 'Networks'.`,
			};
		case 'x_paid_plan_required':
			return {
				message: serverMsg || 'X needs a paid plan',
				description: `Posting to X is part of the paid plans (not Free or the trial). Upgrade at ${upgrade}, or remove X from 'Networks'.`,
			};
		case 'x_daily_limit':
			return {
				message: serverMsg || "This account reached today's X limit",
				description: 'Nothing was sent and no X credits were used. The limit resets at 00:00 UTC; schedule the post for later with Post → Schedule.',
			};
		case 'x_unavailable':
		case 'x_reconnect':
			return {
				message: serverMsg || 'X is not available for this post',
				description: `Reconnect X in ${DASHBOARD} → Accounts and run the step again.`,
			};
		// Approvals and limits per API key (Oct 2026).
		case 'key_network_not_allowed':
		case 'key_brand_not_allowed':
		case 'key_monthly_cap_reached':
			return {
				message: serverMsg || 'This API key is not allowed to make this post',
				description: `The account owner set limits on this API key (networks, brands or a monthly cap). Nothing was published. They can be changed in ${DASHBOARD} → API & MCP → Limits.`,
			};
		case 'governance_unavailable':
			return {
				message: serverMsg || 'PostWire could not check the approval rules',
				description: 'Nothing was published. Run the step again in a minute (enable "Retry On Fail" in the node settings).',
			};
		// Teams (Oct 2026): an API key acts with the role of the member who created it.
		case 'role_forbidden':
		case 'seat_read_only':
			return {
				message: serverMsg || 'Your role in this PostWire workspace cannot do this',
				description: `The key in this credential belongs to a team member whose role does not allow it. Ask an admin of the workspace to change the role (${DASHBOARD} → Settings → Team), or use a key created by a member who can.`,
			};
		case 'brand_restricted':
			return {
				message: serverMsg || 'This key can only work with some brands',
				description: `Pick one of the brands this team member was given in 'Brand', or ask an admin to add the brand to the member (${DASHBOARD} → Settings → Team).`,
			};
		case 'workspace_forbidden':
			return {
				message: serverMsg || 'This key cannot act in that workspace',
				description: 'An API key belongs to the workspace it was created in. Create a key inside the workspace you want to post for, and put it in the credential.',
			};
		// Scheduling
		case 'no_free_slot':
			return {
				message: serverMsg || 'No free queue slot',
				description: `Every queue slot of these networks is taken for the next 28 days. Add queue slots to the brand in the PostWire dashboard, or set 'When' to "At a Specific Time".`,
			};
		case 'bad_timezone':
			return {
				message: serverMsg || 'Unknown time zone',
				description: "Use an IANA name such as America/New_York or Europe/Madrid in Options → Timezone.",
			};
		case 'ambiguous_brand':
			return {
				message: serverMsg || 'That network is connected in more than one brand',
				description: "Pick the brand in Options → Brand, so PostWire knows which account to post from.",
			};
		// Webhooks (PostWire Trigger)
		case 'bad_url':
			return {
				message: serverMsg || 'PostWire cannot call this n8n webhook URL',
				description:
					"PostWire only calls public https addresses. Set n8n's WEBHOOK_URL to the public https address of this instance (or use a tunnel such as n8n's --tunnel or Cloudflare Tunnel), then activate the workflow again.",
			};
		case 'too_many':
			return {
				message: serverMsg || 'This PostWire account already has 5 webhook endpoints',
				description: `Delete an endpoint you no longer use (${DASHBOARD} → API & MCP → Webhooks), or deactivate another workflow with a PostWire Trigger, then activate this one again.`,
			};
		case 'webhooks_unavailable':
			return {
				message: serverMsg || 'Webhooks are not available right now',
				description: 'Try activating the workflow again in a few minutes.',
			};
		case 'too_large':
			return {
				message: serverMsg || 'The file is too large',
				description: 'PostWire takes files up to 1 GB. Export a shorter or more compressed version (H.264 MP4, 1080p).',
			};
	}
	if (status === 401)
		return {
			message: 'PostWire did not accept the API key',
			description: `Open the PostWire credential, paste a key from ${DASHBOARD} → API & MCP, and press Test.`,
		};
	if (status === 429)
		return {
			message: serverMsg || 'Too many requests',
			description:
				'PostWire rate-limits bursts, and AI drafts are capped per day by plan (Free 15, Starter 60, Pro 300). Wait a minute, or add a Wait node between items.',
		};
	if (status && status >= 500)
		return {
			message: serverMsg || `PostWire answered ${status}`,
			description: 'A temporary server-side issue. Enable "Retry On Fail" in the node settings, or run it again in a minute.',
		};
	return { message: serverMsg || `PostWire answered ${status ?? 'with an unexpected response'}`, description: '' };
}

/**
 * A sentence for one network that failed inside a publish that otherwise went through. These come
 * from the networks themselves, so they are matched on text rather than a code.
 */
export function hintFor(platform: string, error: string, code?: string): string | undefined {
	if (code) {
		const d = describeFailure(code, { platforms: [platform] });
		if (d.description) return d.description;
	}
	const e = error.toLowerCase();
	if (/could not fetch|could not download|unreachable/.test(e) && /drive\.google|dropbox|web page|html/.test(e))
		return describeFailure('media_unreachable', {}).description;
	if (/could not fetch|invalid media url|failed to download|download.*(fail|error)|url.*(unreachable|not accessible)/.test(e))
		return `${nameOf(platform)} could not download the media. It must be a public https link to the file itself (not a share page, no login). Set 'Media' to "Binary File" to let PostWire host it.`;
	if (/must be https/.test(e)) return `Use an https:// media link.`;
	if (/still processing|processing after/.test(e))
		return `${nameOf(platform)} was still processing the video. Shorter or smaller files (H.264 MP4, under ~100 MB) process faster; retry in a few minutes.`;
	if (/media upload has failed|unsupported|format|codec|aspect ratio/.test(e))
		return `${nameOf(platform)} rejected the file itself. Use H.264 MP4 with AAC audio, 9:16 for Reels/TikTok/Shorts, under 90 seconds for Reels.`;
	if (/privacy_level/.test(e))
		return `This TikTok account does not allow that visibility. Set Options → Visibility to Public, or change it in the TikTok app.`;
	if (/too many requests|retry after/.test(e))
		return `${nameOf(platform)} is rate-limiting this account. Space posts out with a Wait node.`;
	if (/token|expired|invalid_grant|reconnect|unauthori/.test(e))
		return `The ${nameOf(platform)} connection has expired. Reconnect it in ${DASHBOARD} → Accounts.`;
	return undefined;
}

// --- requests -------------------------------------------------------------------------------

/**
 * Every PostWire call goes through here. The response is read in full rather than thrown, so a
 * refusal reaches the user with the API's own machine-readable code turned into a fix, not a bare
 * "400 Bad Request".
 */
export async function apiRequest(
	this: IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject,
	qs?: IDataObject,
	itemIndex = 0,
): Promise<IDataObject> {
	const options: IHttpRequestOptions = {
		method,
		url: `${BASE}${path}`,
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	if (body) options.body = body;
	if (qs) options.qs = qs;
	let res: { statusCode: number; body: IDataObject };
	try {
		res = (await this.helpers.httpRequestWithAuthentication.call(this, 'postWireApi', options)) as {
			statusCode: number;
			body: IDataObject;
		};
	} catch (error) {
		throw new NodeApiError(this.getNode(), error as JsonObject, {
			itemIndex,
			message: 'Could not reach PostWire',
			description: 'Check the n8n instance can reach https://postwire.io, then run the step again.',
		});
	}
	const data = (typeof res.body === 'object' && res.body !== null ? res.body : {}) as IDataObject;
	if (res.statusCode >= 400) {
		const { message, description } = describeFailure(data.code as string | undefined, data, res.statusCode);
		throw new NodeApiError(this.getNode(), data as JsonObject, {
			itemIndex,
			message,
			description,
			httpCode: String(res.statusCode),
		});
	}
	return data;
}

/** Uploads an n8n binary to PostWire's media storage and returns a publishable URL. */
export async function uploadBinary(
	this: IExecuteFunctions,
	itemIndex: number,
	binaryPropertyName: string,
): Promise<IDataObject> {
	const meta = this.helpers.assertBinaryData(itemIndex, binaryPropertyName);
	const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryPropertyName);
	const contentType = (meta.mimeType || '').split(';')[0].trim().toLowerCase();
	const supported = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm'];
	if (!supported.includes(contentType))
		throw new NodeOperationError(this.getNode(), `The file in '${binaryPropertyName}' is ${contentType || 'of an unknown type'}`, {
			itemIndex,
			description: `PostWire hosts ${supported.join(', ')}. Convert the file first, or check 'Input Binary Field' points at the media and not at another attachment.`,
		});
	if (buffer.length > REMOTE_MEDIA_MAX_BYTES)
		throw new NodeOperationError(this.getNode(), `The file is ${MB(buffer.length)}; PostWire takes files up to ${MB(REMOTE_MEDIA_MAX_BYTES)}`, {
			itemIndex,
			description: 'Export a shorter or more compressed version (H.264 MP4, 1080p is plenty).',
		});

	// Over one storage object's ceiling (50 MB) the API hands out one signed URL per part and serves the parts back as
	// one file (multipart, Oct 2026). Up to 0.3.2 the node refused anything over 50 MB.
	const multipart = buffer.length > UPLOAD_MAX_BYTES;
	const slot = await apiRequest.call(this, 'POST', '/api/media/upload-url', {
		content_type: contentType,
		size_bytes: buffer.length,
		...(multipart ? { multipart: true } : {}),
	}, undefined, itemIndex);
	const parts: Array<{ url: string; start: number; end: number }> =
		multipart && Array.isArray(slot.parts)
			? (slot.parts as IDataObject[]).map((p) => ({ url: p.upload_url as string, start: Number(p.start), end: Number(p.end) }))
			: [{ url: slot.upload_url as string, start: 0, end: buffer.length }];
	for (const [n, part] of parts.entries()) {
		const put = (await this.helpers.httpRequest({
			method: 'PUT',
			url: part.url,
			body: buffer.subarray(part.start, part.end),
			headers: { 'content-type': contentType },
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
		})) as { statusCode: number };
		if (put.statusCode >= 400)
			throw new NodeOperationError(
				this.getNode(),
				`The upload to PostWire storage answered ${put.statusCode}${parts.length > 1 ? ` (part ${n + 1} of ${parts.length})` : ''}`,
				{ itemIndex, description: 'Run the step again; an upload slot is valid for a short time only.' },
			);
	}
	return await apiRequest.call(this, 'GET', '/api/media/finalize', undefined, { path: slot.path }, itemIndex);
}

/**
 * Minutes to ADD to a local wall-clock time to get UTC, for an IANA zone on a given date — the
 * same convention as JavaScript's getTimezoneOffset(), which is what PostWire's week planner
 * expects. Lima → 300, Madrid in summer → -120.
 */
export function tzOffsetMinutes(timeZone: string, at: Date = new Date()): number {
	const parts = new Intl.DateTimeFormat('en-US', {
		timeZone,
		hourCycle: 'h23',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		hour: '2-digit',
		minute: '2-digit',
		second: '2-digit',
	}).formatToParts(at);
	const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
	const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
	return Math.round((at.getTime() - asUtc) / 60000);
}

/** A readable one-block preview of the drafts, for Slack/Telegram/email approval steps. */
export function draftsPreview(drafts: IDataObject): string {
	return Object.entries(drafts || {})
		.map(([p, d]) => {
			const draft = (d || {}) as IDataObject;
			const title = draft.title ? `${draft.title as string}\n` : '';
			return `*${nameOf(p)}*\n${title}${(draft.text as string) || ''}`;
		})
		.join('\n\n');
}

/**
 * Smart Distribute, with up to two retries for any network the writer left empty. The model occasionally
 * returns a blank draft for one network (seen live on 26-sep for LinkedIn in a 4-network batch);
 * without the retry that network would then be refused as "no text" at publish time.
 */
export async function generateDrafts(
	this: IExecuteFunctions,
	itemIndex: number,
	body: { prompt: string; platforms: string[]; media_url?: string; brand_voice?: string },
): Promise<{ drafts: IDataObject; missing: string[] }> {
	const first = await apiRequest.call(this, 'POST', '/api/generate', body as unknown as IDataObject, undefined, itemIndex);
	const drafts = { ...((first.drafts as IDataObject) || {}) };
	const empty = () => body.platforms.filter((p) => !String((drafts[p] as IDataObject)?.text ?? '').trim());
	let missing = empty();
	// Two more tries at most, each only for the networks still empty: measured on 26-sep, a lone
	// LinkedIn request came back empty in 2 of 4 attempts, so one retry still left ~25 % empty.
	for (let attempt = 0; attempt < 2 && missing.length; attempt++) {
		const again = await apiRequest.call(
			this,
			'POST',
			'/api/generate',
			{ ...body, platforms: missing } as unknown as IDataObject,
			undefined,
			itemIndex,
		);
		for (const p of missing) {
			const d = (again.drafts as IDataObject)?.[p] as IDataObject | undefined;
			if (d && String(d.text ?? '').trim()) drafts[p] = d;
		}
		missing = empty();
	}
	return { drafts, missing };
}
