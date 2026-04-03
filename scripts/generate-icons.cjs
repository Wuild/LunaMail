const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

const projectRoot = path.resolve(__dirname, '..');
const lunaSource = path.join(projectRoot, 'src', 'resources', 'luna.png');
const lunaTraySource = path.join(projectRoot, 'src', 'resources', 'lunatray.png');
const buildDir = path.join(projectRoot, 'build');
const iconsDir = path.join(buildDir, 'icons');
const appIconOut = path.join(buildDir, 'icon.png');
const trayIconOut = path.join(buildDir, 'lunatray.png');

const iconSizes = [16, 32, 48, 64, 128, 256, 512, 1024];

async function ensureSourceFiles() {
    await fs.access(lunaSource);
    await fs.access(lunaTraySource);
}

async function ensureDirectories() {
    await fs.mkdir(iconsDir, {recursive: true});
}

async function writeAppIcons() {
    for (const size of iconSizes) {
        const outPath = path.join(iconsDir, `${size}x${size}.png`);
        await sharp(lunaSource)
            .resize(size, size, {fit: 'contain'})
            .png()
            .toFile(outPath);
    }

    await sharp(lunaSource)
        .resize(1024, 1024, {fit: 'contain'})
        .png()
        .toFile(appIconOut);
}

async function writeTrayIcon() {
    await sharp(lunaTraySource)
        .resize(64, 64, {fit: 'contain'})
        .png()
        .toFile(trayIconOut);
}

async function main() {
    await ensureSourceFiles();
    await ensureDirectories();
    await Promise.all([writeAppIcons(), writeTrayIcon()]);
    console.log(`Generated app icons in ${iconsDir}`);
    console.log(`Generated app icon: ${appIconOut}`);
    console.log(`Generated tray icon: ${trayIconOut}`);
}

main().catch((error) => {
    console.error('Failed to generate icons:', error);
    process.exit(1);
});
