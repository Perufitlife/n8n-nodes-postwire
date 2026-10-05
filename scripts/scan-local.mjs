#!/usr/bin/env node
// Runs n8n's verification scanner (@n8n/scan-community-package) on THIS checkout, before anything is published.
//
// The real scanner only takes a published package: it checks the npm provenance, downloads the source the
// attestation points at and the tarball, and lints both. Provenance can only exist after the GitHub Action publishes,
// but the two lint legs are what fail a verification, and they can run here with the scanner's own code and config:
//   1. the source leg: package.json + nodes/ and credentials/ (.ts), exactly SOURCE_FILE_PATTERNS
//   2. the tarball leg: `npm pack` of this package, compiled .js + the published package.json
//
// The scanner is not a devDependency on purpose: it pins TypeScript 6 (npm:@typescript/typescript6), which npm hoists
// over the TypeScript 5 that `n8n-node build` needs. Install it anywhere else and point SCANNER_DIR at it:
//   npm i --prefix /tmp/n8n-scan @n8n/scan-community-package@latest
//   SCANNER_DIR=/tmp/n8n-scan/node_modules/@n8n/scan-community-package npm run scan:local
// (`npm run build` first: the tarball leg lints dist/.)
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCANNER_DIR = process.env.SCANNER_DIR;
if (!SCANNER_DIR) {
	console.error('Set SCANNER_DIR to an installed @n8n/scan-community-package (see the header of this file).');
	process.exit(2);
}
const scannerPkg = JSON.parse(fs.readFileSync(path.join(SCANNER_DIR, 'package.json'), 'utf8'));
const { analyzePackage, SOURCE_FILE_PATTERNS } = await import(
	pathToFileURL(path.join(SCANNER_DIR, 'scanner', 'scanner.mjs')).href
);
if (!fs.existsSync(path.join(ROOT, 'dist'))) {
	console.error('No dist/ — run `npm run build` first.');
	process.exit(2);
}

// The tarball, as npm would publish it.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pw-n8n-scan-'));
const pack = spawnSync('npm', ['pack', '--pack-destination', tmp, '--silent'], {
	cwd: ROOT,
	encoding: 'utf8',
	shell: process.platform === 'win32',
});
if (pack.status !== 0) {
	console.error(pack.stderr);
	process.exit(2);
}
const tgz = fs.readdirSync(tmp).find((f) => f.endsWith('.tgz'));
const pkgDir = path.join(tmp, 'package');
fs.mkdirSync(pkgDir);
// Relative paths and cwd only: GNU tar on Windows reads "C:\…" as a remote host (the reason the real scanner cannot
// run on Windows at all).
const untar = spawnSync('tar', ['-xzf', path.join('..', tgz), '--strip-components=1'], { cwd: pkgDir, encoding: 'utf8' });
if (untar.status !== 0) {
	console.error(untar.stderr);
	process.exit(2);
}
const files = spawnSync('tar', ['-tzf', tgz], { cwd: tmp, encoding: 'utf8' }).stdout.trim().split('\n');

console.log(`@n8n/scan-community-package ${scannerPkg.version} (lint legs only; provenance is checked after the CI publish)`);
console.log(`tarball ${tgz}: ${files.length} files`);
const source = await analyzePackage(ROOT, SOURCE_FILE_PATTERNS);
console.log(`source  (${SOURCE_FILE_PATTERNS.join(', ')}): ${source.passed ? 'PASSED' : 'FAILED'}`);
if (source.details) console.log(source.details);
const dist = await analyzePackage(pkgDir, ['**/*.js', 'package.json']);
console.log(`tarball (**/*.js, package.json): ${dist.passed ? 'PASSED' : 'FAILED'}`);
if (dist.details) console.log(dist.details);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(source.passed && dist.passed ? 0 : 1);
