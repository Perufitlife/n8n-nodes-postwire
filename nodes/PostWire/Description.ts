import type { INodeProperties } from 'n8n-workflow';
import { PLATFORMS } from './GenericFunctions';

const v2 = { '@version': [2] };

const networkOptions = PLATFORMS.map((p) => ({ name: p.name, value: p.value }));
const textNetworkOptions = PLATFORMS.filter((p) => !p.mediaNeed).map((p) => ({
	name: p.name,
	value: p.value,
}));

const brandLocator = (name: string, displayName: string, description: string): INodeProperties => ({
	displayName,
	name,
	type: 'resourceLocator',
	default: { mode: 'list', value: '' },
	description,
	modes: [
		{
			displayName: 'From List',
			name: 'list',
			type: 'list',
			typeOptions: { searchListMethod: 'searchBrands', searchable: true },
		},
		{
			displayName: 'By ID',
			name: 'id',
			type: 'string',
			placeholder: 'e.g. 3f1c2a9e-8b7d-4c2e-9a51-0d6f2b7c1e44',
		},
	],
});

export const resourceProperty: INodeProperties = {
	displayName: 'Resource',
	name: 'resource',
	type: 'options',
	noDataExpression: true,
	displayOptions: { show: { ...v2 } },
	options: [
		{ name: 'Account', value: 'account' },
		{ name: 'Brand', value: 'brand' },
		{ name: 'Connection', value: 'connection' },
		{ name: 'Media', value: 'media' },
		{ name: 'Post', value: 'post' },
		{ name: 'Scheduled Post', value: 'scheduledPost' },
	],
	default: 'post',
};

export const operationProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { ...v2, resource: ['post'] } },
		options: [
			{
				name: 'Get Status',
				value: 'getStatus',
				description: 'Check whether a TikTok or YouTube video has finished processing',
				action: 'Get status of post',
			},
			{
				name: 'Plan Week',
				value: 'planWeek',
				description:
					'One topic in, up to five days of different native posts out, already scheduled one per day',
				action: 'Plan week of posts',
			},
			{
				name: 'Publish',
				value: 'publish',
				description:
					'Publish a post now to one or more networks — with Smart Distribute, each network gets its own native version',
				action: 'Publish post',
			},
			{
				name: 'Schedule',
				value: 'schedule',
				description: 'Queue a post for later; it is checked now, so a missing video shows up while you watch',
				action: 'Schedule post',
			},
			{
				name: 'Write Drafts',
				value: 'generate',
				description: 'Preview: write a native post draft for each network without publishing anything',
				action: 'Write post drafts',
			},
		],
		default: 'publish',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { ...v2, resource: ['scheduledPost'] } },
		options: [
			{
				name: 'Cancel',
				value: 'delete',
				description: 'Cancel a queued post so it is never published',
				action: 'Cancel scheduled post',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Retrieve the posts in your queue, with their status',
				action: 'Get many scheduled posts',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Move a queued post to another time or rename it',
				action: 'Update scheduled post',
			},
		],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { ...v2, resource: ['brand'] } },
		options: [
			{ name: 'Create', value: 'create', description: 'Create a new brand', action: 'Create brand' },
			{
				name: 'Delete',
				value: 'delete',
				description: 'Delete a brand and disconnect its accounts',
				action: 'Delete brand',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Retrieve a list of brands with their connected networks',
				action: 'Get many brands',
			},
			{ name: 'Rename', value: 'update', description: 'Rename a brand', action: 'Rename brand' },
		],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { ...v2, resource: ['connection'] } },
		options: [
			{
				name: 'Check Health',
				value: 'checkHealth',
				description: 'Ask the network whether a connected account can still publish',
				action: 'Check connection health',
			},
			{
				name: 'Create Connect Link',
				value: 'createConnectLink',
				description:
					'A one-hour link you can send to a client so they connect their own account to your PostWire',
				action: 'Create connect link',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Retrieve a list of connected social accounts',
				action: 'Get many connections',
			},
		],
		default: 'getAll',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { ...v2, resource: ['account'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Retrieve plan, posts used this month and connected accounts',
				action: 'Get account',
			},
		],
		default: 'get',
	},
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { ...v2, resource: ['media'] } },
		options: [
			{
				name: 'Upload',
				value: 'upload',
				description: 'Host a binary file from a previous node and get a public URL the networks can download',
				action: 'Upload media',
			},
		],
		default: 'upload',
	},
];

