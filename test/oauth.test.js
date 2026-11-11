// The one-button connection (0.5.0): the Authentication parameter picks the credential, API Key stays the default so
// saved workflows are untouched, every request carries the source header, and on the OAuth2 credential a 401 is sent
// once more letting it fail so n8n refreshes the hour-long token. Run against dist/ (`npm run build` first).
const test = require('node:test');
const assert = require('node:assert/strict');
const { ctx, ok } = require('./_ctx');
const { PostWire } = require('../dist/nodes/PostWire/PostWire.node.js');
const { PostWireTrigger } = require('../dist/nodes/PostWireTrigger/PostWireTrigger.node.js');
const { PostWireOAuth2Api } = require('../dist/credentials/PostWireOAuth2Api.credentials.js');
const run = (c) => new PostWire().execute.call(c);
const ME = { resource: 'account', operation: 'get', simplify: true };

test('API Key stays the default: a saved workflow without the parameter uses postWireApi', async () => {
	const c = ctx({ params: ME, answer: () => ok({ email: 'a@b.c', plan: 'free', usage: {} }) });
	await run(c);
	assert.equal(c.calls[0].authed, 'postWireApi');
	assert.equal(c.calls[0].headers['X-PostWire-Source'], 'n8n');
});

test('Connect Account uses the OAuth2 credential and still sends the source header', async () => {
	const c = ctx({ params: { ...ME, authentication: 'oAuth2' }, answer: () => ok({ email: 'a@b.c', plan: 'free', usage: {} }) });
	const [out] = await run(c);
	assert.equal(c.calls[0].authed, 'postWireOAuth2Api');
	assert.equal(c.calls[0].headers['X-PostWire-Source'], 'n8n');
	assert.equal(out[0].json.email, 'a@b.c');
});

test('OAuth2: a 401 is resent letting it fail, so n8n refreshes; the second answer wins', async () => {
	const c = ctx({
		params: { ...ME, authentication: 'oAuth2' },
		answer: (o, n) => (n === 1 ? { statusCode: 401, body: { error: 'access token expired' } } : ok({ email: 'a@b.c', plan: 'free', usage: {} })),
	});
	const [out] = await run(c);
	assert.equal(c.calls.length, 2);
	assert.equal(c.calls[1].ignoreHttpStatusErrors, false);
	assert.equal(out[0].json.email, 'a@b.c');
});

test('OAuth2: when the retry fails too, its own error reaches the user', async () => {
	const c = ctx({ params: { ...ME, authentication: 'oAuth2' }, answer: () => ({ statusCode: 401, body: { error: 'x' } }) });
	c.helpers.httpRequestWithAuthentication = async (cred, opts) => {
		c.calls.push({ ...opts, authed: cred });
		if (opts.ignoreHttpStatusErrors === false) throw Object.assign(new Error('403'), { response: { status: 403, data: { error: 'no access to this workspace' } } });
		return { statusCode: 401, body: { error: 'access token expired' } };
	};
	await assert.rejects(run(c), (e) => String(e.httpCode) === '403');
	assert.equal(c.calls.length, 2);
});

test('API Key: a 401 is NOT resent (a wrong key stays one request)', async () => {
	const c = ctx({ params: ME, answer: () => ({ statusCode: 401, body: { error: 'invalid API key' } }) });
	await assert.rejects(run(c));
	assert.equal(c.calls.length, 1);
});

test('both nodes offer the choice and show the matching credential only', () => {
	for (const N of [PostWire, PostWireTrigger]) {
		const d = new N().description;
		const auth = d.properties.find((p) => p.name === 'authentication');
		assert.equal(auth.default, 'apiKey');
		assert.deepEqual(auth.options.map((o) => o.value), ['apiKey', 'oAuth2']);
		assert.deepEqual(d.credentials.map((x) => [x.name, x.displayOptions.show.authentication[0]]), [['postWireApi', 'apiKey'], ['postWireOAuth2Api', 'oAuth2']]);
	}
});

test('the OAuth2 credential is PostWire\'s public PKCE client', () => {
	const cred = new PostWireOAuth2Api();
	const v = Object.fromEntries(cred.properties.map((p) => [p.name, p.default]));
	assert.deepEqual(cred.extends, ['oAuth2Api']);
	assert.equal(v.grantType, 'pkce');
	assert.equal(v.clientId, 'postwire-n8n');
	assert.equal(v.clientSecret, '');
	assert.equal(v.authUrl, 'https://postwire.io/oauth/authorize');
	assert.equal(v.accessTokenUrl, 'https://postwire.io/oauth/token');
	assert.equal(v.scope, 'posts:read posts:write');
	assert.ok(cred.properties.every((p) => p.type === 'hidden'), 'nothing to fill in: only the Connect button');
});
