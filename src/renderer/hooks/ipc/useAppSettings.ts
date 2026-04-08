import React, {useCallback} from 'react';
import {useQuery, useQueryClient} from '@tanstack/react-query';
import type {AppSettings} from '../../../preload';
import {ipcClient} from '../../lib/ipcClient';
import {useIpcEvent} from './useIpcEvent';

export function useAppSettings(defaultSettings: AppSettings) {
    const queryClient = useQueryClient();
    const appSettingsQuery = useQuery({
        queryKey: ['app-settings'],
        queryFn: () => ipcClient.getAppSettings(),
        initialData: defaultSettings,
        refetchOnMount: 'always',
    });
    const appSettings = appSettingsQuery.data;
    const setAppSettings = useCallback(
        (value: React.SetStateAction<AppSettings>) => {
            queryClient.setQueryData<AppSettings>(['app-settings'], (prev) =>
                typeof value === 'function'
                    ? (value as (current: AppSettings) => AppSettings)(prev ?? defaultSettings)
                    : value,
            );
        },
        [defaultSettings, queryClient],
    );

    useIpcEvent(ipcClient.onAppSettingsUpdated, (settings) => {
        queryClient.setQueryData(['app-settings'], settings);
    });

    return {
        appSettings,
        setAppSettings,
        isFetched: appSettingsQuery.isFetched,
    };
}
