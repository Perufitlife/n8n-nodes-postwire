// PostWire Trigger: the webhook lifecycle (create / checkExists / delete) against a mocked PostWire API that keeps
// endpoints in memory the way /api/webhooks does, and the signature check on every delivery. No network.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { NodeOperationError, NodeApiError } = require('n8n-workflow');
const { PostWireTrigger } = require('../dist/nodes/PostWireTrigger/PostWireTrigger.node.js');
const W = require('../dist/nodes/PostWireTrigger/WebhookFunctions.js');

const URL_PROD = 'https://n8n.example.com/webhook/0b9c5e7e-1111-4222-8333-444455556666/webhook';

// The signature exactly as PostWire's server makes it (src/webhooks.js sign()), written out independently here so a
// change on either side that breaks verification fails this test.
const serverSign = (secret, body, t) => `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${body}`).digest('hex')}`;

// A PostWire API double: GET/POST /api/webhooks, DELETE /api/webhooks/:id, with the 5-endpoint cap and the https rule.
function fakeApi({ existing = [], failDelete = null } = {}) {
	const hooks = existing.map((h) => ({ active: true, ...h }));
	const calls = [];
	let n = 0;
	const handle = (opts) => {
		calls.push({ method: opts.method, url: opts.url, body: opts.body });
		const path = opts.url.replace('https://postwire.io', '');
		if (opts.method === 'GET' && path === '/api/webhooks')
			return { statusCode: 200, body: { webhooks: hooks.map((h) => ({ ...h })), events: W.EVENTS.map((e) => e.value), max: 5 } };
		if (opts.method === 'POST' && path === '/api/webhooks') {
			if (!/^https:/.test(opts.body.url)) return { statusCode: 400, body: { error: 'url must use https', code: 'bad_url' } };
			if (hooks.length >= 5) return { statusCode: 400, body: { error: 'an account can have 5 webhook endpoints; delete one first', code: 'too_many' } };
			const h = { id: `wh-${++n}`, url: opts.body.url, events: opts.body.events, description: opts.body.description, active: true };
			hooks.push(h);
			return { statusCode: 201, body: { webhook: h, secret: `whsec_test_${n}`, message: 'Keep this secret' } };
		}
		const del = /^\/api\/webhooks\/([^/]+)$/.exec(path);
		if (opts.method === 'DELETE' && del) {
			if (failDelete) return failDelete;
			const at = hooks.findIndex((h) => h.id === decodeURIComponent(del[1]));
			if (at < 0) return { statusCode: 404, body: { error: 'webhook not found', code: 'not_found' } };
			hooks.splice(at, 1);
			return { statusCode: 200, body: { ok: true } };
		}
		return { statusCode: 404, body: { error: 'unknown', code: 'unknown_endpoint' } };
	};
	return { hooks, calls, handle };
}

function hookCtx({ api, url = URL_PROD, events = ['post.published', 'post.failed'], staticData = {}, warnings = [] }) {
	const node = { name: 'PostWire Trigger', typeVersion: 1, type: 'n8n-nodes-postwire.postWireTrigger', parameters: { events } };
	return {
		staticData,
		getNode: () => node,
		getNodeParameter: (name, fallback) => (name === 'events' ? events : fallback),
		getNodeWebhookUrl: () => url,
		getWorkflowStaticData: () => staticData,
		getWorkflow: () => ({ id: 'wf1', name: 'Alert on failed posts', active: true }),
		logger: { warn: (m) => warnings.push(m), info() {}, debug() {}, error() {} },
		helpers: { httpRequestWithAuthentication: async (cred, opts) => { assert.equal(cred, 'postWireApi'); return api.handle(opts); } },
	};
}
const lifecycle = () => new PostWireTrigger().webhookMethods.default;

test('activation registers a signed webhook for the selected events and keeps its secret', async () => {
	const api = fakeApi();
	const c = hookCtx({ api, events: ['post.failed', 'approval.requested'] });
	assert.equal(await lifecycle().checkExists.call(c), false);
	assert.equal(await lifecycle().create.call(c), true);
	const post = api.calls.find((k) => k.method === 'POST');
	assert.deepEqual(post.body, { url: URL_PROD, events: ['post.failed', 'approval.requested'], description: 'n8n: Alert on failed posts' });
	assert.deepEqual(c.staticData, { webhookId: 'wh-1', secret: 'whsec_test_1', events: ['post.failed', 'approval.requested'] });
	assert.equal(await lifecycle().checkExists.call(c), true);
});

test('a leftover endpoint for the same URL (secret lost) is removed before the new one is added', async () => {
	const api = fakeApi({ existing: [{ id: 'old', url: URL_PROD, events: ['post.failed'] }, { id: 'other', url: 'https://elsewhere.example/x', events: ['post.failed'] }] });
	const c = hookCtx({ api });
	await lifecycle().create.call(c);
	assert.deepEqual(api.hooks.map((h) => h.id).sort(), ['other', 'wh-1']);
});

test('checkExists says no when the endpoint was deleted in PostWire, points elsewhere or listens to other events', async () => {
	const api = fakeApi();
	const c = hookCtx({ api });
	await lifecycle().create.call(c);
	api.hooks[0].events = ['post.published'];
	assert.equal(await lifecycle().checkExists.call(c), false, 'events changed in the node');
	assert.deepEqual(c.staticData, {});
	await lifecycle().create.call(c);
	api.hooks.length = 0;
	assert.equal(await lifecycle().checkExists.call(c), false, 'deleted in the dashboard');
	await lifecycle().create.call(c);
	api.hooks[0].active = false;
	assert.equal(await lifecycle().checkExists.call(c), false, 'switched off');
});

test('deactivation deletes the endpoint and forgets the secret', async () => {
	const api = fakeApi();
	const c = hookCtx({ api });
	await lifecycle().create.call(c);
	assert.equal(await lifecycle().delete.call(c), true);
	assert.equal(api.hooks.length, 0);
	assert.deepEqual(c.staticData, {});
	assert.ok(api.calls.some((k) => k.method === 'DELETE' && k.url.endsWith('/api/webhooks/wh-1')));
});

test('deactivation after the endpoint was already deleted in PostWire still succeeds', async () => {
	const api = fakeApi();
	const c = hookCtx({ api, staticData: { webhookId: 'gone', secret: 's', events: [] } });
	assert.equal(await lifecycle().delete.call(c), true);
	assert.deepEqual(c.staticData, {});
});

test('a failed delete is reported and the id kept, so the next deactivation retries', async () => {
	const warnings = [];
	const api = fakeApi({ failDelete: { statusCode: 500, body: { error: 'db down' } } });
	const c = hookCtx({ api, warnings, staticData: { webhookId: 'wh-9', secret: 's', events: [] } });
	assert.equal(await lifecycle().delete.call(c), false);
	assert.equal(c.staticData.webhookId, 'wh-9');
	assert.match(warnings[0], /could not delete webhook wh-9/);
});

test('a local or http n8n URL is refused before any request, naming WEBHOOK_URL', async () => {
	for (const url of ['http://localhost:5678/webhook/x/webhook', 'https://localhost:5678/webhook/x/webhook', 'https://192.168.1.20/webhook/x', 'http://n8n.example.com/webhook/x']) {
		const api = fakeApi();
		const c = hookCtx({ api, url });
		await assert.rejects(lifecycle().create.call(c), (e) => e instanceof NodeOperationError && /WEBHOOK_URL/.test(e.description), url);
		assert.equal(api.calls.length, 0, url);
	}
});

test('the 6th endpoint is refused with what to do', async () => {
	const api = fakeApi({ existing: [1, 2, 3, 4, 5].map((i) => ({ id: `h${i}`, url: `https://x.example/${i}`, events: ['post.failed'] })) });
	const c = hookCtx({ api });
	await assert.rejects(lifecycle().create.call(c), (e) => e instanceof NodeApiError && /5 webhook endpoints/.test(e.message) && /Delete an endpoint/.test(e.description));
	assert.deepEqual(c.staticData, {});
});

