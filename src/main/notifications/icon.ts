import {app} from 'electron';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

let cachedNotificationIconPath: string | null | undefined;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function resolveNotificationIconPath(): string | undefined {
    if (cachedNotificationIconPath !== undefined) {
        return cachedNotificationIconPath ?? undefined;
    }
    const candidates = [
        path.join(app.getAppPath(), 'src/resources/llamarun.png'),
        path.join(app.getAppPath(), 'build/llamarun.png'),
        path.join(app.getAppPath(), 'build/icons/512x512.png'),
        path.join(app.getAppPath(), 'src/resources/llama.png'),
        path.join(app.getAppPath(), 'src/resources/luna.png'),
        path.join(__dirname, '../../resources/llamarun.png'),
        path.join(__dirname, '../../resources/llama.png'),
        path.join(__dirname, '../../resources/luna.png'),
        path.join(process.cwd(), 'src/resources/llamarun.png'),
        path.join(process.cwd(), 'build/llamarun.png'),
        path.join(process.cwd(), 'src/resources/llama.png'),
        path.join(process.cwd(), 'src/resources/luna.png'),
    ];
    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
            cachedNotificationIconPath = candidate;
            return candidate;
        }
    }
    cachedNotificationIconPath = null;
    return undefined;
}