const postOps = { ...v2, resource: ['post'] };

export const postProperties: INodeProperties[] = [
	{
		displayName: 'Networks',
		name: 'platforms',
		type: 'multiOptions',
		options: networkOptions,
		default: [],
		required: true,
		description:
			'Where to post. Connect them in the PostWire dashboard first — TikTok, Instagram and YouTube are one OAuth click, because PostWire already holds the platform approvals. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: { ...postOps, operation: ['publish', 'schedule', 'generate'] } },
	},
	{
		displayName: 'Networks',
		name: 'platforms',
		type: 'multiOptions',
		options: textNetworkOptions,
		default: [],
		required: true,
		description:
			'Text networks only: a week plan is written without video, which TikTok, Instagram and YouTube require. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: { ...postOps, operation: ['planWeek'] } },
	},
	{
		displayName: 'Content',
		name: 'contentMode',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Drafts From a Previous Step',
				value: 'drafts',
				description: 'Publish drafts you already wrote or approved, e.g. the output of Write Drafts',
			},
			{
				name: 'Same Text on Every Network',
				value: 'text',
				description: 'One text for all; it is shortened automatically where a network has a lower limit',
			},
			{
				name: 'Smart Distribute: Write a Native Post per Network',
				value: 'smart',
				description:
					'Give one idea; PostWire writes a different post for each network — length, hook, hashtags, YouTube title and tags',
			},
		],
		default: 'smart',
		displayOptions: { show: { ...postOps, operation: ['publish', 'schedule'] } },
	},
	{
		displayName: 'Idea',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		placeholder: 'e.g. We cut onboarding from 3 days to 20 minutes — here is how',
		description:
			'What you want to say, in your own words. Facts, numbers and a link make better posts than adjectives.',
		displayOptions: {
			show: { ...postOps, operation: ['generate'] },
		},
	},
	{
		displayName: 'Idea',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		placeholder: 'e.g. We cut onboarding from 3 days to 20 minutes — here is how',
		description:
			'What you want to say, in your own words. Facts, numbers and a link make better posts than adjectives.',
		displayOptions: {
			show: { ...postOps, operation: ['publish', 'schedule'], contentMode: ['smart'] },
		},
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		default: '',
		required: true,
		description: 'Posted as written to every selected network',
		displayOptions: {
			show: { ...postOps, operation: ['publish', 'schedule'], contentMode: ['text'] },
		},
	},
	{
		displayName: 'Drafts',
		name: 'drafts',
		type: 'json',
		default: '={{ $json.drafts }}',
		required: true,
		description:
			'An object with one entry per network: { "linkedin": { "text": "…" }, "youtube": { "text": "…", "title": "…" } }. The output of Write Drafts fits as is.',
		displayOptions: {
			show: { ...postOps, operation: ['publish', 'schedule'], contentMode: ['drafts'] },
		},
	},
	{
		displayName: 'Topic',
		name: 'topic',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		required: true,
		placeholder: 'e.g. How we price custom furniture for first-time buyers',
		description:
			'One subject. Each day gets a different angle: a lesson, a common mistake, a number, a question, behind the scenes.',
		displayOptions: { show: { ...postOps, operation: ['planWeek'] } },
	},
	{
		displayName: 'Days',
		name: 'days',
		type: 'number',
		typeOptions: { minValue: 1, maxValue: 5 },
		default: 5,
		description: 'How many days to fill, starting tomorrow (up to 5)',
		displayOptions: { show: { ...postOps, operation: ['planWeek'] } },
	},
	{
		displayName: 'Hour',
		name: 'hour',
		type: 'number',
		typeOptions: { minValue: 0, maxValue: 23 },
		default: 10,
		description: "Hour of the day each post goes out, in the workflow's time zone (Settings → Timezone)",
		displayOptions: { show: { ...postOps, operation: ['planWeek'] } },
	},
	{
		displayName: 'Media',
		name: 'mediaSource',
		type: 'options',
		noDataExpression: true,
		options: [
			{
				name: 'Binary File',
				value: 'binary',
				description:
					'A file from a previous node (Google Drive, HTTP Request, Read File…). PostWire hosts it for you.',
			},
			{ name: 'None', value: 'none', description: 'Text only — fine for X, LinkedIn, Bluesky, Threads-style networks' },
			{ name: 'URL', value: 'url', description: 'A public https link straight to the .mp4 or image file' },
		],
		default: 'none',
		description: 'TikTok and YouTube only publish video; Instagram needs a photo or a video',
		displayOptions: { show: { ...postOps, operation: ['publish', 'schedule', 'generate'] } },
	},
	{
		displayName: 'Media URL',
		name: 'mediaUrl',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. https://example.com/video.mp4',
		description:
			'A direct link to the file, reachable without a login. A Google Drive or Dropbox share link opens a web page and will not work — use Binary File instead.',
		displayOptions: {
			show: { ...postOps, operation: ['publish', 'schedule', 'generate'], mediaSource: ['url'] },
		},
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		hint: 'The name of the input binary field containing the video or image',
		description: 'Up to 50 MB through n8n. For bigger videos, use a public URL (up to 1 GB).',
		displayOptions: {
			show: { ...postOps, operation: ['publish', 'schedule', 'generate'], mediaSource: ['binary'] },
		},
	},
	{
		displayName: 'Publish At',
		name: 'runAt',
		type: 'dateTime',
		default: '',
		required: true,
		description: 'When to publish (up to 365 days ahead). Connections and media are checked now.',
		displayOptions: { show: { ...postOps, operation: ['schedule'] } },
	},
	{
		displayName: 'Network',
		name: 'statusPlatform',
		type: 'options',
		options: [
			{ name: 'TikTok', value: 'tiktok' },
			{ name: 'YouTube', value: 'youtube' },
		],
		default: 'tiktok',
		description: 'Networks that process video after upload and report when it is live',
		displayOptions: { show: { ...postOps, operation: ['getStatus'] } },
	},
	{
		displayName: 'Post ID',
		name: 'postId',
		type: 'string',
		default: '={{ $json.id }}',
		required: true,
		description: "The 'ID' a Publish step returned for that network",
		displayOptions: { show: { ...postOps, operation: ['getStatus'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: { show: { ...postOps, operation: ['publish', 'schedule', 'generate', 'planWeek'] } },
		options: [
			{
				...brandLocator('brand', 'Brand', 'Publish as this brand. Leave empty to use your first brand.'),
				displayOptions: { show: { '/operation': ['publish', 'schedule'] } },
			},
			{
				displayName: 'Brand Voice',
				name: 'brandVoice',
				type: 'string',
				typeOptions: { rows: 2 },
				default: '',
				placeholder: 'e.g. Plain-spoken, a little dry, never uses exclamation marks',
				description: 'How you want to sound; applied to every draft PostWire writes',
			},
			{
				displayName: 'Dry Run',
				name: 'dryRun',
				type: 'boolean',
				default: false,
				description:
					'Whether to check connections, media and length and return exactly what would be published — without publishing anything',
				displayOptions: { show: { '/operation': ['publish'] } },
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				placeholder: 'e.g. {{ $json.guid }}',
				description:
					'Any unique value for this post (an RSS guid, a row ID). PostWire refuses a second post with the same key for 24 hours, so a retry never double-posts. With Smart Distribute one is set automatically per execution.',
				displayOptions: { show: { '/operation': ['publish'] } },
			},
			{
				displayName: 'Label',
				name: 'label',
				type: 'string',
				default: '',
				description: 'A name for this post in the PostWire calendar',
				displayOptions: { show: { '/operation': ['schedule'] } },
			},
			{
				displayName: 'Media Type',
				name: 'mediaType',
				type: 'options',
				default: 'auto',
				options: [
					{ name: 'Detect Automatically', value: 'auto' },
					{ name: 'Image', value: 'image' },
					{ name: 'Video', value: 'video' },
				],
				description:
					'Only needed for a URL with no file extension, such as a signed CDN link. Detection reads the extension, then the file type.',
			},
			{
				displayName: 'Skip Media Check',
				name: 'skipMediaCheck',
				type: 'boolean',
				default: false,
				description:
					'Whether to skip checking that the media URL is public, is a file and not a page, and is under 1 GB before sending it',
			},
			{
				displayName: 'Subreddit',
				name: 'subreddit',
				type: 'string',
				default: '',
				placeholder: 'e.g. SideProject',
				description: 'Reddit only: the community to post in, without r/',
			},
			{
				displayName: 'Timezone',
				name: 'timezone',
				type: 'string',
				default: '',
				placeholder: 'e.g. America/Lima',
				description: "IANA time zone for 'Hour'. Leave empty to use the workflow's time zone.",
				displayOptions: { show: { '/operation': ['planWeek'] } },
			},
			{
				displayName: 'Title (YouTube)',
				name: 'title',
				type: 'string',
				default: '',
				description: 'Overrides the YouTube title PostWire writes',
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
				description: 'Used by TikTok and YouTube. Unlisted is YouTube only.',
			},
		],
	},
];

const schedOps = { ...v2, resource: ['scheduledPost'] };

export const scheduledPostProperties: INodeProperties[] = [
	{
		displayName: 'Scheduled Post ID',
		name: 'scheduledPostId',
		type: 'string',
		default: '',
		required: true,
		description: "The 'ID' returned by Schedule or Get Many",
		displayOptions: { show: { ...schedOps, operation: ['update', 'delete'] } },
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add field',
		default: {},
		displayOptions: { show: { ...schedOps, operation: ['update'] } },
		options: [
			{ displayName: 'Label', name: 'label', type: 'string', default: '' },
			{
				displayName: 'Publish At',
				name: 'runAt',
				type: 'dateTime',
				default: '',
				description: 'The new time. Only a post that is still queued can be moved.',
			},
		],
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { ...schedOps, operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { ...schedOps, operation: ['getAll'], returnAll: [false] } },
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add filter',
		default: {},
		displayOptions: { show: { ...schedOps, operation: ['getAll'] } },
		options: [
			{ displayName: 'From', name: 'from', type: 'dateTime', default: '', description: 'Only posts due after this time' },
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Canceled', value: 'canceled' },
					{ name: 'Done', value: 'done' },
					{ name: 'Failed', value: 'failed' },
					{ name: 'Queued', value: 'queued' },
				],
				default: 'queued',
			},
			{ displayName: 'To', name: 'to', type: 'dateTime', default: '', description: 'Only posts due before this time' },
		],
	},
];

