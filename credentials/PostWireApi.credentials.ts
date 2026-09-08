import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	Icon,
	INodeProperties,
} from 'n8n-workflow';

// PostWire authenticates with a single bearer key. The `test` block below is what makes n8n's
// "Test connection" button meaningful: /api/me returns the plan, the month's usage and the
// connected accounts, so a wrong key fails immediately instead of at publish time.
export class PostWireApi implements ICredentialType {
	name = 'postWireApi';

	displayName = 'PostWire API';

	// Both variants: the badge is a dark square, which disappears against n8n's dark theme.
	icon: Icon = { light: 'file:postwire.svg', dark: 'file:postwire.dark.svg' };

	documentationUrl = 'https://postwire.io/n8n-social-media-automation/';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			placeholder: 'pw_live_...',
			description:
				'Your PostWire API key. Get one free at https://postwire.io/dashboard.html — the free plan covers one brand, every network it connects, and 30 posts a month, with no card.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
				// Read server-side to tell n8n traffic apart from the dashboard. npm download counts
				// turned out to be a scanner floor, so this header is the only honest usage signal.
				'X-PostWire-Source': 'n8n',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://postwire.io',
			url: '/api/me',
			method: 'GET',
		},
	};
}
