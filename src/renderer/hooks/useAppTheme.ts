import {useEffect, useState} from 'react';
import {useIpcEvent} from './ipc/useIpcEvent';
import {ipcClient} from '../lib/ipcClient';
import type {AppTheme} from '../../shared/ipcTypes';

export type ThemePreference = AppTheme;

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
        ipcClient
            .getAppSettings()
            .then((settings) => {
                if (!active) return;
                setTheme((settings?.theme as ThemePreference) ?? defaultTheme);
            })
            .catch(() => {
                if (!active) return;
                setTheme(defaultTheme);
            });

        return () => {
            active = false;
        };
    }, [defaultTheme]);

    useIpcEvent(ipcClient.onAppSettingsUpdated, (settings) => {
        setTheme((settings?.theme as ThemePreference) ?? defaultTheme);
    });

    useThemePreference(theme);
    return theme;
}
