import {useEffect, useState} from 'react';
import {ipcClient} from '../../lib/ipcClient';

export function useWindowControlsState() {
    const [isMaximized, setIsMaximized] = useState(false);

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
        refreshMaximizedState();
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
        toggleMaximize,
        minimize,
        close,
    };
}
