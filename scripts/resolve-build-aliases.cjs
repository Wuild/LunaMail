const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const buildRoot = path.join(projectRoot, 'build');

const aliasRoots = {
    '@/': buildRoot,
    '@main/': path.join(buildRoot, 'main'),
    '@renderer/': path.join(buildRoot, 'renderer'),
    '@resource/': path.join(buildRoot, 'resources'),
};

function toPosix(value) {
    return value.replace(/\\/g, '/');
}

function ensureRelative(value) {
    if (value.startsWith('.')) return value;
    return `./${value}`;
}

function resolveAliasTarget(specifier) {
    for (const [prefix, rootPath] of Object.entries(aliasRoots)) {
        if (!specifier.startsWith(prefix)) continue;
        const relativePath = specifier.slice(prefix.length);
        const directPath = path.join(rootPath, relativePath);
        if (fs.existsSync(directPath)) {
            const stat = fs.statSync(directPath);
            if (stat.isDirectory()) {
                const indexPath = path.join(directPath, 'index.js');
                if (fs.existsSync(indexPath)) return indexPath;
            }
            return directPath;
        }
        if (!path.extname(directPath) && fs.existsSync(`${directPath}.js`)) return `${directPath}.js`;
        return directPath;
    }
    return null;
}

function rewriteFile(filePath) {
    let source = fs.readFileSync(filePath, 'utf8');
    let replacements = 0;

    const rewrite = (full, before, specifier, after) => {
        const target = resolveAliasTarget(specifier);
        if (!target) return full;
        const relativeTarget = ensureRelative(toPosix(path.relative(path.dirname(filePath), target)));
        replacements += 1;
        return `${before}${relativeTarget}${after}`;
    };

    source = source.replace(
        /(from\s+['"])(@\/[^'"]+|@main\/[^'"]+|@renderer\/[^'"]+|@resource\/[^'"]+)(['"])/g,
        rewrite,
    );
    source = source.replace(
        /(import\(\s*['"])(@\/[^'"]+|@main\/[^'"]+|@renderer\/[^'"]+|@resource\/[^'"]+)(['"]\s*\))/g,
        rewrite,
    );

    if (replacements > 0) {
        fs.writeFileSync(filePath, source);
    }
    return replacements;
}

function walkJsFiles(directory, acc = []) {
    if (!fs.existsSync(directory)) return acc;
    const entries = fs.readdirSync(directory, {withFileTypes: true});
    for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) {
            walkJsFiles(fullPath, acc);
            continue;
        }
        if (entry.isFile() && fullPath.endsWith('.js')) {
            acc.push(fullPath);
        }
    }
    return acc;
}

function main() {
    if (!fs.existsSync(buildRoot)) {
        console.log('No build directory found. Skipping alias rewrite.');
        return;
    }
    const targetDirs = [path.join(buildRoot, 'main'), path.join(buildRoot, 'preload'), path.join(buildRoot, 'tests')];
    const files = targetDirs.flatMap((dir) => walkJsFiles(dir));
    let replacementCount = 0;
    for (const filePath of files) {
        replacementCount += rewriteFile(filePath);
    }
    if (replacementCount === 0) {
        console.log('Build alias rewrite: no alias imports found.');
        return;
    }
    console.log(`Build alias rewrite: updated ${replacementCount} import specifier(s).`);
}

try {
    main();
} catch (error) {
    console.error('Failed to rewrite build aliases:', error.message || error);
    process.exit(1);
}
