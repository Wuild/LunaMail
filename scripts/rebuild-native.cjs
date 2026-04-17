#!/usr/bin/env node

const {spawnSync} = require('node:child_process');

function getElectronVersion() {
	try {
		return require('electron/package.json').version;
	} catch (error) {
		console.error('Failed to resolve electron version for native rebuild.');
		console.error(error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

const electronVersion = getElectronVersion();
const npmCliPath = process.env.npm_execpath;
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const args = [
	'rebuild',
	'better-sqlite3',
	'--runtime=electron',
	`--target=${electronVersion}`,
	'--dist-url=https://electronjs.org/headers',
];

const result = npmCliPath
	? spawnSync(process.execPath, [npmCliPath, ...args], {stdio: 'inherit'})
	: spawnSync(npmCommand, args, {stdio: 'inherit', shell: true});

if (result.error) {
	console.error(result.error.message);
	process.exit(1);
}

process.exit(result.status ?? 1);
