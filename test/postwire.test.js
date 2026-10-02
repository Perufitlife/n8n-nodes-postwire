// Unit tests for the PostWire node, run against the compiled output (`npm run build` first).
// No network: every HTTP call goes through a fake `helpers` that records the request and answers
// from a script, so each test states exactly what PostWire would have been sent.
const test = require('node:test');
const assert = require('node:assert/strict');
const { NodeApiError, NodeOperationError } = require('n8n-workflow');
const { PostWire } = require('../dist/nodes/PostWire/PostWire.node.js');
const G = require('../dist/nodes/PostWire/GenericFunctions.js');

function ctx({ version = 2, params = {}, items = [{ json: {} }], answer, binary, executionId = 'exec-1', continueOnFail = false }) {
	const calls = [];
	const node = { name: 'PostWire', typeVersion: version, type: 'n8n-nodes-postwire.postWire', parameters: params };
	const reply = (opts, authed) => {
		calls.push({ ...opts, authed });
		const r = answer(opts, calls.length) ?? { statusCode: 200, body: {} };
		return r;
	};
	return {
		calls,
		getInputData: () => items,
		getNode: () => node,
		getNodeParameter: (name, i, fallback) => (name in params ? params[name] : fallback),
		getTimezone: () => 'America/Lima',
		getExecutionId: () => executionId,
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: async (cred, opts) => reply(opts, cred),
			httpRequest: async (opts) => reply(opts, null),
			assertBinaryData: () => binary.meta,
			getBinaryDataBuffer: async () => binary.buffer,
		},
	};
}

const run = (c) => new PostWire().execute.call(c);
const ok = (body) => ({ statusCode: 200, body });

test('version 1 "Write and Publish" still writes drafts, then publishes them', async () => {
	const c = ctx({
		version: 1,
		params: { operation: 'generateAndPublish', platforms: ['x', 'linkedin'], prompt: 'We shipped', options: {} },
		answer: (o) =>
			o.url.endsWith('/api/generate')
				? ok({ drafts: { x: { text: 'short' }, linkedin: { text: 'long' } } })
				: ok({ posted: 2, results: [{ ok: true, platform: 'x', id: '1' }, { ok: true, platform: 'linkedin', id: '2' }] }),
	});
	const [out] = await run(c);
	assert.equal(out.length, 2);
	assert.equal(c.calls[1].url, 'https://postwire.io/api/post');
	assert.deepEqual(c.calls[1].body.per_platform.x, { text: 'short' });
	assert.equal(c.calls[1].body.idempotency_key, 'n8n:exec-1:PostWire:0');
});

test('version 1 "Get Account" returns the raw account', async () => {
	const c = ctx({ version: 1, params: { operation: 'me' }, answer: () => ok({ email: 'a@b.c', plan: 'free', usage: {} }) });
	const [out] = await run(c);
	assert.equal(out[0].json.email, 'a@b.c');
	assert.equal(c.calls[0].authed, 'postWireApi');
});

test('a TikTok post with no video is refused before any request, naming the fix', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'publish', platforms: ['tiktok', 'x'], contentMode: 'text', text: 'hi', mediaSource: 'none', options: {} },
		answer: () => ok({}),
	});
	await assert.rejects(run(c), (e) => e instanceof NodeOperationError && /TikTok will not accept a post without a video/.test(e.message) && /Binary File/.test(e.description));
	assert.equal(c.calls.length, 0);
});

test('a Google Drive share link is caught with the Drive-specific fix', () => {
	const why = G.pageLinkFix('https://drive.google.com/file/d/abc/view?usp=sharing');
	assert.match(why, /Google Drive node/);
	assert.equal(G.pageLinkFix('https://cdn.example.com/clip.mp4'), null);
	assert.match(G.pageLinkFix('https://www.dropbox.com/s/x/clip.mp4?dl=0'), /dl=1/);
	assert.equal(G.pageLinkFix('https://www.dropbox.com/s/x/clip.mp4?dl=1'), null);
});

test('the media URL check reads a page served as text/html', async () => {
	const c = ctx({ answer: () => ({ statusCode: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }) });
	const why = await G.checkMediaUrl(c, 'https://example.com/watch/123', ['tiktok']);
	assert.match(why, /web page/);
});

