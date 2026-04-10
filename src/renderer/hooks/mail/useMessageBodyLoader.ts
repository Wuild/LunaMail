import {useEffect, useRef, useState} from 'react';
import type {MessageBodyResult} from '@/preload';
import {ipcClient} from '@renderer/lib/ipcClient';
import {toErrorMessage} from '@renderer/lib/statusText';

type UseMessageBodyLoaderResult = {
    bodyLoading: boolean;
    selectedMessageBody: MessageBodyResult | null;
};

export function useMessageBodyLoader(selectedMessageId: number | null): UseMessageBodyLoaderResult {
    const [bodyLoading, setBodyLoading] = useState(false);
    const [selectedMessageBody, setSelectedMessageBody] = useState<MessageBodyResult | null>(null);
    const bodyRequestSeqRef = useRef(0);
    const activeBodyRequestIdRef = useRef<string | null>(null);

    useEffect(() => {
        if (!selectedMessageId) {
            if (activeBodyRequestIdRef.current) {
                void ipcClient.cancelMessageBody(activeBodyRequestIdRef.current);
                activeBodyRequestIdRef.current = null;
            }
            setSelectedMessageBody(null);
            setBodyLoading(false);
            return;
        }

        let active = true;
        if (activeBodyRequestIdRef.current) {
            void ipcClient.cancelMessageBody(activeBodyRequestIdRef.current);
        }
        const requestId = `body-${selectedMessageId}-${++bodyRequestSeqRef.current}`;
        activeBodyRequestIdRef.current = requestId;

        setBodyLoading(true);
        setSelectedMessageBody(null);
        ipcClient
            .getMessageBody(selectedMessageId, requestId)
            .then((body) => {
                if (!active) return;
                if (activeBodyRequestIdRef.current !== requestId) return;
                setSelectedMessageBody(body);
            })
            .catch((error: unknown) => {
                if (!active) return;
                if (activeBodyRequestIdRef.current !== requestId) return;
                if (toErrorMessage(error, '').toLowerCase().includes('cancel')) return;
                setSelectedMessageBody({
                    messageId: selectedMessageId,
                    text: `Failed to load body: ${toErrorMessage(error)}`,
                    html: null,
                    attachments: [],
                    cached: true,
                });
            })
            .finally(() => {
                if (!active) return;
                if (activeBodyRequestIdRef.current === requestId) {
                    setBodyLoading(false);
                }
            });

        return () => {
            active = false;
            void ipcClient.cancelMessageBody(requestId);
            if (activeBodyRequestIdRef.current === requestId) {
                activeBodyRequestIdRef.current = null;
            }
        };
    }, [selectedMessageId]);

    return {
        bodyLoading,
        selectedMessageBody,
    };
}
