// 0.4.3: the blog and chat destinations (WordPress, Dev.to, Hashnode, Slack, Nostr), threads on X, Bluesky and Mastodon,
// a first comment on LinkedIn, X, Bluesky and Mastodon, and ONE error item when a publish reaches no network.
// Run against dist/ (`npm run build` first).
const test = require('node:test');
const assert = require('node:assert/strict');
const { NodeOperationError } = require('n8n-workflow');
const { PostWire } = require('../dist/nodes/PostWire/PostWire.node.js');
const G = require('../dist/nodes/PostWire/GenericFunctions.js');
const { ctx, ok } = require('./_ctx.js');

const run = (c) => new PostWire().execute.call(c);
const publish = (platforms, options, extra = {}) => ({
	resource: 'post', operation: 'publish', platforms, contentMode: 'text', text: 'We rebuilt onboarding', mediaSource: 'none', options, ...extra,
});
const optionsOf = (props, name) => props.filter((p) => p.name === name).flatMap((p) => p.options || []);

test('the new destinations are offered in version 2 and not in the frozen version 1', () => {
	const desc = new PostWire().description;
	const v2 = desc.properties.filter((p) => p.name === 'platforms' && p.displayOptions?.show?.['@version']?.[0] === 2);
	const v1 = desc.properties.filter((p) => p.name === 'platforms' && p.displayOptions?.show?.['@version']?.[0] === 1);
	assert.ok(v2.length && v1.length);
	for (const net of ['wordpress', 'devto', 'hashnode', 'slack', 'nostr']) {
		for (const p of v2) assert.ok(p.options.some((o) => o.value === net), `${net} missing from v2 Networks`);
		for (const p of v1) assert.ok(!p.options.some((o) => o.value === net), `${net} must not appear in v1`);
	}
	assert.deepEqual(v1[0].options.map((o) => o.value).sort(), [...G.LEGACY_PLATFORMS].sort());
	assert.equal(G.nameOf('devto'), 'Dev.to');
	assert.equal(G.needOf('wordpress'), null, 'a blog post needs no media');
});

test('Thread goes to every thread network as per_platform.<network>.thread, with the text', async () => {
	const c = ctx({
		params: publish(['bluesky', 'mastodon', 'linkedin'], { thread: ['Step 1: one screen', ' ', 'Step 2: connect first'] }),
		answer: () => ok({ posted: 3, results: [{ ok: true, platform: 'bluesky' }, { ok: true, platform: 'mastodon' }, { ok: true, platform: 'linkedin' }] }),
	});
	await run(c);
	const body = c.calls[0].body;
	assert.equal(body.text, 'We rebuilt onboarding');
	assert.deepEqual(body.per_platform, {
		bluesky: { text: 'We rebuilt onboarding', thread: ['Step 1: one screen', 'Step 2: connect first'] },
		mastodon: { text: 'We rebuilt onboarding', thread: ['Step 1: one screen', 'Step 2: connect first'] },
	});
	assert.equal(body.options, undefined);
});

test('Split Long Text Into a Thread sends thread: true; X Thread still wins for X', async () => {
	const c = ctx({
		params: publish(['x', 'bluesky'], { splitThread: true, xThread: ['x two'] }),
		answer: () => ok({ posted: 2, results: [{ ok: true, platform: 'x' }, { ok: true, platform: 'bluesky' }] }),
	});
	await run(c);
	assert.deepEqual(c.calls[0].body.per_platform, {
		x: { text: 'We rebuilt onboarding', thread: ['x two'] },
		bluesky: { text: 'We rebuilt onboarding', thread: true },
	});
});

test('First Comment goes to LinkedIn, X, Bluesky and Mastodon only; X Reply wins on X', async () => {
	const comment = 'Full write-up: https://example.com/onboarding';
	const c = ctx({
		params: publish(['linkedin', 'bluesky', 'telegram', 'x'], { firstComment: comment, xReply: 'reply on x' }),
		answer: () => ok({ posted: 4, results: ['linkedin', 'bluesky', 'telegram', 'x'].map((platform) => ({ ok: true, platform })) }),
	});
	await run(c);
	assert.deepEqual(c.calls[0].body.options, {
		x: { reply: 'reply on x' },
		linkedin: { first_comment: comment },
		bluesky: { first_comment: comment },
	});
	assert.equal(c.calls[0].body.per_platform, undefined);
});

test('on X alone the first comment is sent as first_comment and checked at 280 as X counts', async () => {
	const good = ctx({ params: publish(['x'], { firstComment: 'link https://example.com/' + 'a'.repeat(400) }), answer: () => ok({ posted: 1, results: [{ ok: true, platform: 'x' }] }) });
	await run(good);
	assert.deepEqual(good.calls[0].body.options, { x: { first_comment: 'link https://example.com/' + 'a'.repeat(400) } });

	const bad = ctx({ params: publish(['x'], { firstComment: 'z'.repeat(281) }), answer: () => ok({}) });
	await assert.rejects(run(bad), (e) => e instanceof NodeOperationError && /'First Comment' is 281 characters/.test(e.message));
	assert.equal(bad.calls.length, 0);
});

