import {useEffect, useMemo, useState} from 'react';
import type {AutoUpdateState} from '../../../preload';
import {ipcClient} from '../../lib/ipcClient';
import {DEFAULT_AUTO_UPDATE_STATE} from '../../lib/autoUpdateState';
import {useIpcEvent} from './useIpcEvent';

export function useAutoUpdateState() {
    const [state, setState] = useState<AutoUpdateState>(DEFAULT_AUTO_UPDATE_STATE);

    useEffect(() => {
        let active = true;
        void ipcClient
            .getAutoUpdateState()
            .then((next) => {
                if (!active) return;
                setState(next);
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, []);

    useIpcEvent(ipcClient.onAutoUpdateStatus, (next) => {
        setState(next);
    });

    return useMemo(
        () => ({
            state,
            setState,
            appVersion: state.currentVersion || 'unknown',
            autoUpdatePhase: state.phase,
            autoUpdateMessage: state.message ?? null,
        }),
        [state],
    );
}
