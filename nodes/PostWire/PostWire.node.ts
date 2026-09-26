import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type ILoadOptionsFunctions,
	type INodeExecutionData,
	type INodeListSearchResult,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';

import {
	accountProperties,
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
	hintFor,
	maxOf,
	mediaBlocks,
	nameOf,
	needOf,
	tzOffsetMinutes,
	uploadBinary,
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
			'Publish one idea natively to TikTok, Instagram, YouTube, LinkedIn, X, Bluesky and more — a different post written for each network',
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
					push({
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
						const platform = this.getNodeParameter('platform', i, '') as string;
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
					const id = encodeURIComponent(this.getNodeParameter('scheduledPostId', i) as string);
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
					push(await apiRequest.call(this, 'GET', '/api/post/status', undefined, { platform, id }, i));
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
						days: this.getNodeParameter('days', i, 5) as number,
						start_hour: this.getNodeParameter('hour', i, 10) as number,
						tz_offset_minutes: offset,
						brand_voice: (opts.brandVoice as string) || undefined,
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
					const gen = await apiRequest.call(this, 'POST', '/api/generate', {
						prompt,
						platforms,
						media_url: mediaUrl || undefined,
						brand_voice: (opts.brandVoice as string) || undefined,
					}, undefined, i);
					const drafts = (gen.drafts as IDataObject) || {};
					push({
						...gen,
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
					const gen = await apiRequest.call(this, 'POST', '/api/generate', {
						prompt: this.getNodeParameter('prompt', i) as string,
						platforms,
						media_url: mediaUrl || undefined,
						brand_voice: (opts.brandVoice as string) || undefined,
					}, undefined, i);
					perPlatform = (gen.drafts as IDataObject) || {};
				} else if (contentMode === 'drafts') {
					const raw = this.getNodeParameter('drafts', i);
					let parsed: unknown = raw;
					if (typeof raw === 'string') {
						try {
							parsed = JSON.parse(raw);
						} catch {
							throw new NodeOperationError(this.getNode(), "'Drafts' is not valid JSON", {
								itemIndex: i,
								description: 'Map the output of Write Drafts with {{ $json.drafts }}, or write an object like { "x": { "text": "…" } }.',
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

				const brandId = locatorValue(opts.brand ?? opts.brandId);
				const body: IDataObject = {
					platforms,
					per_platform: perPlatform,
					text: perPlatform ? undefined : text,
					photo_url: mediaUrl && !treatAsVideo ? mediaUrl : undefined,
					video_url: mediaUrl && treatAsVideo ? mediaUrl : undefined,
					title: (opts.title as string) || undefined,
					privacy: (opts.privacy as string) || undefined,
					subreddit: (opts.subreddit as string) || undefined,
					brand_id: brandId || undefined,
				};

				if (operation === 'schedule') {
					const runAt = this.getNodeParameter('runAt', i) as string;
					if (!runAt)
						throw new NodeOperationError(this.getNode(), "'Publish At' is empty", {
							itemIndex: i,
							description: 'Pick a date and time, or map one with an expression such as {{ $json.publish_at }}.',
						});
					const scheduled = await apiRequest.call(this, 'POST', '/api/schedule', {
						...body,
						run_at: new Date(runAt).toISOString(),
						label: (opts.label as string) || undefined,
					}, undefined, i);
					push({ ...((scheduled.scheduled as IDataObject) || scheduled), drafts: perPlatform });
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
						if (max && t.length > max)
							issues.push(
								perPlatform
									? `${t.length} characters, over the ${max} limit`
									: `${t.length} characters; PostWire will shorten it to ${max}`,
							);
						if (!t.trim() && !mediaUrl) issues.push('no text');
						push({
							dryRun: true,
							platform: p,
							ready: !issues.some((s) => !s.includes('will shorten')),
							text: t,
							title: draft.title ?? body.title,
							tags: draft.tags,
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
