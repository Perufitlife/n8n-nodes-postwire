import type { ICredentialType, Icon, INodeProperties } from 'n8n-workflow';

// The one-button connection: "Connect my account" opens PostWire's own sign-in and consent page and n8n keeps the
// token, so nobody copies an API key. PostWire registers this client itself (client_id postwire-n8n, public, PKCE,
// no secret) and accepts n8n's OAuth callback on any n8n — cloud or self-hosted — and shows its address on the
// consent page. The token only works on the REST API this node calls; access lasts an hour and n8n refreshes it.
export class PostWireOAuth2Api implements ICredentialType {
	name = 'postWireOAuth2Api';

	extends = ['oAuth2Api'];

	displayName = 'PostWire OAuth2 API';

	icon: Icon = { light: 'file:postwire.svg', dark: 'file:postwire.dark.svg' };

	documentationUrl = 'https://postwire.io/n8n-social-media-automation/';

	properties: INodeProperties[] = [
		{ displayName: 'Grant Type', name: 'grantType', type: 'hidden', default: 'pkce' },
		{ displayName: 'Authorization URL', name: 'authUrl', type: 'hidden', default: 'https://postwire.io/oauth/authorize' },
		{ displayName: 'Access Token URL', name: 'accessTokenUrl', type: 'hidden', default: 'https://postwire.io/oauth/token' },
		{ displayName: 'Client ID', name: 'clientId', type: 'hidden', default: 'postwire-n8n' },
		{ displayName: 'Client Secret', name: 'clientSecret', type: 'hidden', typeOptions: { password: true }, default: '' },
		{ displayName: 'Scope', name: 'scope', type: 'hidden', default: 'posts:read posts:write' },
		{ displayName: 'Auth URI Query Parameters', name: 'authQueryParameters', type: 'hidden', default: '' },
		{ displayName: 'Authentication', name: 'authentication', type: 'hidden', default: 'body' },
	];
}
