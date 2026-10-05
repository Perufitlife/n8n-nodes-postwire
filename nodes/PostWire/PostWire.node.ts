import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type ILoadOptionsFunctions,
	type INode,
	type INodeExecutionData,
	type INodeListSearchResult,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';

import {
	accountProperties,
	approvalProperties,
	brandProperties,
	connectionProperties,
	mediaProperties,
	operationProperties,
	postProperties,
	resourceProperty,
	scheduledPostProperties,
} from './Description';
import {
	apiRequest,
	checkMediaUrl,
	classifyMedia,
	describeFailure,
	draftsPreview,
	generateDrafts,
	hintFor,
	maxOf,
	mediaBlocks,
	nameOf,
	needOf,
	tzOffsetMinutes,
	uploadBinary,
	xLength,
} from './GenericFunctions';
import { legacyProperties } from './LegacyDescription';

// Version 1 had one flat list of operations. They map onto the resource model of version 2, so a
// workflow built with the old node runs through exactly the same code as a new one.
const LEGACY: Record<string, { resource: string; operation: string; contentMode?: string }> = {
	me: { resource: 'account', operation: 'get' },
	publish: { resource: 'post', operation: 'publish', contentMode: 'text' },
	generateAndPublish: { resource: 'post', operation: 'publish', contentMode: 'smart' },
	generate: { resource: 'post', operation: 'generate' },
	schedule: { resource: 'post', operation: 'schedule', contentMode: 'text' },
};

/** A parameter a workflow saved by an older version of the node still carries, but the node no longer defines. */
function legacyParam(node: INode, name: string): unknown {
	const v = (node.parameters as IDataObject)?.[name];
	return v === undefined || v === null || v === '' ? undefined : v;
}

function locatorValue(v: unknown): string {
	if (v && typeof v === 'object') return String((v as IDataObject).value ?? '').trim();
	return String(v ?? '').trim();
}

