#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src');
const MAX_FILE_LINES = 2000;
const TARGET_EXTENSIONS = new Set(['.ts', '.tsx']);
const DIRECT_EVENT_PATTERN = /window\.electronAPI\.on[A-Z][A-Za-z0-9_]*(?:\?\.)?\s*\(/g;
const FORBIDDEN_RENDERER_COLOR_PATTERNS = [
    {
        name: 'dark-color-utility',
        regex: /\bdark:(?:bg|text|border|ring|fill|stroke)-[^\s"'`]+/g,
    },
    {
        name: 'tailwind-bracket-var-color',
        regex: /\b(?:bg|text|border|ring|fill|stroke)-\[var\(--[^\]]+\)\]/g,
    },
    {
        name: 'tailwind-palette-color-utility',
        regex: /\b(?:bg|text|border|ring|fill|stroke)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white)(?:-[0-9]{2,3}(?:\/[0-9]{1,3})?|\/[0-9]{1,3})?\b/g,
    },
];
const EVENT_ALLOWLIST = new Set([
    normalizePath('src/renderer/hooks/ipc/useIpcEvent.ts'),
    normalizePath('src/renderer/lib/ipcClient.ts'),
]);
const LEGACY_ROUTE_MODULE_PREFIXES = ['src/renderer/pages/', 'src/renderer/routes/'];
const LEGACY_ROUTE_MODULE_ALLOWLIST = new Set([
    normalizePath('src/renderer/pages/AppSettingsFormParts.tsx'),
    normalizePath('src/renderer/pages/AppSettingsGeneralPanel.tsx'),
    normalizePath('src/renderer/pages/AppSettingsPage.tsx'),
    normalizePath('src/renderer/pages/ComposeEmailPage.tsx'),
    normalizePath('src/renderer/pages/MailPage.tsx'),
    normalizePath('src/renderer/pages/MessageWindowPage.tsx'),
    normalizePath('src/renderer/pages/SettingsAddAccount.tsx'),
    normalizePath('src/renderer/pages/SplashScreenPage.tsx'),
    normalizePath('src/renderer/pages/appSettingsMailFilterHelpers.ts'),
    normalizePath('src/renderer/pages/mailAccountOrder.ts'),
    normalizePath('src/renderer/pages/mailPageHelpers.ts'),
    normalizePath('src/renderer/pages/settings/tabs/AccountSettingsTab.tsx'),
    normalizePath('src/renderer/pages/settings/tabs/AllowlistSettingsTab.tsx'),
    normalizePath('src/renderer/pages/settings/tabs/DeveloperSettingsTab.tsx'),
    normalizePath('src/renderer/pages/settings/tabs/LayoutSettingsTab.tsx'),
    normalizePath('src/renderer/routes/MainWindowRoutes.tsx'),
    normalizePath('src/renderer/routes/mainWindowRouteContext.ts'),
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
    const forbiddenRendererColorUsages = [];
    const unexpectedLegacyRouteModules = [];

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

        if (relative.startsWith('src/renderer/')) {
            for (const pattern of FORBIDDEN_RENDERER_COLOR_PATTERNS) {
                let match = pattern.regex.exec(raw);
                while (match) {
                    forbiddenRendererColorUsages.push({
                        relative,
                        rule: pattern.name,
                        token: match[0],
                    });
                    match = pattern.regex.exec(raw);
                }
                pattern.regex.lastIndex = 0;
            }
        }

        if (
            LEGACY_ROUTE_MODULE_PREFIXES.some((prefix) => relative.startsWith(prefix)) &&
            !LEGACY_ROUTE_MODULE_ALLOWLIST.has(relative)
        ) {
            unexpectedLegacyRouteModules.push(relative);
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

    if (forbiddenRendererColorUsages.length > 0) {
        hasError = true;
        console.error(
            '[architecture-check] Found forbidden renderer color utilities. Use semantic classes/tokens instead.',
        );
        const grouped = new Map();
        for (const usage of forbiddenRendererColorUsages) {
            const key = `${usage.relative}::${usage.rule}`;
            const existing = grouped.get(key) || {count: 0, samples: new Set()};
            existing.count += 1;
            if (existing.samples.size < 3) existing.samples.add(usage.token);
            grouped.set(key, existing);
        }
        [...grouped.entries()]
            .sort((a, b) => b[1].count - a[1].count)
            .forEach(([key, info]) => {
                const [file, rule] = key.split('::');
                console.error(`  - ${file} [${rule}] x${info.count}`);
                for (const sample of info.samples) {
                    console.error(`      ${sample}`);
                }
            });
    } else {
        console.log('[architecture-check] Renderer color utility guard passed.');
    }

    if (unexpectedLegacyRouteModules.length > 0) {
        hasError = true;
        console.error(
            '[architecture-check] Found new legacy route/page modules. Create route modules under src/renderer/app/** instead.',
        );
        unexpectedLegacyRouteModules
            .sort((a, b) => a.localeCompare(b))
            .forEach((relative) => console.error(`  - ${relative}`));
    } else {
        console.log('[architecture-check] Legacy route/page guard passed.');
    }

    if (hasError) process.exit(1);
}

main();
