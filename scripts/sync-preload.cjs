const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const builtPreloadPath = path.join(projectRoot, 'build', 'preload', 'index.js');
const targetPreloadPath = path.join(projectRoot, 'preload.cjs');

function normalizePreloadSource(input) {
    const electronImportPattern = /import\s*\{\s*([^}]+)\s*\}\s*from\s*'electron';/;
    const match = input.match(electronImportPattern);
    if (!match) {
        throw new Error('Unexpected build/preload/index.js format: missing electron import');
    }
    const importedSymbols = match[1]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);
    if (!importedSymbols.includes('contextBridge') || !importedSymbols.includes('ipcRenderer')) {
        throw new Error('Unexpected build/preload/index.js format: missing required electron imports');
    }
    const requireLine = `const {${importedSymbols.join(', ')}} = require('electron');`;
    return input.replace(electronImportPattern, requireLine);
}

function main() {
    if (!fs.existsSync(builtPreloadPath)) {
        throw new Error(`Missing ${builtPreloadPath}. Run TypeScript build first.`);
    }
    const source = fs.readFileSync(builtPreloadPath, 'utf8');
    const normalized = normalizePreloadSource(source);
    const existing = fs.existsSync(targetPreloadPath) ? fs.readFileSync(targetPreloadPath, 'utf8') : null;
    if (existing === normalized) {
        console.log(`Preload bridge already up to date: ${targetPreloadPath}`);
        return;
    }
    fs.writeFileSync(targetPreloadPath, normalized);
    console.log(`Synced preload bridge: ${targetPreloadPath}`);
}

try {
    main();
} catch (error) {
    console.error('Failed to sync preload bridge:', error.message || error);
    process.exit(1);
}