const brandOps = { ...v2, resource: ['brand'] };

export const brandProperties: INodeProperties[] = [
	{
		displayName: 'Name',
		name: 'name',
		type: 'string',
		default: '',
		required: true,
		placeholder: 'e.g. Acme Bakery',
		description: 'The business or client this brand represents',
		displayOptions: { show: { ...brandOps, operation: ['create', 'update'] } },
	},
	{
		...brandLocator('brand', 'Brand', 'The brand to change'),
		required: true,
		displayOptions: { show: { ...brandOps, operation: ['update', 'delete'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { ...brandOps, operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { ...brandOps, operation: ['getAll'], returnAll: [false] } },
	},
];

const connOps = { ...v2, resource: ['connection'] };

export const connectionProperties: INodeProperties[] = [
	{
		displayName: 'Network',
		name: 'platform',
		type: 'options',
		options: networkOptions,
		default: 'tiktok',
		required: true,
		displayOptions: { show: { ...connOps, operation: ['checkHealth'] } },
	},
	{
		displayName: 'Network',
		name: 'platform',
		type: 'options',
		options: [{ name: 'Any Network', value: '' }, ...networkOptions],
		default: '',
		description: 'Lock the link to one network, or let the client choose',
		displayOptions: { show: { ...connOps, operation: ['createConnectLink'] } },
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: true,
		description: 'Whether to return all results or only up to a given limit',
		displayOptions: { show: { ...connOps, operation: ['getAll'] } },
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		typeOptions: { minValue: 1 },
		default: 50,
		description: 'Max number of results to return',
		displayOptions: { show: { ...connOps, operation: ['getAll'], returnAll: [false] } },
	},
];

export const accountProperties: INodeProperties[] = [
	{
		displayName: 'Simplify',
		name: 'simplify',
		type: 'boolean',
		default: true,
		description: 'Whether to return a simplified version of the response instead of the raw data',
		displayOptions: { show: { ...v2, resource: ['account'], operation: ['get'] } },
	},
];

export const mediaProperties: INodeProperties[] = [
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		default: 'data',
		required: true,
		hint: 'The name of the input binary field containing the video or image',
		description: 'JPEG, PNG, WebP, GIF, MP4, MOV or WebM, up to 50 MB. Hosted for 30 days.',
		displayOptions: { show: { ...v2, resource: ['media'], operation: ['upload'] } },
	},
];
