// The codex file is what n8n's nodes panel (and its AI workflow builder) searches besides the node name:
// `codex.alias` is a search key. Without these words, typing "tiktok" or "instagram" in n8n never shows PostWire.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const CATEGORIES = [
	'Data & Storage', 'Finance & Accounting', 'Marketing & Content', 'Productivity', 'Miscellaneous',
	'Sales', 'Development', 'Analytics', 'Communication', 'Utility',
];
const read = (rel) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'));

for (const [file, node] of [
	['nodes/PostWire/PostWire.node.json', 'n8n-nodes-postwire.postWire'],
	['nodes/PostWireTrigger/PostWireTrigger.node.json', 'n8n-nodes-postwire.postWireTrigger'],
]) {
	test(`codex ${file}: valid fields and categories`, () => {
		const c = read(file);
		assert.strictEqual(c.node, node);
		assert.strictEqual(c.nodeVersion, '1.0');
		assert.strictEqual(c.codexVersion, '1.0');
		for (const cat of c.categories) assert.ok(CATEGORIES.includes(cat), `unknown category ${cat}`);
		const allowed = ['node', 'nodeVersion', 'codexVersion', 'categories', 'subcategories', 'resources', 'alias'];
		for (const k of Object.keys(c)) assert.ok(allowed.includes(k), `unexpected codex field ${k}`);
		assert.ok(Array.isArray(c.alias) && c.alias.length > 0);
		assert.strictEqual(new Set(c.alias.map((a) => a.toLowerCase())).size, c.alias.length, 'duplicate alias');
	});
}

test('codex: the networks people search for find the PostWire node', () => {
	const alias = read('nodes/PostWire/PostWire.node.json').alias.map((a) => a.toLowerCase());
	for (const q of ['tiktok', 'instagram', 'reels', 'youtube', 'youtube shorts', 'linkedin', 'facebook', 'social media', 'post', 'publish', 'schedule post'])
		assert.ok(alias.includes(q), `alias missing "${q}"`);
	// Only networks PostWire publishes to: an alias for one it does not would send people to a dead end.
	for (const q of ['threads', 'pinterest', 'reddit']) assert.ok(!alias.includes(q), `alias must not promise "${q}"`);
});
