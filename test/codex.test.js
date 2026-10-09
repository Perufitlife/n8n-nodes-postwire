// The codex is what n8n's nodes panel (and its AI workflow builder) searches besides the node name:
// `codex.alias` is a search key. Without these words, typing "tiktok" or "instagram" in n8n never shows PostWire.
//
// It lives in two places that must say the same thing:
// - INLINE in the node's description (PostWire.node.ts). n8n's catalog of verified community nodes
//   (api.n8n.io/api/community-nodes, what n8n Cloud's panel searches) is built from the description alone: with the
//   aliases only in the .node.json (0.4.2) the catalog listed the node with `codex: {}` — checked 9-oct-2026, while
//   n8n-nodes-guni and n8n-nodes-htmlcsstopdf, whose aliases do show, carry the codex inline in dist/…/X.node.js.
// - The .node.json next to it, which self-hosted n8n loads and assigns over the description's codex.
// Run against dist/ (`npm run build` first).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CATEGORIES = [
	'Data & Storage', 'Finance & Accounting', 'Marketing & Content', 'Productivity', 'Miscellaneous',
	'Sales', 'Development', 'Analytics', 'Communication', 'Utility',
];
const ROOT = path.join(__dirname, '..');
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

const NODES = [
	{ json: 'nodes/PostWire/PostWire.node.json', node: 'n8n-nodes-postwire.postWire', dist: 'dist/nodes/PostWire/PostWire.node.js', cls: 'PostWire' },
	{ json: 'nodes/PostWireTrigger/PostWireTrigger.node.json', node: 'n8n-nodes-postwire.postWireTrigger', dist: 'dist/nodes/PostWireTrigger/PostWireTrigger.node.js', cls: 'PostWireTrigger' },
];

// What the description's codex can carry (n8n-workflow CodexData); node, nodeVersion and codexVersion belong to the file.
const inlinePart = (c) => {
	const out = {};
	for (const k of ['categories', 'subcategories', 'alias', 'resources']) if (c[k] !== undefined) out[k] = c[k];
	return out;
};

for (const { json, node, dist, cls } of NODES) {
	test(`codex ${json}: valid fields and categories`, () => {
		const c = read(json);
		assert.strictEqual(c.node, node);
		assert.strictEqual(c.nodeVersion, '1.0');
		assert.strictEqual(c.codexVersion, '1.0');
		for (const cat of c.categories) assert.ok(CATEGORIES.includes(cat), `unknown category ${cat}`);
		for (const cat of Object.keys(c.subcategories || {})) assert.ok(c.categories.includes(cat), `subcategory of a category the node is not in: ${cat}`);
		const allowed = ['node', 'nodeVersion', 'codexVersion', 'categories', 'subcategories', 'resources', 'alias'];
		for (const k of Object.keys(c)) assert.ok(allowed.includes(k), `unexpected codex field ${k}`);
		assert.ok(Array.isArray(c.alias) && c.alias.length > 0);
		assert.strictEqual(new Set(c.alias.map((a) => a.toLowerCase())).size, c.alias.length, 'duplicate alias');
	});

	test(`codex ${cls}: the compiled node carries it inline, equal to ${path.basename(json)}`, () => {
		const Node = require(path.join(ROOT, dist))[cls];
		const codex = new Node().description.codex;
		assert.ok(codex && Array.isArray(codex.alias) && codex.alias.length, 'description.codex.alias missing in dist');
		assert.deepStrictEqual(codex, inlinePart(read(json)), `the inline codex and ${json} differ — change both`);
		// Literally in the file, not pulled from the .node.json at load time: the catalog must see it without that file.
		const src = fs.readFileSync(path.join(ROOT, dist), 'utf8');
		assert.match(src, /codex:\s*\{/, 'codex is not written inline in the compiled file');
		assert.doesNotMatch(src, /\.node\.json/, 'the compiled node must not read its .node.json');
		for (const a of codex.alias) assert.ok(src.includes(JSON.stringify(a).slice(1, -1)), `alias "${a}" not literally in ${dist}`);
	});
}

test('codex: the networks people search for find the PostWire node', () => {
	const alias = read('nodes/PostWire/PostWire.node.json').alias.map((a) => a.toLowerCase());
	for (const q of ['tiktok', 'instagram', 'reels', 'shorts', 'youtube', 'youtube shorts', 'linkedin', 'facebook', 'social media', 'post', 'publish', 'schedule post', 'auto post'])
		assert.ok(alias.includes(q), `alias missing "${q}"`);
	// The destinations added in 0.4.3.
	for (const q of ['wordpress', 'dev.to', 'hashnode', 'nostr']) assert.ok(alias.includes(q), `alias missing "${q}"`);
	assert.ok(alias.some((a) => a.startsWith('slack')), 'alias missing Slack');
	// Only networks PostWire publishes to: an alias for one it does not would send people to a dead end.
	for (const q of ['threads', 'pinterest', 'reddit']) assert.ok(!alias.some((a) => a.split(/\s+/).includes(q)), `alias must not promise "${q}"`);
});

test('codex: every network the node offers is one people can find it by', () => {
	const G = require(path.join(ROOT, 'dist/nodes/PostWire/GenericFunctions.js'));
	const alias = read('nodes/PostWire/PostWire.node.json').alias.map((a) => a.toLowerCase());
	const searchable = (name) => alias.some((a) => a.includes(name.toLowerCase().replace(/ \(twitter\)$/, '')) || (name === 'X (Twitter)' && a === 'twitter'));
	for (const p of G.PLATFORMS.filter((n) => n.value !== 'reddit')) assert.ok(searchable(p.name), `no alias finds ${p.name}`);
});
