// n8n loads a node's icon from beside its compiled .js, and tsc does not copy .svg files. The usual
// answer is gulp; this avoids adding a build dependency for a file copy.
//
// Globbed rather than listed: the first version named the two files explicitly and silently left the
// dark-theme variants out of dist the moment they were added, which ships a node whose icon is
// missing on half the installs.
import { cpSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const DIRS = ['nodes/PostWire', 'credentials'];
let n = 0;
for (const dir of DIRS) {
	for (const file of readdirSync(dir)) {
		if (!file.endsWith('.svg') && !file.endsWith('.png')) continue;
		const from = join(dir, file);
		const to = join('dist', dir, file);
		mkdirSync(dirname(to), { recursive: true });
		cpSync(from, to);
		console.log(`  copied ${from} -> ${to}`);
		n++;
	}
}
if (n === 0) {
	console.error('  no icons found to copy — the node would ship without one');
	process.exit(1);
}