// ---- deliveries ----
function webhookCtx({ secret = 'whsec_test_1', events = ['post.published', 'post.failed'], options = {}, body, raw, headers }) {
	const rawBody = raw ?? Buffer.from(JSON.stringify(body), 'utf8');
	const res = { code: null, sent: null, status(c) { this.code = c; return this; }, json(b) { this.sent = b; return this; } };
	return {
		res,
		getRequestObject: () => ({ rawBody, body }),
		getResponseObject: () => res,
		getHeaderData: () => headers,
		getBodyData: () => body,
		getWorkflowStaticData: () => ({ webhookId: 'wh-1', secret, events }),
		getNodeParameter: (name, fallback) => (name === 'events' ? events : name === 'options' ? options : fallback),
		helpers: { returnJsonArray: (items) => items.map((json) => ({ json })) },
	};
}
const event = (type, data) => ({ id: 'evt_1', type, created_at: '2026-10-05T12:00:00.000Z', data });
const deliver = (c) => new PostWireTrigger().webhook.call(c);
const signedHeaders = (secret, body, { t = Math.floor(Date.now() / 1000), type = body.type } = {}) => ({
	'postwire-signature': serverSign(secret, JSON.stringify(body), t), 'postwire-event': type, 'postwire-delivery': 'del-1', 'content-type': 'application/json',
});