test('the media URL check falls back to a 1-byte GET when HEAD is refused, and reads the size', async () => {
	const c = ctx({
		answer: (o) =>
			o.method === 'HEAD'
				? { statusCode: 405, headers: {} }
				: { statusCode: 206, headers: { 'content-type': 'video/mp4', 'content-range': 'bytes 0-0/2147483648' } },
	});
	const why = await G.checkMediaUrl(c, 'https://example.com/v', ['youtube']);
	assert.match(why, /2048 MB/);
	assert.equal(c.calls[1].headers.Range, 'bytes=0-0');
});

test('an unreachable host never blocks the post (the network decides)', async () => {
	const c = ctx({ answer: () => { throw new Error('ETIMEDOUT'); } });
	assert.equal(await G.checkMediaUrl(c, 'https://slow.example.com/v.mp4', ['tiktok']), null);
});

test('plain http is refused', async () => {
	const c = ctx({ answer: () => ok({}) });
	assert.match(await G.checkMediaUrl(c, 'http://example.com/v.mp4', ['tiktok']), /https/);
});

test('an API refusal becomes a NodeApiError with the fix (not_connected)', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'publish', platforms: ['x', 'bluesky'], contentMode: 'text', text: 'hi', mediaSource: 'none', options: {} },
		answer: () => ({ statusCode: 400, body: { error: 'not connected: bluesky', code: 'not_connected', platforms: ['bluesky'] } }),
	});
	await assert.rejects(run(c), (e) => e instanceof NodeApiError && /not connected: bluesky/.test(e.message) && /Create Connect Link/.test(e.description));
});

test('media_unreachable (API, 26-sep) is explained', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'publish', platforms: ['x'], contentMode: 'text', text: 'hi', mediaSource: 'url', mediaUrl: 'https://a.example/x.jpg', options: { skipMediaCheck: true } },
		answer: () => ({ statusCode: 400, body: { error: 'the link answered 403', code: 'media_unreachable' } }),
	});
	await assert.rejects(run(c), (e) => /403/.test(e.message) && /Binary File/.test(e.description));
});

test('a 401 says to fix the credential', async () => {
	const c = ctx({ params: { resource: 'account', operation: 'get', simplify: true }, answer: () => ({ statusCode: 401, body: { error: 'invalid API key' } }) });
	await assert.rejects(run(c), (e) => /credential/.test(e.description));
});

test('publish returns one item per network, adds a hint to failures, and fails when none went out', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'publish', platforms: ['instagram'], contentMode: 'text', text: 'hi', mediaSource: 'url', mediaUrl: 'https://a.example/v.mp4', options: { skipMediaCheck: true } },
		answer: () => ok({ posted: 0, results: [{ ok: false, platform: 'instagram', error: 'could not fetch the video URL' }] }),
	});
	await assert.rejects(run(c), (e) => /none of the 1/.test(e.message) && /could not download the media/.test(e.description));
	assert.equal(c.calls[0].body.video_url, 'https://a.example/v.mp4');
});

test('partial success keeps going and flags the failed network', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'publish', platforms: ['x', 'youtube'], contentMode: 'text', text: 'hi', mediaSource: 'url', mediaUrl: 'https://a.example/v.mp4', options: { skipMediaCheck: true } },
		answer: () => ok({ posted: 1, results: [{ ok: true, platform: 'x', id: '9' }, { ok: false, platform: 'youtube', error: 'token expired' }] }),
	});
	const [out] = await run(c);
	assert.equal(out.length, 2);
	assert.match(out[1].json.hint, /Reconnect/);
});

test('drafts mode publishes the drafts from a previous step, and refuses missing ones', async () => {
	const good = ctx({
		params: { resource: 'post', operation: 'publish', platforms: ['x'], contentMode: 'drafts', drafts: '{"drafts":{"x":{"text":"approved"}}}', mediaSource: 'none', options: {} },
		answer: () => ok({ posted: 1, results: [{ ok: true, platform: 'x' }] }),
	});
	await run(good);
	assert.equal(good.calls[0].body.per_platform.x.text, 'approved');
	assert.equal(good.calls[0].body.idempotency_key, undefined);

	const bad = ctx({
		params: { resource: 'post', operation: 'publish', platforms: ['x', 'linkedin'], contentMode: 'drafts', drafts: { x: { text: 'a' } }, mediaSource: 'none', options: {} },
		answer: () => ok({}),
	});
	await assert.rejects(run(bad), /No draft for LinkedIn/);
});

