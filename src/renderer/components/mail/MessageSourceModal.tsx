import {Button} from '../ui/button';
import React from 'react';
import {Modal, ModalHeader} from '../ui/Modal';

type MessageSourceModalProps = {
    open: boolean;
    loading: boolean;
    error: string | null;
    source: string;
    onClose: () => void;
};

export default function MessageSourceModal({open, loading, error, source, onClose}: MessageSourceModalProps) {
    return (
        <Modal
            open={open}
            onClose={onClose}
            ariaLabel="Message source"
            backdropClassName="z-[1200] px-4 py-6"
            contentClassName="overlay flex h-full max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl p-0"
        >
            <ModalHeader className="border-b ui-border-default px-4 py-3">
                <h2 className="ui-text-primary text-sm font-semibold">Message source</h2>
                <Button type="button" variant="outline" className="rounded-md px-2 py-1 text-xs" onClick={onClose}>
                    Close
                </Button>
            </ModalHeader>
            <div className="surface-muted min-h-0 flex-1 overflow-auto p-3">
                {loading && <p className="ui-text-muted text-sm">Loading message source...</p>}
                {!loading && error && <p className="text-danger text-sm">Failed to load source: {error}</p>}
                {!loading && !error && (
                    <pre
                        className="surface-card ui-text-primary select-text whitespace-pre-wrap break-words rounded-md border ui-border-default p-3 font-mono text-xs leading-5">
						{source || '(No source available)'}
					</pre>
                )}
            </div>
        </Modal>
    );
}