test('a correctly signed delivery starts the workflow with the event and its delivery id', async () => {
	const body = event('post.failed', { platform: 'linkedin', error: 'expired', code: null, brand_id: 'b1' });
	const c = webhookCtx({ body, headers: signedHeaders('whsec_test_1', body) });
	const out = await deliver(c);
	assert.deepEqual(out.workflowData[0][0].json, { ...body, delivery_id: 'del-1' });
	assert.equal(c.res.code, null);
});

test('a wrong secret, a changed body, an old timestamp or no header is answered 401 and starts nothing', async () => {
	const body = event('post.published', { platform: 'bluesky' });
	const cases = {
		'wrong secret': { headers: signedHeaders('whsec_other', body) },
		'changed body': { headers: signedHeaders('whsec_test_1', body), raw: Buffer.from(JSON.stringify({ ...body, id: 'evt_2' })) },
		'old timestamp': { headers: signedHeaders('whsec_test_1', body, { t: Math.floor(Date.now() / 1000) - 600 }) },
		'no header': { headers: { 'postwire-event': 'post.published' } },
		'malformed header': { headers: { 'postwire-signature': 'v1=abc' } },
	};
	for (const [name, k] of Object.entries(cases)) {
		const c = webhookCtx({ body, ...k });
		const out = await deliver(c);
		assert.deepEqual(out, { noWebhookResponse: true }, name);
		assert.equal(c.res.code, 401, name);
		assert.match(c.res.sent.error, /signature check failed/, name);
	}
});

test('without a stored secret (never activated) every delivery is refused', async () => {
	const body = event('post.published', { platform: 'bluesky' });
	const c = webhookCtx({ body, secret: '', headers: signedHeaders('', body) });
	assert.deepEqual(await deliver(c), { noWebhookResponse: true });
	assert.match(c.res.sent.error, /no signing secret/);
});

test('an event the node did not select is acknowledged without starting the workflow; webhook.test always passes', async () => {
	const other = event('connection.reauth_required', { platform: 'linkedin' });
	assert.deepEqual(await deliver(webhookCtx({ body: other, headers: signedHeaders('whsec_test_1', other) })), {});
	const t = event('webhook.test', { message: 'Test delivery' });
	const out = await deliver(webhookCtx({ body: t, headers: signedHeaders('whsec_test_1', t), options: { networks: ['tiktok'] } }));
	assert.equal(out.workflowData[0][0].json.type, 'webhook.test');
});

test('network and brand filters: post events by platform, approval events by their list of networks', async () => {
	const opts = { networks: ['linkedin'], brandId: 'b1' };
	const ev = ['approval.requested', 'post.published'];
	const tiktok = event('post.published', { platform: 'tiktok', brand_id: 'b1' });
	assert.deepEqual(await deliver(webhookCtx({ events: ev, options: opts, body: tiktok, headers: signedHeaders('whsec_test_1', tiktok) })), {});
	const otherBrand = event('post.published', { platform: 'linkedin', account: { brand_id: 'b2' } });
	assert.deepEqual(await deliver(webhookCtx({ events: ev, options: opts, body: otherBrand, headers: signedHeaders('whsec_test_1', otherBrand) })), {});
	const apr = event('approval.requested', { approval_id: 'a1', platforms: ['x', 'linkedin'], brand_id: 'b1' });
	const out = await deliver(webhookCtx({ events: ev, options: opts, body: apr, headers: signedHeaders('whsec_test_1', apr) }));
	assert.equal(out.workflowData[0][0].json.data.approval_id, 'a1');
});

test('the signature helpers agree with the server and reject a forgery of the same length', () => {
	const body = '{"id":"evt_1","type":"post.published"}';
	const t = 1759665600;
	assert.equal(W.sign('whsec_a', body, t), serverSign('whsec_a', body, t));
	assert.equal(W.signatureProblem('whsec_a', body, serverSign('whsec_a', body, t), t * 1000), null);
	const forged = serverSign('whsec_a', body, t).replace(/v1=(.)/, (m, c) => `v1=${c === 'a' ? 'b' : 'a'}`);
	assert.match(W.signatureProblem('whsec_a', body, forged, t * 1000), /does not match/);
	assert.deepEqual(W.networksOf({ platform: 'x' }), ['x']);
	assert.deepEqual(W.networksOf({ approved_platforms: ['x'], rejected_platforms: ['linkedin'] }), ['x', 'linkedin']);
});

test('the trigger offers every event PostWire sends, and is a proper n8n trigger', () => {
	const d = new PostWireTrigger().description;
	const offered = d.properties.find((p) => p.name === 'events').options.map((o) => o.value).sort();
	assert.deepEqual(offered, ['approval.decided', 'approval.requested', 'connection.reauth_required', 'post.failed', 'post.published']);
	assert.deepEqual(d.inputs, []);
	assert.equal(d.webhooks[0].httpMethod, 'POST');
	assert.equal(d.usableAsTool, undefined);
	assert.ok(d.name.endsWith('Trigger') && d.displayName.includes('Trigger'));
});
