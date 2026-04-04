import {useEffect, useState} from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';

function applyTheme(theme: ThemePreference, prefersDark: boolean): void {
    const useDark = theme === 'dark' || (theme === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', useDark);
    document.body.classList.toggle('dark', useDark);
}

export function useThemePreference(theme: ThemePreference): void {
    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const update = () => applyTheme(theme, media.matches);
        update();
        media.addEventListener('change', update);
        return () => {
            media.removeEventListener('change', update);
        };
    }, [theme]);
}

export function useAppTheme(defaultTheme: ThemePreference = 'system'): ThemePreference {
    const [theme, setTheme] = useState<ThemePreference>(defaultTheme);

    useEffect(() => {
        let active = true;
        window.electronAPI.getAppSettings()
            .then((settings) => {
                if (!active) return;
                setTheme((settings?.theme as ThemePreference) ?? defaultTheme);
            })
            .catch(() => {
                if (!active) return;
                setTheme(defaultTheme);
            });

        const off = window.electronAPI.onAppSettingsUpdated?.((settings) => {
            setTheme((settings?.theme as ThemePreference) ?? defaultTheme);
        });

        return () => {
            active = false;
            if (typeof off === 'function') off();
        };
    }, [defaultTheme]);

    useThemePreference(theme);
    return theme;
}
