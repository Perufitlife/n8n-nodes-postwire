// 0.4.7: the Generate operation passes on the API's next_step when the drafts are for networks not connected.
const test = require('node:test');
const assert = require('node:assert/strict');
const { PostWire } = require('../dist/nodes/PostWire/PostWire.node.js');
const { ctx, ok } = require('./_ctx.js');

const run = (c) => new PostWire().execute.call(c);

test('Generate passes next_step, not_connected and connect_urls through', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'generate', platforms: ['linkedin'], prompt: 'launch', mediaSource: 'none', options: {} },
		answer: () => ok({ drafts: { linkedin: { text: 'hi' } }, next_step: 'These are drafts; nothing was published.', not_connected: ['linkedin'], connect_urls: { linkedin: 'https://postwire.io/dashboard.html#go=connect&net=linkedin' } }),
	});
	const out = await run(c);
	const j = out[0][0].json;
	assert.equal(j.next_step, 'These are drafts; nothing was published.');
	assert.deepEqual(j.not_connected, ['linkedin']);
	assert.match(j.connect_urls.linkedin, /net=linkedin/);
});

test('Generate output is unchanged when everything is connected', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'generate', platforms: ['linkedin'], prompt: 'launch', mediaSource: 'none', options: {} },
		answer: () => ok({ drafts: { linkedin: { text: 'hi' } } }),
	});
	const j = (await run(c))[0][0].json;
	assert.equal(j.next_step, undefined);
	assert.equal(j.connect_urls, undefined);
});
