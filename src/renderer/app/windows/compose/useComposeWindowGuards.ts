import {useEffect, useRef} from 'react';

type UseComposeWindowGuardsParams = {
    isComposeDirty: boolean;
    sending: boolean;
    setOnRequestClose: (onRequestClose?: (() => boolean) | null) => void;
};

export function useComposeWindowGuards({
                                           isComposeDirty,
                                           sending,
                                           setOnRequestClose,
                                       }: UseComposeWindowGuardsParams): void {
    const allowWindowCloseRef = useRef(false);

    useEffect(() => {
        setOnRequestClose(() => {
            if (sending || !isComposeDirty) return true;
            const confirmed = window.confirm('Discard this draft? You have unsent changes.');
            if (confirmed) {
                allowWindowCloseRef.current = true;
            }
            return confirmed;
        });
        return () => {
            setOnRequestClose(undefined);
        };
    }, [isComposeDirty, sending, setOnRequestClose]);

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