export class PostWire implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PostWire',
		name: 'postWire',
		icon: { light: 'file:postwire.svg', dark: 'file:postwire.dark.svg' },
		group: ['output'],
		version: [1, 2],
		defaultVersion: 2,
		subtitle: '={{$parameter["operation"] + ($parameter["resource"] ? ": " + $parameter["resource"] : "")}}',
		description:
			'Publish one idea natively to TikTok, Instagram, YouTube, LinkedIn, Bluesky and more — a different post written for each network',
		usableAsTool: true,
		defaults: { name: 'PostWire' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'postWireApi', required: true }],
		properties: [
			...legacyProperties,
			resourceProperty,
			...operationProperties,
			...postProperties,
			...scheduledPostProperties,
			...brandProperties,
			...connectionProperties,
			...approvalProperties,
			...accountProperties,
			...mediaProperties,
		],
	};

	methods = {
		listSearch: {
			async searchBrands(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> {
				const res = await apiRequest.call(this, 'GET', '/api/brands');
				const brands = (res.brands as IDataObject[]) || [];
				const f = (filter || '').toLowerCase();
				return {
					results: brands
						.filter((b) => !f || String(b.name).toLowerCase().includes(f))
						.map((b) => ({
							name: `${b.name as string}${
								(b.platforms as string[])?.length ? ` (${(b.platforms as string[]).map(nameOf).join(', ')})` : ''
							}`,
							value: b.id as string,
						})),
				};
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];
		const version = this.getNode().typeVersion;

		for (let i = 0; i < items.length; i++) {
			try {
				let resource: string;
				let operation: string;
				let legacyMode: string | undefined;
				if (version === 1) {
					const legacy = LEGACY[this.getNodeParameter('operation', i) as string];
					if (!legacy) throw new NodeOperationError(this.getNode(), 'Unknown operation', { itemIndex: i });
					({ resource, operation } = legacy);
					legacyMode = legacy.contentMode;
				} else {
					resource = this.getNodeParameter('resource', i) as string;
					operation = this.getNodeParameter('operation', i) as string;
				}
				const push = (json: IDataObject) => out.push({ json, pairedItem: { item: i } });

				if (resource === 'account') {
					const me = await apiRequest.call(this, 'GET', '/api/me', undefined, undefined, i);
					const simplify = version === 1 ? false : (this.getNodeParameter('simplify', i, true) as boolean);
					if (!simplify) {
						push(me);
						continue;
					}
					const usage = (me.usage as IDataObject) || {};
					const brands = (me.brands as IDataObject) || {};
					// Teams: which workspace the key acts in and with which role (a key never switches workspace).
					const workspace = me.workspace as IDataObject | undefined;
					const member = me.member as IDataObject | undefined;
					push({
						...(workspace
							? {
									workspace_id: workspace.id,
									workspace_name: workspace.name ?? null,
									role: member?.effective_role ?? member?.role ?? null,
									brand_ids: member?.brand_ids ?? null,
								}
							: {}),
						email: me.email,
						plan: me.plan,
						posts_used: usage.posts,
						posts_limit: usage.limit,
						brands_used: brands.used,
						brands_limit: brands.limit,
						connected: ((me.connections as IDataObject[]) || []).map((c) => c.platform),
						verified: me.verified,
						account_id: me.account_id,
					});
					continue;
				}

				if (resource === 'media') {
					const field = this.getNodeParameter('binaryPropertyName', i) as string;
					push(await uploadBinary.call(this, i, field));
					continue;
				}

				if (resource === 'approval') {
					if (operation === 'get') {
						const id = String(this.getNodeParameter('approvalId', i) ?? '').trim();
						const res = await apiRequest.call(this, 'GET', `/api/approvals/${encodeURIComponent(id)}`, undefined, undefined, i);
						push((res.approval as IDataObject) || res);
						continue;
					}
					if (operation === 'getAll') {
						const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
						const returnAll = this.getNodeParameter('returnAll', i) as boolean;
						const max = returnAll ? Infinity : (this.getNodeParameter('limit', i) as number);
						const qs: IDataObject = { limit: Math.min(200, Number.isFinite(max) ? max : 200) };
						if (filters.status) qs.status = filters.status;
						const brandFilter = locatorValue(filters.brand);
						if (brandFilter) qs.brand_id = brandFilter;
						const all: IDataObject[] = [];
						// Newest first; `before` pages back through older ones.
						for (let page = 0; page < 50 && all.length < max; page++) {
							const res = await apiRequest.call(this, 'GET', '/api/approvals', undefined, { ...qs }, i);
							const list = (res.approvals as IDataObject[]) || [];
							all.push(...list);
							if (list.length < (qs.limit as number) || !list[list.length - 1]?.created_at) break;
							qs.before = list[list.length - 1].created_at;
						}
						for (const a of all.slice(0, Number.isFinite(max) ? max : undefined)) push(a);
						continue;
					}
				}

				if (resource === 'brand') {
					if (operation === 'getAll') {
						const res = await apiRequest.call(this, 'GET', '/api/brands', undefined, undefined, i);
						let list = (res.brands as IDataObject[]) || [];
						if (!(this.getNodeParameter('returnAll', i) as boolean))
							list = list.slice(0, this.getNodeParameter('limit', i) as number);
						for (const b of list) push(b);
						continue;
					}
					if (operation === 'create') {
						const res = await apiRequest.call(this, 'POST', '/api/brands', {
							name: this.getNodeParameter('name', i) as string,
						}, undefined, i);
						push((res.brand as IDataObject) || res);
						continue;
					}
					const id = locatorValue(this.getNodeParameter('brand', i));
					if (operation === 'get') {
						const res = await apiRequest.call(this, 'GET', `/api/brands/${encodeURIComponent(id)}`, undefined, undefined, i);
						push((res.brand as IDataObject) || res);
						continue;
					}
					if (operation === 'update') {
						const res = await apiRequest.call(this, 'PATCH', `/api/brands/${encodeURIComponent(id)}`, {
							name: this.getNodeParameter('name', i) as string,
						}, undefined, i);
						push((res.brand as IDataObject) || res);
						continue;
					}
					if (operation === 'delete') {
						await apiRequest.call(this, 'DELETE', `/api/brands/${encodeURIComponent(id)}`, undefined, undefined, i);
						push({ deleted: true, id });
						continue;
					}
				}

				if (resource === 'connection') {
					if (operation === 'getAll') {
						const me = await apiRequest.call(this, 'GET', '/api/me', undefined, undefined, i);
						const brandName = new Map(
							((me.brand_list as IDataObject[]) || []).map((b) => [b.id as string, b.name as string]),
						);
						let list = ((me.connections as IDataObject[]) || []).map((c) => ({
							...c,
							network: nameOf(c.platform as string),
							brand_name: brandName.get(c.brand_id as string) ?? null,
						}));
						if (!(this.getNodeParameter('returnAll', i) as boolean))
							list = list.slice(0, this.getNodeParameter('limit', i) as number);
						for (const c of list) push(c);
						continue;
					}
					if (operation === 'checkHealth') {
						const platform = this.getNodeParameter('platform', i) as string;
						push(await apiRequest.call(this, 'GET', `/api/connect/${platform}/health`, undefined, undefined, i));
						continue;
					}
					if (operation === 'createConnectLink') {
						const linkOpts = this.getNodeParameter('options', i, {}) as IDataObject;
						// Up to 0.3.1 'Network' was a top-level parameter; a workflow saved then still carries it.
						const platform = ((linkOpts.platform ?? legacyParam(this.getNode(), 'platform')) as string) || '';
						push(await apiRequest.call(this, 'POST', '/api/connect-link', platform ? { platform } : {}, undefined, i));
						continue;
					}
				}

				if (resource === 'scheduledPost') {
					if (operation === 'getAll') {
						const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
						const qs: IDataObject = {};
						if (filters.from) qs.from = new Date(filters.from as string).toISOString();
						if (filters.to) qs.to = new Date(filters.to as string).toISOString();
						const res = await apiRequest.call(this, 'GET', '/api/schedule', undefined, qs, i);
						let list = (res.scheduled as IDataObject[]) || [];
						if (filters.status) list = list.filter((r) => r.status === filters.status);
						if (!(this.getNodeParameter('returnAll', i) as boolean))
							list = list.slice(0, this.getNodeParameter('limit', i) as number);
						for (const r of list) push(r);
						continue;
					}
					const id = encodeURIComponent(String(this.getNodeParameter('scheduledPostId', i) ?? '').trim());
					if (operation === 'get') {
						const res = await apiRequest.call(this, 'GET', `/api/schedule/${id}`, undefined, undefined, i);
						push((res.scheduled as IDataObject) || res);
						continue;
					}
					if (operation === 'delete') {
						await apiRequest.call(this, 'DELETE', `/api/schedule/${id}`, undefined, undefined, i);
						push({ deleted: true, id: decodeURIComponent(id) });
						continue;
					}
					if (operation === 'update') {
						const fields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
						const body: IDataObject = {};
						if (fields.runAt) body.run_at = new Date(fields.runAt as string).toISOString();
						if (fields.label !== undefined) body.label = fields.label;
						if (!Object.keys(body).length)
							throw new NodeOperationError(this.getNode(), 'Nothing to update', {
								itemIndex: i,
								description: "Add 'Publish At' or 'Label' under 'Update Fields'.",
							});
						const res = await apiRequest.call(this, 'PATCH', `/api/schedule/${id}`, body, undefined, i);
						push((res.scheduled as IDataObject) || res);
						continue;
					}
				}

				if (resource !== 'post') throw new NodeOperationError(this.getNode(), 'Unknown operation', { itemIndex: i });

				// ---------------- post ----------------
				if (operation === 'getStatus') {
					const platform = this.getNodeParameter('statusPlatform', i) as string;
					const id = String(this.getNodeParameter('postId', i) ?? '').trim();
					// PostWire's own id (a scheduled post, or one waiting for approval) needs no network.
					const qs: IDataObject = platform === 'postwire' ? { id } : { platform, id };
					push(await apiRequest.call(this, 'GET', '/api/post/status', undefined, qs, i));
					continue;
				}

				const platforms = ((this.getNodeParameter('platforms', i, []) as string[]) || []).filter(Boolean);
				const opts = this.getNodeParameter('options', i, {}) as IDataObject;
				if (!platforms.length)
					throw new NodeOperationError(this.getNode(), "No network selected in 'Networks'", {
						itemIndex: i,
						description: 'Pick at least one network. They must be connected in the PostWire dashboard.',
					});

				if (operation === 'planWeek') {
					const video = platforms.filter((p) => needOf(p));
					if (video.length)
						throw new NodeOperationError(this.getNode(), `${video.map(nameOf).join(', ')} cannot be in a week plan`, {
							itemIndex: i,
							description: 'A week plan is text only. Schedule video posts one by one with Post → Schedule.',
						});
					const tz = ((opts.timezone as string) || this.getTimezone() || 'UTC').trim();
					let offset: number;
					try {
						offset = tzOffsetMinutes(tz);
					} catch {
						throw new NodeOperationError(this.getNode(), `'Timezone' is not a known time zone: "${tz}"`, {
							itemIndex: i,
							description: 'Use an IANA name such as America/New_York or Europe/Madrid.',
						});
					}
					const res = await apiRequest.call(this, 'POST', '/api/week', {
						topic: this.getNodeParameter('topic', i) as string,
						platforms,
						// Up to 0.3.1 'Days' and 'Hour' were top-level parameters; a workflow saved then still carries them.
						days: Number(opts.days ?? legacyParam(this.getNode(), 'days') ?? 5),
						start_hour: Number(opts.hour ?? legacyParam(this.getNode(), 'hour') ?? 10),
						// The zone itself (each day's own offset, across a DST change), and the offset for an older server.
						timezone: tz,
						tz_offset_minutes: offset,
						brand_voice: (opts.brandVoice as string) || undefined,
						brand_id: locatorValue(opts.brand) || undefined,
					}, undefined, i);
					push({ ...res, timezone: tz });
					continue;
				}

				// Media: a binary is uploaded first, so everything downstream deals in one URL.
				const mediaSource =
					version === 1
						? ((this.getNodeParameter('mediaUrl', i, '') as string) ? 'url' : 'none')
						: (this.getNodeParameter('mediaSource', i, 'none') as string);
				let mediaUrl = '';
				let declared = (opts.mediaType as string) || 'auto';
				if (mediaSource === 'url') mediaUrl = String(this.getNodeParameter('mediaUrl', i, '') || '').trim();
				if (mediaSource === 'binary') {
					const field = this.getNodeParameter('binaryPropertyName', i) as string;
					const hosted = await uploadBinary.call(this, i, field);
					mediaUrl = hosted.media_url as string;
					const ct = String(hosted.content_type || this.helpers.assertBinaryData(i, field).mimeType || '');
					if (declared === 'auto') declared = ct.startsWith('video/') ? 'video' : ct.startsWith('image/') ? 'image' : 'auto';
				}

				if (operation === 'generate') {
					const prompt = this.getNodeParameter('prompt', i) as string;
					const { drafts, missing } = await generateDrafts.call(this, i, {
						prompt,
						platforms,
						media_url: mediaUrl || undefined,
						brand_voice: (opts.brandVoice as string) || undefined,
					});
					push({
						drafts,
						...(missing.length ? { missing } : {}),
						platforms,
						media_url: mediaUrl || undefined,
						preview: draftsPreview(drafts),
					});
					continue;
				}

				// ---- publish / schedule ----
				const contentMode =
					legacyMode ?? (this.getNodeParameter('contentMode', i, 'smart') as string);
				const kind = classifyMedia(mediaUrl, declared);
				const blocked = mediaBlocks(platforms, kind);
				if (blocked.length) {
					const wantsVideo = blocked.some((p) => needOf(p) === 'video');
					throw new NodeOperationError(
						this.getNode(),
						`${blocked.map(nameOf).join(' and ')} will not accept a post without ${wantsVideo ? 'a video' : 'an image or video'}`,
						{
							itemIndex: i,
							description: `Set 'Media' to a video URL or to "Binary File", or remove ${
								blocked.length > 1 ? 'those networks' : 'that network'
							} from 'Networks'.`,
						},
					);
				}
				if (mediaSource === 'url' && mediaUrl && !opts.skipMediaCheck) {
					const why = await checkMediaUrl(this, mediaUrl, platforms);
					if (why)
						throw new NodeOperationError(this.getNode(), 'The media link cannot be published', {
							itemIndex: i,
							description: why,
						});
				}
				// An unrecognised link goes in as the kind the chosen networks need — the only reading
				// of it that can succeed.
				const treatAsVideo = kind === 'video' || (kind === 'unknown' && platforms.some((p) => needOf(p) === 'video'));

				let perPlatform: IDataObject | undefined;
				let text: string | undefined;
				if (contentMode === 'smart') {
					const gen = await generateDrafts.call(this, i, {
						prompt: this.getNodeParameter('prompt', i) as string,
						platforms,
						media_url: mediaUrl || undefined,
						brand_voice: (opts.brandVoice as string) || undefined,
					});
					perPlatform = gen.drafts;
				} else if (contentMode === 'drafts') {
					const raw = this.getNodeParameter('drafts', i);
					let parsed: unknown = raw;
					if (typeof raw === 'string') {
						try {
							parsed = JSON.parse(raw);
						} catch {
							throw new NodeOperationError(this.getNode(), "'Drafts' is not valid JSON", {
								itemIndex: i,
								description: 'Map the output of Write Drafts with {{ $json.drafts }}, or write an object like { "linkedin": { "text": "…" } }.',
							});
						}
					}
					const obj = (parsed && typeof parsed === 'object' ? parsed : {}) as IDataObject;
					perPlatform = (obj.drafts && typeof obj.drafts === 'object' ? obj.drafts : obj) as IDataObject;
					const missingDraft = platforms.filter((p) => !(perPlatform?.[p] as IDataObject)?.text);
					if (missingDraft.length && !mediaUrl)
						throw new NodeOperationError(this.getNode(), `No draft for ${missingDraft.map(nameOf).join(', ')}`, {
							itemIndex: i,
							description: `'Drafts' needs a { "text": … } entry for every network in 'Networks'. Remove those networks or write drafts for them.`,
						});
				} else {
					text = this.getNodeParameter('text', i, '') as string;
				}

				// X thread and reply (Oct 2026). Checked here as X counts characters, so a 281-character post is named
				// before anything is sent — the API would refuse the whole post (bad_x_thread) to every network.
				const xThread = ((opts.xThread as string[] | string | undefined) ?? []);
				const threadPosts = (Array.isArray(xThread) ? xThread : [xThread]).map((t) => String(t ?? '').trim()).filter(Boolean);
				const xReply = String(opts.xReply ?? '').trim();
				if (platforms.includes('x') && (threadPosts.length || xReply)) {
					if (threadPosts.length > 25)
						throw new NodeOperationError(this.getNode(), `'X Thread' has ${threadPosts.length} posts; X threads take at most 25 after the first`, {
							itemIndex: i,
							description: 'Remove posts from Options → X Thread, or split the thread in two.',
						});
					const long = [...threadPosts, ...(xReply ? [xReply] : [])].findIndex((t) => xLength(t) > 280);
					if (long >= 0)
						throw new NodeOperationError(
							this.getNode(),
							long < threadPosts.length
								? `Post ${long + 2} of the X thread is ${xLength(threadPosts[long])} characters as X counts them, over 280`
								: `'X Reply' is ${xLength(xReply)} characters as X counts them, over 280`,
							{ itemIndex: i, description: 'X counts every link as 23 characters and an emoji as 2. Shorten it; nothing was published.' },
						);
					if (threadPosts.length) {
						const pp: IDataObject = { ...(perPlatform || {}) };
						const xd: IDataObject = { ...((pp.x as IDataObject) || {}) };
						if (!xd.text && text) xd.text = text;
						xd.thread = threadPosts;
						pp.x = xd;
						perPlatform = pp;
					}
				}

				const brandId = locatorValue(opts.brand ?? opts.brandId);
				const body: IDataObject = {
					platforms,
					per_platform: perPlatform,
					// With 'Same Text' the text stays for every network; per_platform then only carries the X thread.
					text,
					photo_url: mediaUrl && !treatAsVideo ? mediaUrl : undefined,
					video_url: mediaUrl && treatAsVideo ? mediaUrl : undefined,
					title: (opts.title as string) || undefined,
					privacy: (opts.privacy as string) || undefined,
					brand_id: brandId || undefined,
					options: platforms.includes('x') && xReply ? { x: { reply: xReply } } : undefined,
				};

				if (operation === 'schedule') {
					const when = this.getNodeParameter('when', i, 'time') as string;
					let runAt = '';
					if (when === 'nextSlot') runAt = 'next_slot';
					else {
						const at = this.getNodeParameter('runAt', i, '') as string;
						if (!at)
							throw new NodeOperationError(this.getNode(), "'Publish At' is empty", {
								itemIndex: i,
								description: 'Pick a date and time, map one with an expression such as {{ $json.publish_at }}, or set \'When\' to "In the Next Free Queue Slot".',
							});
						runAt = new Date(at).toISOString();
					}
					const scheduled = await apiRequest.call(this, 'POST', '/api/schedule', {
						...body,
						run_at: runAt,
						timezone: when === 'nextSlot' ? ((opts.timezone as string) || this.getTimezone() || undefined) : undefined,
						label: (opts.label as string) || undefined,
					}, undefined, i);
					const row = scheduled.scheduled as IDataObject | undefined;
					if (scheduled.status === 'pending_approval' || !row) {
						// Held for a person (202): nothing is queued until someone approves it.
						push({ ...scheduled, drafts: perPlatform });
						continue;
					}
					push({
						...row,
						...(scheduled.slot ? { slot: scheduled.slot } : {}),
						...(scheduled.held ? { held: true, code: scheduled.code, message: scheduled.message, upgrade_url: scheduled.upgrade_url } : {}),
						...(scheduled.held_networks ? { held_networks: scheduled.held_networks, held_message: scheduled.held_message } : {}),
						...(scheduled.x_credits ? { x_credits: scheduled.x_credits } : {}),
						drafts: perPlatform,
					});
					continue;
				}

				if (opts.dryRun) {
					const me = await apiRequest.call(this, 'GET', '/api/me', undefined, undefined, i);
					const conns = ((me.connections as IDataObject[]) || []).filter(
						(c) => !brandId || c.brand_id === brandId,
					);
					for (const p of platforms) {
						const draft = (perPlatform?.[p] as IDataObject) || {};
						const t = String(draft.text ?? text ?? '');
						const issues: string[] = [];
						if (!conns.some((c) => c.platform === p))
							issues.push(`${nameOf(p)} is not connected${brandId ? ' to this brand' : ''}`);
						const max = maxOf(p);
						// X counts a link as 23 and an emoji as 2. The first post is shortened like any shared text; the posts
						// of a thread are not (X refuses them), so each is checked on its own.
						const len = p === 'x' ? xLength(t) : t.length;
						if (max && len > max)
							issues.push(
								perPlatform
									? `${len} characters, over the ${max} limit`
									: `${len} characters; PostWire will shorten it to ${max}`,
							);
						const thread = p === 'x' && Array.isArray(draft.thread) ? (draft.thread as string[]) : [];
						thread.forEach((tp, n) => {
							if (xLength(String(tp)) > 280) issues.push(`thread post ${n + 2}: ${xLength(String(tp))} characters, over 280`);
						});
						if (!t.trim() && !mediaUrl) issues.push('no text');
						push({
							dryRun: true,
							platform: p,
							ready: !issues.some((s) => !s.includes('will shorten')),
							text: t,
							title: draft.title ?? body.title,
							tags: draft.tags,
							...(thread.length ? { thread } : {}),
							...(p === 'x' && xReply ? { reply: xReply } : {}),
							media_url: mediaUrl || undefined,
							issues,
						});
					}
					continue;
				}

				// A retry of this step (n8n "Retry On Fail") writes new drafts, so the server's
				// fingerprint of the payload would not recognise it as a repeat and the audience would
				// get the post twice. The execution id is stable across those retries.
				let idem = String(opts.idempotencyKey || '').trim();
				if (!idem && contentMode === 'smart') {
					const exec = this.getExecutionId?.();
					if (exec) idem = `n8n:${exec}:${this.getNode().name}:${i}`;
				}
				if (idem) body.idempotency_key = idem.slice(0, 200);

				const response = await apiRequest.call(this, 'POST', '/api/post', body, undefined, i);
				// One item per network, so a Filter or IF node can act on the failures alone.
				const results = ((response.results as IDataObject[]) || [response]).filter(Boolean);

				// Held for approval (202): nothing was published and nothing failed. The brand's approval rules, a limit on
				// this API key or a Contributor's role made it wait for a person; it goes out when they approve it. Each
				// network says so, with the ids a PostWire Trigger (approval.decided) or Post → Get Status can follow.
				if (response.status === 'pending_approval') {
					const approval = (response.approval as IDataObject) || {};
					for (const res of results)
						push({
							...res,
							status: 'pending_approval',
							id: response.id,
							schedule_id: response.schedule_id ?? response.id,
							approval_id: response.approval_id,
							review_url: approval.review_url,
							reasons: approval.reasons,
							message: response.message_for_user ?? response.message,
						});
					continue;
				}
				for (const res of results) {
					const extra: IDataObject = {};
					if (res.ok === false) {
						const hint = hintFor(res.platform as string, String(res.error || ''), res.code as string | undefined);
						if (hint) extra.hint = hint;
					}
					if (response.notice) extra.notice = response.notice;
					push({ ...res, ...extra });
				}

				// A 200 whose every network failed must not leave the node green: a scheduled flow
				// could publish nothing for weeks and never say so.
				const failed = results.filter((res) => res?.ok === false);
				if (results.length && failed.length === results.length) {
					const why = failed
						.map((f) => `${nameOf((f.platform as string) || '?')}: ${f.error || f.code || 'failed'}`)
						.join('; ');
					const first = failed[0];
					const fix =
						hintFor(first.platform as string, String(first.error || ''), first.code as string | undefined) ||
						describeFailure(first.code as string | undefined, first).description;
					throw new NodeOperationError(
						this.getNode(),
						`PostWire published to none of the ${results.length} selected network(s)`,
						{ itemIndex: i, description: `${why}${fix ? ` — ${fix}` : ''}` },
					);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({
						json: {
							error: (error as Error).message,
							description: (error as { description?: string }).description ?? undefined,
						},
						pairedItem: { item: i },
					});
					continue;
				}
				// Rebuilt rather than re-thrown: the verification linter refuses a bare re-throw, and
				// this keeps the message and the fix our own checks already wrote.
				const e = error as NodeApiError;
				if (error instanceof NodeApiError)
					throw new NodeApiError(this.getNode(), {} as JsonObject, {
						message: e.message,
						description: e.description ?? undefined,
						httpCode: e.httpCode ?? undefined,
						itemIndex: i,
					});
				throw new NodeOperationError(this.getNode(), (error as Error).message, {
					itemIndex: i,
					description: (error as NodeOperationError).description ?? undefined,
				});
			}
		}

		return [out];
	}
}
