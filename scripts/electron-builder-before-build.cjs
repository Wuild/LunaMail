const fs = require("node:fs");
const path = require("node:path");

function isSubPath(parent, candidate) {
    const rel = path.relative(parent, candidate);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

module.exports = async function beforeBuild() {
    const projectRoot = process.cwd();
    const stageRoot = path.join(projectRoot, ".electron-builder-prod-node_modules");
    const stageNodeModules = path.join(stageRoot, "node_modules");
    const sourceNodeModules = path.join(projectRoot, "node_modules");

    if (!fs.existsSync(sourceNodeModules)) {
        throw new Error("node_modules not found. Run npm install before packaging.");
    }

    fs.rmSync(stageRoot, {recursive: true, force: true});
    fs.mkdirSync(stageNodeModules, {recursive: true});

    const rootPkg = JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8"));
    const rootDeps = Object.keys(rootPkg.dependencies || {});
    const visited = new Set();
    const queue = [];
    const discovered = [];

    function findPackageDirFromResolvedFile(resolvedFile) {
        let current = path.dirname(resolvedFile);
        const rootPath = path.parse(current).root;
        while (current !== rootPath) {
            const pkgJsonPath = path.join(current, "package.json");
            if (fs.existsSync(pkgJsonPath)) return current;
            current = path.dirname(current);
        }
        return null;
    }

    function resolvePackageDir(fromDir, packageName) {
        try {
            const pkgJsonEntry = require.resolve(`${packageName}/package.json`, {paths: [fromDir]});
            return path.dirname(pkgJsonEntry);
        } catch {
            try {
                const resolvedEntry = require.resolve(packageName, {paths: [fromDir]});
                return findPackageDirFromResolvedFile(resolvedEntry);
            } catch {
                return null;
            }
        }
    }

    for (const depName of rootDeps) {
        queue.push({fromDir: projectRoot, depName});
    }

    while (queue.length > 0) {
        const next = queue.shift();
        if (!next) break;
        const pkgDir = resolvePackageDir(next.fromDir, next.depName);
        if (!pkgDir || !pkgDir.startsWith(sourceNodeModules)) continue;
        const realPkgDir = fs.realpathSync(pkgDir);
        if (visited.has(realPkgDir)) continue;
        visited.add(realPkgDir);
        discovered.push(realPkgDir);

        const manifestPath = path.join(realPkgDir, "package.json");
        if (!fs.existsSync(manifestPath)) continue;
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        const childDeps = Object.keys({
            ...(manifest.dependencies || {}),
            ...(manifest.optionalDependencies || {}),
        });
        for (const depName of childDeps) {
            queue.push({fromDir: realPkgDir, depName});
        }
    }

    discovered.sort((a, b) => a.length - b.length);

    const selected = [];
    for (const depPath of discovered) {
        if (selected.some((parent) => isSubPath(parent, depPath))) continue;
        selected.push(depPath);
    }

    for (const sourcePath of selected) {
        const relativePath = path.relative(projectRoot, sourcePath);
        const targetPath = path.join(stageRoot, relativePath);
        fs.mkdirSync(path.dirname(targetPath), {recursive: true});
        fs.cpSync(sourcePath, targetPath, {
            recursive: true,
            dereference: false,
            force: true,
            preserveTimestamps: true,
        });
    }

    console.log(`Prepared production node_modules stage: ${selected.length} directories`);

    return false;
};
