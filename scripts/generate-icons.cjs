const fs = require('node:fs/promises');
const path = require('node:path');
const {execFile} = require('node:child_process');
const {promisify} = require('node:util');
const sharp = require('sharp');

const execFileAsync = promisify(execFile);

const projectRoot = path.resolve(__dirname, '..');
const llamaSource = path.join(projectRoot, 'src', 'resources', 'llama.png');
const llamaTraySource = path.join(projectRoot, 'src', 'resources', 'llamatray.png');
const buildDir = path.join(projectRoot, 'build');
const iconsDir = path.join(buildDir, 'icons');
const appIconOut = path.join(buildDir, 'icon.png');
const trayIconOut = path.join(buildDir, 'lunatray.png');
const appIconIcoOut = path.join(buildDir, 'icon.ico');
const trayIconIcoOut = path.join(buildDir, 'lunatray.ico');

const iconSizes = [16, 32, 48, 64, 128, 256, 512, 1024];

async function ensureSourceFiles() {
    await fs.access(llamaSource);
}

async function ensureDirectories() {
    await fs.mkdir(iconsDir, {recursive: true});
}

async function writeAppIcons() {
    for (const size of iconSizes) {
        const outPath = path.join(iconsDir, `${size}x${size}.png`);
        await sharp(llamaSource).resize(size, size, {fit: 'contain'}).png().toFile(outPath);
    }

    await sharp(llamaSource).resize(1024, 1024, {fit: 'contain'}).png().toFile(appIconOut);
}

async function writeTrayIcon() {
    await sharp(llamaTraySource).resize(64, 64, {fit: 'contain'}).png().toFile(trayIconOut);
}

async function writeWindowsIco() {
    try {
        await execFileAsync('convert', [
            path.join(iconsDir, '16x16.png'),
            path.join(iconsDir, '32x32.png'),
            path.join(iconsDir, '48x48.png'),
            path.join(iconsDir, '64x64.png'),
            path.join(iconsDir, '128x128.png'),
            path.join(iconsDir, '256x256.png'),
            appIconIcoOut,
        ]);
        await execFileAsync('convert', [trayIconOut, trayIconIcoOut]);
    } catch {
        // ImageMagick may not be available in all environments; PNG icons remain as fallback.
    }
}

async function main() {
    await ensureSourceFiles();
    await ensureDirectories();
    await Promise.all([writeAppIcons(), writeTrayIcon()]);
    await writeWindowsIco();
    console.log(`Generated app icons in ${iconsDir}`);
    console.log(`Generated app icon: ${appIconOut}`);
    console.log(`Generated tray icon: ${trayIconOut}`);
    console.log(`Generated Windows app icon: ${appIconIcoOut}`);
    console.log(`Generated Windows tray icon: ${trayIconIcoOut}`);
}

main().catch((error) => {
    console.error('Failed to generate icons:', error);
    process.exit(1);
});
