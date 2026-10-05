// What shipped in the PostWire API after 0.3.2, in the action node (0.4.0): X threads and replies, approvals
// (202 pending_approval), teams, run_at "next_slot", brand / scheduled post / approval lookups, multipart media.
// Every 0.3.2 workflow must keep running unchanged: the "0.3.2 …" tests below pin that.
const test = require('node:test');
const assert = require('node:assert/strict');
const { NodeOperationError } = require('n8n-workflow');
const { PostWire } = require('../dist/nodes/PostWire/PostWire.node.js');
const G = require('../dist/nodes/PostWire/GenericFunctions.js');
const { ctx, ok } = require('./_ctx.js');

const run = (c) => new PostWire().execute.call(c);

test('X thread and reply with the same text everywhere: the text stays for every network, the thread rides on per_platform.x', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'publish', platforms: ['x', 'linkedin'], contentMode: 'text', text: 'We shipped threads', mediaSource: 'none',
			options: { xThread: ['Post two', '  ', 'Post three'], xReply: 'Read more: https://example.com/a-very-long-link-that-x-counts-as-23' } },
		answer: () => ok({ posted: 2, results: [{ ok: true, platform: 'x', id: '1' }, { ok: true, platform: 'linkedin', id: '2' }] }),
	});
	await run(c);
	const body = c.calls[0].body;
	assert.equal(body.text, 'We shipped threads');
	assert.deepEqual(body.per_platform, { x: { text: 'We shipped threads', thread: ['Post two', 'Post three'] } });
	assert.deepEqual(body.options, { x: { reply: 'Read more: https://example.com/a-very-long-link-that-x-counts-as-23' } });
});

test('Smart Distribute drafts keep the thread the writer returned', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'publish', platforms: ['x'], contentMode: 'smart', prompt: 'write a thread about our launch', mediaSource: 'none', options: {} },
		answer: (o) => (o.url.endsWith('/api/generate')
			? ok({ drafts: { x: { text: 'hook', thread: ['two', 'three'] } } })
			: ok({ posted: 1, results: [{ ok: true, platform: 'x', id: '1' }] })),
	});
	await run(c);
	assert.deepEqual(c.calls[1].body.per_platform.x, { text: 'hook', thread: ['two', 'three'] });
});

test('an X thread post over 280 characters as X counts them is refused before anything is sent', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'publish', platforms: ['x'], contentMode: 'text', text: 'hook', mediaSource: 'none', options: { xThread: ['ok', 'y'.repeat(281)] } },
		answer: () => ok({}),
	});
	await assert.rejects(run(c), (e) => e instanceof NodeOperationError && /Post 3 of the X thread is 281/.test(e.message));
	assert.equal(c.calls.length, 0);
	assert.equal(G.xLength('see https://example.com/' + 'a'.repeat(100)), 4 + 23);
	assert.equal(G.xLength('hi \u{1F44B}'), 5);
});

test('X thread options are ignored when X is not one of the networks', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'publish', platforms: ['linkedin'], contentMode: 'text', text: 'hi', mediaSource: 'none', options: { xThread: ['two'], xReply: 'r' } },
		answer: () => ok({ posted: 1, results: [{ ok: true, platform: 'linkedin' }] }),
	});
	await run(c);
	assert.equal(c.calls[0].body.per_platform, undefined);
	assert.equal(c.calls[0].body.options, undefined);
});

test('dry run checks each X thread post on its own', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'publish', platforms: ['x'], contentMode: 'text', text: 'hook', mediaSource: 'none', options: { dryRun: true, xThread: ['fine'] } },
		answer: () => ok({ connections: [{ platform: 'x' }] }),
	});
	const [out] = await run(c);
	assert.equal(out[0].json.ready, true);
	assert.deepEqual(out[0].json.thread, ['fine']);
});

test('a publish held for approval (202) is not a failure: one item per network with the approval ids', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'publish', platforms: ['linkedin', 'x'], contentMode: 'text', text: 'hi', mediaSource: 'none', options: {} },
		answer: () => ({ statusCode: 202, body: {
			ok: true, posted: 0, status: 'pending_approval', id: 'sch-1', schedule_id: 'sch-1', approval_id: 'apr-1',
			approval: { review_url: 'https://postwire.io/dashboard.html#approvals=apr-1', reasons: [{ code: 'source', text: 'Posts from n8n need approval' }] },
			results: [{ platform: 'linkedin', ok: false, status: 'pending_approval', code: 'pending_approval' }, { platform: 'x', ok: false, status: 'pending_approval', code: 'pending_approval' }],
			message_for_user: 'Waiting for approval — nothing is published yet.',
		} }),
	});
	const [out] = await run(c);
	assert.equal(out.length, 2);
	assert.deepEqual(out.map((o) => [o.json.platform, o.json.status, o.json.approval_id, o.json.id]), [['linkedin', 'pending_approval', 'apr-1', 'sch-1'], ['x', 'pending_approval', 'apr-1', 'sch-1']]);
	assert.match(out[0].json.review_url, /approvals=apr-1/);
	assert.equal(out[0].json.hint, undefined);
});