test('a Bluesky or Mastodon thread over 10 posts in all is refused before anything is sent', async () => {
	const c = ctx({ params: publish(['bluesky'], { thread: Array.from({ length: 10 }, (_, n) => `post ${n + 2}`) }), answer: () => ok({}) });
	await assert.rejects(run(c), (e) => /The Bluesky thread has 10 posts; Bluesky takes at most 9 after the first/.test(e.message));
	assert.equal(c.calls.length, 0);
	// The same 10 are fine on X (25 after the first).
	const x = ctx({ params: publish(['x'], { thread: Array.from({ length: 10 }, (_, n) => `post ${n + 2}`) }), answer: () => ok({ posted: 1, results: [{ ok: true, platform: 'x' }] }) });
	await run(x);
	assert.equal(x.calls[0].body.per_platform.x.thread.length, 10);
});

test('thread and first comment options are ignored on networks that take neither', async () => {
	const c = ctx({
		params: publish(['wordpress', 'slack', 'nostr'], { thread: ['two'], firstComment: 'c', splitThread: true }),
		answer: () => ok({ posted: 3, results: ['wordpress', 'slack', 'nostr'].map((platform) => ({ ok: true, platform })) }),
	});
	const [out] = await run(c);
	assert.equal(out.length, 3);
	assert.deepEqual(c.calls[0].body.platforms, ['wordpress', 'slack', 'nostr']);
	assert.equal(c.calls[0].body.per_platform, undefined);
	assert.equal(c.calls[0].body.options, undefined);
});

test('the article title goes out as title for the blogs', async () => {
	const c = ctx({
		params: publish(['devto'], { title: 'How we rebuilt onboarding' }),
		answer: () => ok({ posted: 1, results: [{ ok: true, platform: 'devto', url: 'https://dev.to/a/b' }] }),
	});
	const [out] = await run(c);
	assert.equal(c.calls[0].body.title, 'How we rebuilt onboarding');
	assert.equal(out[0].json.url, 'https://dev.to/a/b');
});

test('dry run shows the thread and the first comment each network would get', async () => {
	const c = ctx({
		params: publish(['bluesky', 'linkedin'], { dryRun: true, thread: ['two'], firstComment: 'link' }),
		answer: () => ok({ connections: [{ platform: 'bluesky' }, { platform: 'linkedin' }] }),
	});
	const [out] = await run(c);
	assert.deepEqual(out[0].json.thread, ['two']);
	assert.equal(out[0].json.first_comment, 'link');
	assert.equal(out[1].json.thread, undefined);
	assert.equal(out[1].json.first_comment, 'link');
});

test('bad_thread from the API names the options to fix', () => {
	const d = G.describeFailure('bad_thread', {});
	assert.match(d.description, /Nothing was published/);
	assert.match(d.description, /'Thread'/);
});

// The 4-emails bug (7-oct, faceless Shorts template): with "On Error: Continue" a post that failed on all 3 networks
// came out as 3 per-network items AND 1 error item, so the error branch ran 4 times.
const allFailed = () => ok({
	posted: 0,
	results: [
		{ ok: false, platform: 'tiktok', error: 'not connected', code: 'not_connected' },
		{ ok: false, platform: 'instagram', error: 'not connected', code: 'not_connected' },
		{ ok: false, platform: 'youtube', error: 'not connected', code: 'not_connected' },
	],
});
const videoPost = (extra = {}) => ({
	params: {
		resource: 'post', operation: 'publish', platforms: ['tiktok', 'instagram', 'youtube'], contentMode: 'text', text: 'clip',
		mediaSource: 'url', mediaUrl: 'https://a.example/v.mp4', options: { skipMediaCheck: true },
	},
	answer: allFailed,
	...extra,
});

test('a publish that reached no network gives ONE error item with Continue On Fail, carrying each network result', async () => {
	const c = ctx(videoPost({ continueOnFail: true }));
	const [out] = await run(c);
	assert.equal(out.length, 1, 'one item, so an error branch that sends an email sends one');
	const j = out[0].json;
	assert.match(j.error, /published to none of the 3/);
	assert.ok(j.description);
	assert.equal(j.ok, false);
	assert.equal(j.posted, 0);
	assert.deepEqual(j.results.map((r) => r.platform), ['tiktok', 'instagram', 'youtube']);
	assert.ok(j.results.every((r) => r.ok === false && r.hint), 'each network keeps its hint');
	assert.deepEqual(out[0].pairedItem, { item: 0 });
});

test('a publish that reached no network still fails the step without Continue On Fail', async () => {
	const c = ctx(videoPost());
	await assert.rejects(run(c), (e) => /none of the 3/.test(e.message));
});

test('two items: one fails everywhere, one works — 1 error item + 1 per network that worked', async () => {
	const c = ctx(videoPost({
		continueOnFail: true,
		items: [{ json: {} }, { json: {} }],
		answer: (o, nth) => (nth === 1 ? allFailed() : ok({ posted: 1, results: [{ ok: true, platform: 'tiktok' }, { ok: false, platform: 'instagram', error: 'x' }, { ok: true, platform: 'youtube' }] })),
	}));
	const [out] = await run(c);
	assert.equal(out.length, 4);
	assert.equal(out[0].json.results.length, 3);
	assert.deepEqual(out.slice(1).map((o) => [o.json.platform, o.pairedItem.item]), [['tiktok', 1], ['instagram', 1], ['youtube', 1]]);
});
