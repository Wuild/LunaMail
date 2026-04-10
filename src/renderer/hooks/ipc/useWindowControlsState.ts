import {useEffect, useState} from 'react';
import {ipcClient} from '@renderer/lib/ipcClient';
import type {WindowControlsCapabilities} from '@/preload';

export function useWindowControlsState() {
    const [isMaximized, setIsMaximized] = useState(false);
    const [capabilities, setCapabilities] = useState<WindowControlsCapabilities>({
        minimizable: true,
        maximizable: true,
    });

    useEffect(() => {
        let active = true;
        const refreshMaximizedState = () => {
            void ipcClient
                .isWindowMaximized()
                .then((value) => {
                    if (!active) return;
                    setIsMaximized(Boolean(value));
                })
                .catch(() => undefined);
        };
        const refreshCapabilities = () => {
            void ipcClient
                .getWindowControlsCapabilities()
                .then((value) => {
                    if (!active) return;
                    setCapabilities({
                        minimizable: Boolean(value?.minimizable),
                        maximizable: Boolean(value?.maximizable),
                    });
                })
                .catch(() => undefined);
        };
        refreshMaximizedState();
        refreshCapabilities();
        window.addEventListener('resize', refreshMaximizedState);
        return () => {
            active = false;
            window.removeEventListener('resize', refreshMaximizedState);
        };
    }, []);

    const toggleMaximize = () =>
        ipcClient
            .toggleMaximizeWindow()
            .then((res) => {
                setIsMaximized(Boolean(res?.isMaximized));
                return res;
            })
            .catch(() => undefined);

    const minimize = () => ipcClient.minimizeWindow().catch(() => undefined);
    const close = () => ipcClient.closeWindow().catch(() => undefined);

    return {
        isMaximized,
        capabilities,
        toggleMaximize,
        minimize,
        close,
    };
}
