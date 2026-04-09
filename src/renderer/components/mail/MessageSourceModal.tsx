import {Button} from '../ui/button';
import React from 'react';

type MessageSourceModalProps = {
    open: boolean;
    loading: boolean;
    error: string | null;
    source: string;
    onClose: () => void;
};

export default function MessageSourceModal({open, loading, error, source, onClose}: MessageSourceModalProps) {
    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-[1200] flex items-center justify-center bg-slate-900/45 px-4 py-6"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-label="Message source"
                className="flex h-full max-h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-2xl dark:border-[var(--lm-border-default-dark)] dark:bg-[var(--lm-surface-card-dark)]"
                onClick={(event) => event.stopPropagation()}
            >
                <div
                    className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-[var(--lm-border-default-dark)]">
                    <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Message source</h2>
                    <Button
                        type="button"
                        className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:border-[var(--lm-border-default-dark)] dark:text-slate-200 dark:hover:bg-[var(--lm-border-default-dark)]"
                        onClick={onClose}
                    >
                        Close
                    </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto bg-slate-50 p-3 dark:bg-[var(--lm-surface-code-dark)]">
                    {loading && <p className="text-sm text-slate-500 dark:text-slate-400">Loading message source...</p>}
                    {!loading && error && (
                        <p className="text-sm text-red-700 dark:text-red-300">Failed to load source: {error}</p>
                    )}
                    {!loading && !error && (
                        <pre
                            className="select-text whitespace-pre-wrap break-words rounded-md border border-slate-200 bg-white p-3 font-mono text-xs leading-5 text-slate-900 dark:border-[var(--lm-border-default-dark)] dark:bg-[var(--lm-surface-card-dark)] dark:text-slate-100">
							{source || '(No source available)'}
						</pre>
                    )}
                </div>
            </div>
        </div>
    );
}
