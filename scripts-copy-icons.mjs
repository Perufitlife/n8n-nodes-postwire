// n8n loads a node's icon from beside its compiled .js, and tsc does not copy .svg files. The usual
// answer is gulp; a dozen lines avoids adding a build dependency for one file copy.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
for (const f of ['nodes/PostWire/postwire.svg', 'credentials/postwire.svg']) {
  mkdirSync(dirname(`dist/${f}`), { recursive: true });
  cpSync(f, `dist/${f}`);
  console.log(`  copied ${f} -> dist/${f}`);
}
