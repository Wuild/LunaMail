const {spawnSync} = require('node:child_process');

function run(command, args) {
    const result = spawnSync(command, args, {stdio: 'inherit'});
    if (result.error) {
        throw result.error;
    }
    if (typeof result.status === 'number' && result.status !== 0) {
        process.exit(result.status);
    }
}

if (process.platform !== 'darwin') {
    console.error('macOS packaging is only supported on macOS runners (darwin).');
    console.error('Use the GitHub Actions release workflow to publish macOS artifacts from CI.');
    process.exit(1);
}

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCommand = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const archArgs = process.argv.slice(2);

run(npmCommand, ['run', 'build']);
run(npxCommand, ['electron-builder', '--mac', ...archArgs]);
