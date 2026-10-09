import type { INodeProperties } from 'n8n-workflow';
import { LEGACY_PLATFORMS, PLATFORMS } from './GenericFunctions';

// The parameters of node version 1 (package 0.1.0 – 0.2.4), unchanged, so that every workflow
// already built with the node keeps opening and running exactly as before. New workflows get
// version 2, which is organised by resource. Nothing here should be edited except to fix a bug.
const v1 = { '@version': [1] };

export const legacyProperties: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { ...v1 } },
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
		options: PLATFORMS.filter((p) => LEGACY_PLATFORMS.includes(p.value)).map((p) => ({ name: p.name, value: p.value })),
		default: ['x', 'linkedin'],
		required: true,
		description:
			'Connect these in the PostWire dashboard first. TikTok, Instagram and YouTube are one OAuth click — PostWire carries the platform approvals, so there is no app review on your side.',
		displayOptions: {
			show: { ...v1, operation: ['generate', 'publish', 'generateAndPublish', 'schedule'] },
		},
	},
	{
		displayName: 'Idea',
		name: 'prompt',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		required: true,
		placeholder: 'e.g. We shipped scheduling today',
		description: 'What you want to say. More detail gives a better draft.',
		displayOptions: { show: { ...v1, operation: ['generate', 'generateAndPublish'] } },
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 3 },
		default: '',
		description: 'Posted exactly as written to every selected network',
		displayOptions: { show: { ...v1, operation: ['publish', 'schedule'] } },
	},
	{
		displayName: 'Media URL',
		name: 'mediaUrl',
		type: 'string',
		default: '',
		placeholder: 'e.g. https://example.com/video.mp4',
		description:
			'A direct link to an .mp4 or an image. TikTok and YouTube will not accept a post without a video, and Instagram needs a photo or a video.',
		displayOptions: {
			show: { ...v1, operation: ['generate', 'publish', 'generateAndPublish', 'schedule'] },
		},
	},
	{
		displayName: 'Publish At',
		name: 'runAt',
		type: 'dateTime',
		default: '',
		required: true,
		description: 'When to publish. PostWire validates the post now.',
		displayOptions: { show: { ...v1, operation: ['schedule'] } },
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add option',
		default: {},
		displayOptions: {
			show: { ...v1, operation: ['generate', 'publish', 'generateAndPublish', 'schedule'] },
		},
		options: [
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
				description: 'A sentence describing how you want to sound, applied to every generated draft',
			},
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
				description: 'Only needed when the link has no file extension',
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
];
