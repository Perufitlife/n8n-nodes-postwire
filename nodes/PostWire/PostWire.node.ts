import {
	NodeApiError,
	NodeConnectionTypes,
	NodeOperationError,
	type IDataObject,
	type IExecuteFunctions,
	type INodeExecutionData,
	type INodeType,
	type INodeTypeDescription,
	type JsonObject,
} from 'n8n-workflow';

const BASE = 'https://postwire.io';

type MediaNeed = 'video' | 'any' | null;

// Every network PostWire can publish to. `mediaNeed` mirrors the server's own rule so the node can
// warn in the editor rather than letting the call fail — TikTok and YouTube refuse a post with no
// video, and Instagram refuses one with no media at all.
const PLATFORMS: Array<{ name: string; value: string; mediaNeed: MediaNeed }> = [
	{ name: 'TikTok', value: 'tiktok', mediaNeed: 'video' },
	{ name: 'Instagram', value: 'instagram', mediaNeed: 'any' },
	{ name: 'YouTube', value: 'youtube', mediaNeed: 'video' },
	{ name: 'LinkedIn', value: 'linkedin', mediaNeed: null },
	{ name: 'X (Twitter)', value: 'x', mediaNeed: null },
	{ name: 'Facebook', value: 'facebook', mediaNeed: null },
	{ name: 'Reddit', value: 'reddit', mediaNeed: null },
	{ name: 'Bluesky', value: 'bluesky', mediaNeed: null },
	{ name: 'Mastodon', value: 'mastodon', mediaNeed: null },
	{ name: 'Telegram', value: 'telegram', mediaNeed: null },
	{ name: 'Discord', value: 'discord', mediaNeed: null },
];

const needOf = (value: string): MediaNeed =>
	PLATFORMS.find((p) => p.value === value)?.mediaNeed ?? null;

