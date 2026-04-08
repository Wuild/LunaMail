#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const MAX_FILE_LINES = 2000;
const TARGET_EXTENSIONS = new Set(['.ts', '.tsx']);
const DIRECT_EVENT_PATTERN = /window\.electronAPI\.on[A-Z][A-Za-z0-9_]*(?:\?\.)?\s*\(/g;
const EVENT_ALLOWLIST = new Set([
    normalizePath('src/renderer/hooks/ipc/useIpcEvent.ts'),
    normalizePath('src/renderer/lib/ipcClient.ts'),
]);

function normalizePath(filePath) {
    return filePath.split(path.sep).join('/');
}

function collectFiles(dirPath, out) {
    const entries = fs.readdirSync(dirPath, {withFileTypes: true});
    for (const entry of entries) {
        if (entry.name === 'node_modules' || entry.name === 'build' || entry.name === 'dist') continue;
        const abs = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            collectFiles(abs, out);
            continue;
        }
        const ext = path.extname(entry.name);
        if (!TARGET_EXTENSIONS.has(ext)) continue;
        out.push(abs);
    }
}

function countLines(content) {
    if (!content) return 0;
    return content.split('\n').length;
}

function main() {
    const files = [];
    collectFiles(SRC_DIR, files);

    const oversized = [];
    const directEventUsages = [];

    for (const file of files) {
        const raw = fs.readFileSync(file, 'utf8');
        const lines = countLines(raw);
        const relative = normalizePath(path.relative(ROOT, file));

        if (lines > MAX_FILE_LINES) {
            oversized.push({relative, lines});
        }

        if (!EVENT_ALLOWLIST.has(relative)) {
            let match = DIRECT_EVENT_PATTERN.exec(raw);
            while (match) {
                directEventUsages.push({relative, index: match.index});
                match = DIRECT_EVENT_PATTERN.exec(raw);
            }
            DIRECT_EVENT_PATTERN.lastIndex = 0;
        }
    }

    let hasError = false;
    if (oversized.length > 0) {
        hasError = true;
        console.error(`[architecture-check] Found files above ${MAX_FILE_LINES} lines:`);
        oversized
            .sort((a, b) => b.lines - a.lines)
            .forEach((item) => console.error(`  - ${item.relative}: ${item.lines} lines`));
    } else {
        console.log(`[architecture-check] Large file check passed (max ${MAX_FILE_LINES} lines).`);
    }

    if (directEventUsages.length > 0) {
        console.warn(
            '[architecture-check] Warning: direct `window.electronAPI.on...` usage found outside shared IPC hooks/client.',
        );
        const grouped = new Map();
        for (const usage of directEventUsages) {
            grouped.set(usage.relative, (grouped.get(usage.relative) || 0) + 1);
        }
        [...grouped.entries()]
            .sort((a, b) => b[1] - a[1])
            .forEach(([file, count]) => console.warn(`  - ${file}: ${count} occurrence(s)`));
    } else {
        console.log('[architecture-check] Event boilerplate check passed.');
    }

    if (hasError) process.exit(1);
}

main();