test('schedule in the next free queue slot sends run_at "next_slot" and the workflow time zone', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'schedule', platforms: ['linkedin'], contentMode: 'text', text: 'hi', mediaSource: 'none', when: 'nextSlot', options: {} },
		answer: () => ok({ ok: true, scheduled: { id: 's1', run_at: '2026-10-06T14:00:00.000Z', status: 'queued' }, slot: { run_at: '2026-10-06T14:00:00.000Z', timezone: 'America/Lima', local: 'Mon 09:00' } }),
	});
	const [out] = await run(c);
	assert.equal(c.calls[0].body.run_at, 'next_slot');
	assert.equal(c.calls[0].body.timezone, 'America/Lima');
	assert.equal(out[0].json.id, 's1');
	assert.equal(out[0].json.slot.local, 'Mon 09:00');
});

test('0.3.2 Schedule (no "When" saved) still uses Publish At', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'schedule', platforms: ['linkedin'], contentMode: 'text', text: 'hi', mediaSource: 'none', runAt: '2026-10-07T09:00:00Z', options: {} },
		answer: () => ok({ ok: true, scheduled: { id: 's2', status: 'queued' } }),
	});
	const [out] = await run(c);
	assert.equal(c.calls[0].body.run_at, '2026-10-07T09:00:00.000Z');
	assert.equal(c.calls[0].body.timezone, undefined);
	assert.equal(out[0].json.id, 's2');
});

test('a schedule held for approval returns the approval, not an empty row', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'schedule', platforms: ['linkedin'], contentMode: 'text', text: 'hi', mediaSource: 'none', runAt: '2026-10-07T09:00:00Z', options: {} },
		answer: () => ({ statusCode: 202, body: { ok: true, posted: 0, status: 'pending_approval', id: 'sch-9', approval_id: 'apr-9', approval: { review_url: 'u' } } }),
	});
	const [out] = await run(c);
	assert.equal(out[0].json.status, 'pending_approval');
	assert.equal(out[0].json.approval_id, 'apr-9');
});

test('a schedule over the Free queue says it is held, with the upgrade link', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'schedule', platforms: ['linkedin'], contentMode: 'text', text: 'hi', mediaSource: 'none', runAt: '2026-10-07T09:00:00Z', options: {} },
		answer: () => ({ statusCode: 202, body: { ok: true, held: true, code: 'queue_limit', scheduled: { id: 's3', status: 'held' }, message: 'Saved as held', upgrade_url: 'https://postwire.io/u' } }),
	});
	const [out] = await run(c);
	assert.equal(out[0].json.status, 'held');
	assert.equal(out[0].json.held, true);
	assert.equal(out[0].json.upgrade_url, 'https://postwire.io/u');
});

test('Approval → Get Many pages back with "before" until it has them all', async () => {
	const page1 = Array.from({ length: 200 }, (_, n) => ({ id: `a${n}`, created_at: `2026-10-05T10:${String(n % 60).padStart(2, '0')}:00Z` }));
	const c = ctx({
		params: { resource: 'approval', operation: 'getAll', returnAll: true, filters: { status: 'pending', brand: { mode: 'list', value: 'b1' } } },
		answer: (o, nth) => ok({ approvals: nth === 1 ? page1 : [{ id: 'last', created_at: '2026-10-01T00:00:00Z' }] }),
	});
	const [out] = await run(c);
	assert.equal(out.length, 201);
	assert.deepEqual(c.calls[0].qs, { limit: 200, status: 'pending', brand_id: 'b1' });
	assert.equal(c.calls[1].qs.before, page1[199].created_at);
});

test('Approval → Get Many with a limit asks for that many, once', async () => {
	const c = ctx({ params: { resource: 'approval', operation: 'getAll', returnAll: false, limit: 3, filters: {} }, answer: () => ok({ approvals: [{ id: 1 }, { id: 2 }, { id: 3 }] }) });
	const [out] = await run(c);
	assert.equal(out.length, 3);
	assert.equal(c.calls.length, 1);
	assert.deepEqual(c.calls[0].qs, { limit: 3 });
});