test('dry run publishes nothing and reports per network', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'publish', platforms: ['x', 'bluesky'], contentMode: 'text', text: 'x'.repeat(290), mediaSource: 'none', options: { dryRun: true } },
		answer: (o) => (o.url.endsWith('/api/me') ? ok({ connections: [{ platform: 'x' }] }) : ok({})),
	});
	const [out] = await run(c);
	assert.equal(c.calls.filter((k) => k.url.endsWith('/api/post')).length, 0);
	assert.equal(out[0].json.ready, true); // shared text is shortened by PostWire, not refused
	assert.equal(out[1].json.ready, false);
	assert.match(out[1].json.issues[0], /not connected/);
});

test('binary media is uploaded to PostWire first and published as a URL', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'publish', platforms: ['tiktok'], contentMode: 'text', text: 'hi', mediaSource: 'binary', binaryPropertyName: 'data', options: {} },
		binary: { meta: { mimeType: 'video/mp4' }, buffer: Buffer.alloc(1024) },
		answer: (o) => {
			if (o.url.endsWith('/api/media/upload-url')) return ok({ upload_url: 'https://store.example/put', path: 'acct/1.mp4' });
			if (o.method === 'PUT') return { statusCode: 200 };
			if (o.url.endsWith('/api/media/finalize')) return ok({ media_url: 'https://store.example/signed.mp4', content_type: 'video/mp4' });
			return ok({ posted: 1, results: [{ ok: true, platform: 'tiktok' }] });
		},
	});
	await run(c);
	assert.deepEqual(c.calls.map((k) => k.method), ['POST', 'PUT', 'GET', 'POST']);
	assert.equal(c.calls[0].body.size_bytes, 1024);
	assert.equal(c.calls[3].body.video_url, 'https://store.example/signed.mp4');
});

test('an oversized binary is refused with the URL alternative', async () => {
	const c = ctx({
		params: { resource: 'media', operation: 'upload', binaryPropertyName: 'data' },
		binary: { meta: { mimeType: 'video/mp4' }, buffer: Buffer.alloc(51 * 1024 * 1024) },
		answer: () => ok({}),
	});
	await assert.rejects(run(c), (e) => /50 MB/.test(e.message) && /public https link/.test(e.description));
});

test('plan week sends the workflow time zone offset and refuses video networks', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'planWeek', platforms: ['linkedin'], topic: 'pricing', days: 3, hour: 9, options: {} },
		answer: () => ok({ ok: true, queued: [] }),
	});
	await run(c);
	assert.equal(c.calls[0].body.tz_offset_minutes, 300); // Lima is UTC-5 all year
	assert.equal(c.calls[0].body.start_hour, 9);

	const v = ctx({ params: { resource: 'post', operation: 'planWeek', platforms: ['tiktok'], topic: 't', options: {} }, answer: () => ok({}) });
	await assert.rejects(run(v), /TikTok cannot be in a week plan/);
});

test('plan week reads Days and Hour from Options, and still honours the old top-level values', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'planWeek', platforms: ['linkedin'], topic: 'pricing', options: { days: 2, hour: 18 } },
		answer: () => ok({ ok: true, queued: [] }),
	});
	await run(c);
	assert.equal(c.calls[0].body.days, 2);
	assert.equal(c.calls[0].body.start_hour, 18);

	const d = ctx({ params: { resource: 'post', operation: 'planWeek', platforms: ['linkedin'], topic: 'p', options: {} }, answer: () => ok({}) });
	await run(d);
	assert.equal(d.calls[0].body.days, 5);
	assert.equal(d.calls[0].body.start_hour, 10);

	// A workflow saved with 0.3.1 carries days/hour at the top level (the earlier test covers hour: 9).
	const legacy = ctx({ params: { resource: 'post', operation: 'planWeek', platforms: ['linkedin'], topic: 'p', days: 3, options: {} }, answer: () => ok({}) });
	await run(legacy);
	assert.equal(legacy.calls[0].body.days, 3);
});