export class PostWire implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'PostWire',
		name: 'postWire',
		icon: { light: 'file:postwire.svg', dark: 'file:postwire.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Publish one idea natively to every social network',
		// An agent asking to post is exactly the use this node was built for.
		usableAsTool: true,
		defaults: { name: 'PostWire' },
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'postWireApi', required: true }],
		requestDefaults: {
			baseURL: BASE,
			headers: { 'Content-Type': 'application/json' },
		},
		properties: [
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Get Account',
						value: 'me',
						description: 'Plan, usage this month and connected accounts',
						action: 'Get account',
					},
					{
						name: 'Publish',
						value: 'publish',
						description: 'Publish to one or more networks in a single call',
						action: 'Publish to social networks',
					},
					{
						name: 'Schedule',
						value: 'schedule',
						description: 'Queue a post for a later time',
						action: 'Schedule a post',
					},
					{
						name: 'Write a Post per Network',
						value: 'generate',
						description:
							'One prompt in, a native draft out for each network — right length, hashtags and format per platform. Does not publish.',
						action: 'Write a native post for each network',
					},
					{
						name: 'Write and Publish',
						value: 'generateAndPublish',
						description: 'Write a native draft per network, then publish them',
						action: 'Write and publish in one step',
					},
				],
				default: 'generateAndPublish',
			},

			{
				displayName: 'Networks',
				name: 'platforms',
				type: 'multiOptions',
				options: PLATFORMS.map((p) => ({ name: p.name, value: p.value })),
				default: ['x', 'linkedin'],
				required: true,
				description:
					'Connect these in the PostWire dashboard first. TikTok, Instagram and YouTube are one OAuth click — PostWire carries the platform approvals, so there is no app review on your side.',
				displayOptions: {
					show: { operation: ['generate', 'publish', 'generateAndPublish', 'schedule'] },
				},
			},

			{
				displayName: 'Idea',
				name: 'prompt',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				required: true,
				placeholder: 'We shipped scheduling today — one idea, a native post per network',
				description: 'What you want to say. More detail gives a better draft.',
				displayOptions: { show: { operation: ['generate', 'generateAndPublish'] } },
			},

			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				typeOptions: { rows: 3 },
				default: '',
				description: 'Posted exactly as written to every selected network',
				displayOptions: { show: { operation: ['publish', 'schedule'] } },
			},

			{
				displayName: 'Media URL',
				name: 'mediaUrl',
				type: 'string',
				default: '',
				placeholder: 'https://example.com/clip.mp4',
				description:
					'A direct link to an .mp4 or an image. TikTok and YouTube will not accept a post without a video, and Instagram needs a photo or a video. A Google Drive share link does not work — it returns a web page, not a file.',
				displayOptions: {
					show: { operation: ['generate', 'publish', 'generateAndPublish', 'schedule'] },
				},
			},

			{
				displayName: 'Publish At',
				name: 'runAt',
				type: 'dateTime',
				default: '',
				required: true,
				description:
					'When to publish. PostWire validates the post now, so a missing video is caught here rather than at 7am tomorrow.',
				displayOptions: { show: { operation: ['schedule'] } },
			},

			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add option',
				default: {},
				displayOptions: {
					show: { operation: ['generate', 'publish', 'generateAndPublish', 'schedule'] },
				},
				options: [
					{
						displayName: 'Media Type',
						name: 'mediaType',
						type: 'options',
						default: 'auto',
						options: [
							{ name: 'Detect From the URL', value: 'auto' },
							{ name: 'Video', value: 'video' },
							{ name: 'Image', value: 'image' },
						],
						description:
							'Only needed when the link has no file extension — a signed CDN URL or a share link. Detection reads the extension and, when there is none, follows what the chosen networks require.',
					},
					{
						displayName: 'Brand',
						name: 'brandId',
						type: 'string',
						default: '',
						description: 'Publish as a specific brand. Leave empty for your only brand.',
					},
					{
						displayName: 'Brand Voice',
						name: 'brandVoice',
						type: 'string',
						default: '',
						description:
							'A sentence describing how you want to sound, applied to every generated draft',
					},
					{
						displayName: 'Title (YouTube)',
						name: 'title',
						type: 'string',
						default: '',
						description: 'Overrides the generated YouTube title',
					},
					{
						displayName: 'Visibility',
						name: 'privacy',
						type: 'options',
						options: [
							{ name: 'Private', value: 'private' },
							{ name: 'Public', value: 'public' },
							{ name: 'Unlisted', value: 'unlisted' },
						],
						default: 'public',
						description: 'Used by TikTok and YouTube',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const out: INodeExecutionData[] = [];

		for (let i = 0; i < items.length; i++) {
			try {
				const operation = this.getNodeParameter('operation', i) as string;

				if (operation === 'me') {
					const me = (await this.helpers.httpRequestWithAuthentication.call(this, 'postWireApi', {
						method: 'GET',
						url: `${BASE}/api/me`,
						json: true,
					})) as IDataObject;
					out.push({ json: me, pairedItem: { item: i } });
					continue;
				}

				const platforms = this.getNodeParameter('platforms', i) as string[];
				const opts = this.getNodeParameter('options', i, {}) as IDataObject;
				const mediaUrl = ((this.getNodeParameter('mediaUrl', i, '') as string) || '').trim();

				if (!platforms?.length) {
					throw new NodeOperationError(this.getNode(), 'Pick at least one network.', {
						itemIndex: i,
					});
				}

				// Media rules, checked before the request so the message names the fix rather than the symptom.
				//
				// The classifier used to answer only video-or-photo, and called everything without a
				// known video extension a photo. A signed CDN link, one ending in #t=30, or a share URL
				// with no extension at all was therefore "a photo", and the check below then threw and
				// stopped the whole workflow — for a video that would have published perfectly well.
				// Three answers now, and an unknown one is never grounds for refusing to try: the
				// network is the thing that gets to decide, not a regular expression over a filename.
				const declared = (opts.mediaType as string) || 'auto';
				const kind: 'video' | 'image' | 'unknown' | 'none' = !mediaUrl
					? 'none'
					: declared === 'video' || declared === 'image'
						? declared
						: /\.(mp4|mov|webm|m3u8|avi|mkv|m4v)(\?|#|$)/i.test(mediaUrl)
							? 'video'
							: /\.(jpe?g|png|gif|webp|heic|heif|avif|bmp|tiff?)(\?|#|$)/i.test(mediaUrl)
								? 'image'
								: 'unknown';
				const blocked = platforms.filter((p) => {
					const need = needOf(p);
					if (!need) return false;
					if (need === 'video') return kind === 'image' || kind === 'none';
					return kind === 'none';
				});
				if (blocked.length) {
					const wantsVideo = blocked.some((p) => needOf(p) === 'video');
					throw new NodeOperationError(
						this.getNode(),
						`${blocked.join(' and ')} will not accept a post without ${
							wantsVideo ? 'a video' : 'an image or video'
						}. Set Media URL to a direct file link, or remove ${
							blocked.length > 1 ? 'those networks' : 'that network'
						} from the list.`,
						{ itemIndex: i },
					);
				}

				// An unrecognised link still has to go in one of the two fields the API has. Send it as the
				// one the chosen networks need — that is the only reading of it that can succeed.
				const treatAsVideo =
					kind === 'video' || (kind === 'unknown' && platforms.some((p) => needOf(p) === 'video'));
				const videoUrl = mediaUrl && treatAsVideo ? mediaUrl : undefined;
				const photoUrl = mediaUrl && !treatAsVideo ? mediaUrl : undefined;

				let perPlatform: IDataObject | undefined;
				if (operation === 'generate' || operation === 'generateAndPublish') {
					const prompt = this.getNodeParameter('prompt', i) as string;
					const gen = (await this.helpers.httpRequestWithAuthentication.call(this, 'postWireApi', {
						method: 'POST',
						url: `${BASE}/api/generate`,
						body: {
							prompt,
							platforms,
							media_url: mediaUrl || undefined,
							brand_voice: (opts.brandVoice as string) || undefined,
						},
						json: true,
					})) as IDataObject;
					perPlatform = gen.drafts as IDataObject;
					if (operation === 'generate') {
						out.push({ json: gen, pairedItem: { item: i } });
						continue;
					}
				}

				const body: IDataObject = {
					platforms,
					per_platform: perPlatform,
					text: perPlatform ? undefined : (this.getNodeParameter('text', i, '') as string),
					photo_url: photoUrl,
					video_url: videoUrl,
					title: (opts.title as string) || undefined,
					privacy: (opts.privacy as string) || undefined,
					brand_id: (opts.brandId as string) || undefined,
				};

				if (operation === 'schedule') {
					const runAt = this.getNodeParameter('runAt', i) as string;
					const scheduled = (await this.helpers.httpRequestWithAuthentication.call(
						this,
						'postWireApi',
						{
							method: 'POST',
							url: `${BASE}/api/schedule`,
							body: { ...body, run_at: runAt },
							json: true,
						},
					)) as IDataObject;
					out.push({ json: scheduled, pairedItem: { item: i } });
					continue;
				}

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'postWireApi',
					{
						method: 'POST',
						url: `${BASE}/api/post`,
						body,
						json: true,
					},
				)) as IDataObject;

				// One n8n item per network, so a Filter or IF node downstream can act on the failures
				// alone instead of unpacking an array by hand.
				const results = ((response.results as IDataObject[]) || [response]).filter(Boolean);
				for (const res of results) {
					out.push({ json: res, pairedItem: { item: i } });
				}

				// A 200 whose every network failed used to leave the node green with the error buried
				// in the output, so a scheduled flow could publish nothing for weeks and never say so.
				// If not one network went out, that is a failed execution.
				const failed = results.filter((res) => res?.ok === false);
				if (results.length && failed.length === results.length) {
					const why = failed
						.map((f) => `${(f.platform as string) || '?'}: ${f.error || f.code || 'failed'}`)
						.join('; ');
					const limited = failed.find((f) => f.code === 'brand_limit_reached' || f.upgrade_url);
					throw new NodeOperationError(
						this.getNode(),
						`PostWire published to none of the ${results.length} selected network(s). ${why}` +
							(limited?.upgrade_url ? ` — upgrade: ${limited.upgrade_url as string}` : ''),
						{ itemIndex: i },
					);
				}
			} catch (error) {
				if (this.continueOnFail()) {
					out.push({ json: { error: (error as Error).message }, pairedItem: { item: i } });
					continue;
				}
				// Our own checks already throw NodeOperationError with a message that names the fix;
				// re-wrapping those would bury it. Anything else is an HTTP failure, and n8n renders
				// a NodeApiError with the node's context instead of a bare fetch stack.
				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), (error as Error).message, { itemIndex: i });
				}
				throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex: i });
			}
		}

		return [out];
	}
}
