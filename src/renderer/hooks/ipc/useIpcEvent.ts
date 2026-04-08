import {useEffect, useRef} from 'react';

export function useIpcEvent<T>(
    subscribe: ((handler: (payload: T) => void) => (() => void) | undefined) | null | undefined,
    handler: (payload: T) => void,
): void {
    const handlerRef = useRef(handler);
    useEffect(() => {
        handlerRef.current = handler;
    }, [handler]);

    useEffect(() => {
        if (!subscribe) return;
        const off = subscribe((payload: T) => handlerRef.current(payload));
        return () => {
            if (typeof off === 'function') off();
        };
    }, [subscribe]);
}