test('connect link reads Network from Options, the old top-level value, or none', async () => {
	const base = { resource: 'connection', operation: 'createConnectLink' };
	const a = ctx({ params: { ...base, options: { platform: 'linkedin' } }, answer: () => ok({ url: 'u' }) });
	await run(a);
	assert.deepEqual(a.calls[0].body, { platform: 'linkedin' });

	const b = ctx({ params: { ...base, options: {} }, answer: () => ok({ url: 'u' }) });
	await run(b);
	assert.deepEqual(b.calls[0].body, {});

	const legacy = ctx({ params: { ...base, platform: 'bluesky' }, answer: () => ok({ url: 'u' }) });
	await run(legacy);
	assert.deepEqual(legacy.calls[0].body, { platform: 'bluesky' });
});

test('version 2 keeps optional fields in collections and offers only networks PostWire publishes to', () => {
	const props = new PostWire().description.properties.filter((p) => (p.displayOptions?.show?.['@version'] || []).includes(2));
	for (const name of ['days', 'hour']) assert.equal(props.find((p) => p.name === name), undefined, `${name} is top level`);
	const link = props.filter((p) => p.displayOptions?.show?.operation?.includes('createConnectLink'));
	assert.deepEqual(link.map((p) => p.name), ['options']);
	const offered = props.filter((p) => p.type === 'options' || p.type === 'multiOptions').flatMap((p) => p.options.map((o) => o.value));
	const nested = props.filter((p) => p.type === 'collection').flatMap((p) => p.options).filter((o) => o.options).flatMap((o) => o.options.map((x) => x.value));
	for (const v of [...offered, ...nested]) assert.ok(!['x', 'reddit'].includes(v), `v2 offers ${v}`);
});

test('time zone offsets follow the getTimezoneOffset convention', () => {
	assert.equal(G.tzOffsetMinutes('UTC'), 0);
	assert.equal(G.tzOffsetMinutes('Asia/Hong_Kong'), -480);
	assert.equal(G.tzOffsetMinutes('Europe/Madrid', new Date('2026-07-01T12:00:00Z')), -120);
});

test('delete operations return { deleted: true }', async () => {
	const c = ctx({ params: { resource: 'scheduledPost', operation: 'delete', scheduledPostId: 'abc' }, answer: () => ok({ ok: true }) });
	const [out] = await run(c);
	assert.deepEqual(out[0].json, { deleted: true, id: 'abc' });
	assert.equal(c.calls[0].method, 'DELETE');
});

test('generate returns drafts plus a readable preview for approval steps', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'generate', platforms: ['youtube'], prompt: 'p', mediaSource: 'none', options: {} },
		answer: () => ok({ drafts: { youtube: { text: 'desc', title: 'T' } } }),
	});
	const [out] = await run(c);
	assert.match(out[0].json.preview, /\*YouTube\*\nT\ndesc/);
});

test('continue on fail turns an error into an item with the fix', async () => {
	const c = ctx({
		continueOnFail: true,
		params: { resource: 'post', operation: 'publish', platforms: [], contentMode: 'text', text: 'x', options: {} },
		answer: () => ok({}),
	});
	const [out] = await run(c);
	assert.match(out[0].json.error, /No network selected/);
	assert.ok(out[0].json.description);
});

test('brand search lists brands with their networks', async () => {
	const c = ctx({ answer: () => ok({ brands: [{ id: 'b1', name: 'Acme', platforms: ['x', 'tiktok'] }] }) });
	const res = await new PostWire().methods.listSearch.searchBrands.call(c, 'ac');
	assert.deepEqual(res.results, [{ name: 'Acme (X (Twitter), TikTok)', value: 'b1' }]);
});

test('a network the writer left empty is asked for once more, alone', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'generate', platforms: ['x', 'linkedin'], prompt: 'p', mediaSource: 'none', options: {} },
		answer: (o, nth) =>
			nth === 1
				? ok({ drafts: { x: { text: 'a' }, linkedin: { text: '' } }, missing: ['linkedin'] })
				: ok({ drafts: { linkedin: { text: 'long form' } } }),
	});
	const [out] = await run(c);
	assert.deepEqual(c.calls[1].body.platforms, ['linkedin']);
	assert.equal(out[0].json.drafts.linkedin.text, 'long form');
	assert.equal(out[0].json.missing, undefined);
});