test('Approval → Get, Brand → Get and Scheduled Post → Get read one record each', async () => {
	const a = ctx({ params: { resource: 'approval', operation: 'get', approvalId: 'apr-1' }, answer: () => ok({ approval: { id: 'apr-1', status: 'pending' }, can_decide: false }) });
	assert.equal((await run(a))[0][0].json.status, 'pending');
	assert.match(a.calls[0].url, /\/api\/approvals\/apr-1$/);
	const b = ctx({ params: { resource: 'brand', operation: 'get', brand: { mode: 'id', value: 'b 1' } }, answer: () => ok({ brand: { id: 'b 1', name: 'Acme' } }) });
	assert.equal((await run(b))[0][0].json.name, 'Acme');
	assert.match(b.calls[0].url, /\/api\/brands\/b%201$/);
	const s = ctx({ params: { resource: 'scheduledPost', operation: 'get', scheduledPostId: ' s1 ' }, answer: () => ok({ scheduled: { id: 's1', status: 'done' } }) });
	assert.equal((await run(s))[0][0].json.status, 'done');
	assert.match(s.calls[0].url, /\/api\/schedule\/s1$/);
});

test("Get Status with PostWire's own id asks without a network", async () => {
	const c = ctx({ params: { resource: 'post', operation: 'getStatus', statusPlatform: 'postwire', postId: 'sch-1' }, answer: () => ok({ status: 'pending_approval' }) });
	await run(c);
	assert.deepEqual(c.calls[0].qs, { id: 'sch-1' });
});

test('plan week sends the brand and the IANA zone, and takes X (a text network)', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'planWeek', platforms: ['x', 'linkedin'], topic: 't', options: { days: 7, brand: { mode: 'list', value: 'b1' }, timezone: 'Europe/Madrid' } },
		answer: () => ok({ ok: true, queued: [] }),
	});
	await run(c);
	assert.equal(c.calls[0].body.brand_id, 'b1');
	assert.equal(c.calls[0].body.timezone, 'Europe/Madrid');
	assert.equal(c.calls[0].body.days, 7);
});

test('Account → Get names the workspace and the role the key acts with (teams)', async () => {
	const c = ctx({
		params: { resource: 'account', operation: 'get', simplify: true },
		answer: () => ok({ email: 'a@b.c', plan: 'pro', usage: {}, brands: {}, connections: [], workspace: { id: 'w1', name: 'Agency' }, member: { role: 'editor', effective_role: 'editor', brand_ids: ['b1'] } }),
	});
	const [out] = await run(c);
	assert.equal(out[0].json.workspace_name, 'Agency');
	assert.equal(out[0].json.role, 'editor');
	assert.deepEqual(out[0].json.brand_ids, ['b1']);
});

test('a key whose team role cannot publish gets the fix, not a bare 403', async () => {
	const c = ctx({
		params: { resource: 'post', operation: 'publish', platforms: ['linkedin'], contentMode: 'text', text: 'hi', mediaSource: 'none', options: {} },
		answer: () => ({ statusCode: 403, body: { error: 'Viewers cannot publish', code: 'role_forbidden' } }),
	});
	await assert.rejects(run(c), (e) => /Viewers cannot publish/.test(e.message) && /Settings → Team/.test(e.description));
});

test('the new refusals (teams, X credits, key limits, queue slots, webhooks) each name the fix', () => {
	for (const code of ['role_forbidden', 'seat_read_only', 'brand_restricted', 'workspace_forbidden', 'x_credits_required', 'x_paid_plan_required', 'x_daily_limit',
		'bad_x_thread', 'key_monthly_cap_reached', 'governance_unavailable', 'no_free_slot', 'bad_timezone', 'ambiguous_brand', 'bad_url', 'too_many', 'webhooks_unavailable', 'too_large'])
		assert.ok(G.describeFailure(code, {}).description.length > 20, code);
});

test('every v2 option list is sorted by name, as the n8n linter requires', () => {
	// Version 1's parameters (LegacyDescription.ts) are frozen and not part of this check.
	const props = new PostWire().description.properties.filter((p) => !(p.displayOptions?.show?.['@version'] || []).includes(1));
	const lists = [];
	const walk = (ps) => {
		for (const p of ps || []) {
			if ((p.type === 'options' || p.type === 'multiOptions') && Array.isArray(p.options)) lists.push([p.name, p.options.map((o) => o.name)]);
			if (p.type === 'collection') walk(p.options);
		}
	};
	walk(props);
	for (const [name, names] of lists) assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)), name);
});
