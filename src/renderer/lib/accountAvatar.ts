import type {PublicAccount} from "../../preload";

export function getAccountMonogram(account: PublicAccount): string {
    const base = (account.display_name?.trim() || account.email || "").trim();
    if (!base) return "?";
    const words = base.split(/[\s._-]+/).filter(Boolean);
    if (words.length >= 2) {
        return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
    }
    return (words[0] || base).slice(0, 2).toUpperCase();
}

export function getAccountAvatarColors(seed: string): { background: string; foreground: string } {
    const hash = hashString(seed.trim().toLowerCase() || "account");
    const hue = hash % 360;
    const saturation = 58 + (hash % 15);
    const lightness = 44 + (Math.floor(hash / 11) % 12);
    const background = `hsl(${hue} ${saturation}% ${lightness}%)`;

    const [r, g, b] = hslToRgb(hue, saturation, lightness);
    const whiteContrast = contrastRatio([r, g, b], [255, 255, 255]);
    const darkContrast = contrastRatio([r, g, b], [15, 23, 42]);
    const foreground = whiteContrast >= darkContrast ? "#ffffff" : "#0f172a";
    return {background, foreground};
}

function hashString(value: string): number {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
    const sat = s / 100;
    const light = l / 100;
    const c = (1 - Math.abs(2 * light - 1)) * sat;
    const hp = (((h % 360) + 360) % 360) / 60;
    const x = c * (1 - Math.abs((hp % 2) - 1));

    let r1 = 0;
    let g1 = 0;
    let b1 = 0;
    if (hp >= 0 && hp < 1) {
        r1 = c;
        g1 = x;
    } else if (hp < 2) {
        r1 = x;
        g1 = c;
    } else if (hp < 3) {
        g1 = c;
        b1 = x;
    } else if (hp < 4) {
        g1 = x;
        b1 = c;
    } else if (hp < 5) {
        r1 = x;
        b1 = c;
    } else {
        r1 = c;
        b1 = x;
    }

    const m = light - c / 2;
    return [Math.round((r1 + m) * 255), Math.round((g1 + m) * 255), Math.round((b1 + m) * 255)];
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
    const toLinear = (channel: number) => {
        const c = channel / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    const rl = toLinear(r);
    const gl = toLinear(g);
    const bl = toLinear(b);
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
}

function contrastRatio(a: [number, number, number], b: [number, number, number]): number {
    const la = relativeLuminance(a);
    const lb = relativeLuminance(b);
    const lighter = Math.max(la, lb);
    const darker = Math.min(la, lb);
    return (lighter + 0.05) / (darker + 0.05);
}
