import {useEffect, useRef} from 'react';

type UseComposeWindowGuardsParams = {
    isComposeDirty: boolean;
    sending: boolean;
    setOnRequestClose: (onRequestClose?: (() => boolean) | null) => void;
    saveDraftBeforeClose: () => Promise<void>;
};

export function useComposeWindowGuards({
                                           isComposeDirty,
                                           sending,
                                           setOnRequestClose,
                                           saveDraftBeforeClose,
                                       }: UseComposeWindowGuardsParams): void {
    const allowWindowCloseRef = useRef(false);

    useEffect(() => {
        setOnRequestClose(() => {
            const confirmed = window.confirm(
                isComposeDirty
                    ? 'Close this composer window? Your draft will be saved before closing.'
                    : 'Close this composer window?',
            );
            if (!confirmed) return false;
            if (!sending && isComposeDirty) {
                void saveDraftBeforeClose();
            }
            allowWindowCloseRef.current = true;
            return true;
        });
        return () => {
            setOnRequestClose(undefined);
        };
    }, [isComposeDirty, saveDraftBeforeClose, sending, setOnRequestClose]);

    useEffect(() => {
        const onBeforeUnload = (event: BeforeUnloadEvent) => {
            if (allowWindowCloseRef.current) return;
            if (sending || !isComposeDirty) return;
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', onBeforeUnload);
        return () => {
            window.removeEventListener('beforeunload', onBeforeUnload);
        };
    }, [isComposeDirty, sending]);
}
