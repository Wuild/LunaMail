import React, {useEffect, useMemo, useState} from 'react';
import type {AppSettings, MessageBodyResult, MessageDetails} from '../../preload';
import {formatSystemDateTime} from '../lib/dateTime';

const defaultSettings: AppSettings = {
    language: 'system',
    theme: 'system',
    minimizeToTray: true,
    syncIntervalMinutes: 2,
};

export default function MessageWindowPage() {
    const [systemLocale, setSystemLocale] = useState('en-US');
    const [messageId, setMessageId] = useState<number | null>(null);
    const [message, setMessage] = useState<MessageDetails | null>(null);
    const [body, setBody] = useState<MessageBodyResult | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const applyTheme = (next: AppSettings) => {
            const useDark = next.theme === 'dark' || (next.theme === 'system' && media.matches);
            document.documentElement.classList.toggle('dark', useDark);
            document.body.classList.toggle('dark', useDark);
        };

        window.electronAPI.getAppSettings().then((next) => applyTheme(next)).catch(() => applyTheme(defaultSettings));
        window.electronAPI.getSystemLocale().then((locale) => setSystemLocale(locale || 'en-US')).catch(() => undefined);
        const offSettings = window.electronAPI.onAppSettingsUpdated?.((next) => applyTheme(next));
        const onChange = () => window.electronAPI.getAppSettings().then((next) => applyTheme(next)).catch(() => applyTheme(defaultSettings));
        media.addEventListener('change', onChange);
        return () => {
            if (typeof offSettings === 'function') offSettings();
            media.removeEventListener('change', onChange);
        };
    }, []);

    useEffect(() => {
        let active = true;
        window.electronAPI.getMessageWindowTarget().then((target) => {
            if (!active) return;
            setMessageId(target);
        }).catch(() => undefined);
        const off = window.electronAPI.onMessageWindowTarget?.((target) => {
            if (!active) return;
            setMessageId(target);
        });
        return () => {
            active = false;
            if (typeof off === 'function') off();
        };
    }, []);

    useEffect(() => {
        if (!messageId) {
            setMessage(null);
            setBody(null);
            return;
        }
        let active = true;
        setLoading(true);
        Promise.all([
            window.electronAPI.getMessage(messageId),
            window.electronAPI.getMessageBody(messageId, `message-window-${messageId}-${Date.now()}`),
        ])
            .then(([meta, content]) => {
                if (!active) return;
                setMessage(meta);
                setBody(content);
            })
            .catch(() => {
                if (!active) return;
                setMessage(null);
                setBody(null);
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [messageId]);

    const iframeSrcDoc = useMemo(() => {
        if (!body?.html) return null;
        return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { width: 100%; margin: 0; box-sizing: border-box; }
    </style>
  </head>
  <body>${body.html}</body>
</html>`;
    }, [body]);

    return (
        <div className="h-screen w-screen overflow-hidden bg-slate-100 dark:bg-[#2f3136]">
            <div className="flex h-full flex-col">
                <header
                    className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-slate-50 via-white to-indigo-50/60 px-6 py-5 dark:border-[#393c41] dark:from-[#34373d] dark:via-[#34373d] dark:to-[#3a3550]">
                    <h1 className="truncate text-2xl font-semibold text-slate-900 dark:text-slate-100">{message?.subject || 'Message'}</h1>
                    {message && (
                        <div className="mt-3 space-y-1 text-sm text-slate-700 dark:text-slate-200">
                            <div><span
                                className="font-medium text-slate-500 dark:text-slate-400">From:</span> {formatFromDisplay(message)}
                            </div>
                            <div><span
                                className="font-medium text-slate-500 dark:text-slate-400">To:</span> {message.to_address || '-'}
                            </div>
                            <div><span
                                className="font-medium text-slate-500 dark:text-slate-400">Date:</span> {formatSystemDateTime(message.date, systemLocale)}
                            </div>
                        </div>
                    )}
                </header>

                <main className="min-h-0 flex-1 bg-white">
                    {loading && (
                        <div
                            className="flex h-full items-center justify-center text-slate-500 dark:text-slate-400">Loading
                            message...</div>
                    )}
                    {!loading && iframeSrcDoc && (
                        <iframe
                            title={`message-window-body-${message?.id || 'unknown'}`}
                            srcDoc={iframeSrcDoc}
                            sandbox=""
                            className="h-full w-full border-0 bg-white"
                        />
                    )}
                    {!loading && !iframeSrcDoc && (
                        <div className="h-full overflow-auto bg-white p-4 text-slate-900">
              <pre className="select-text whitespace-pre-wrap break-words font-sans text-sm leading-relaxed">
                {body?.text || 'No body content available for this message.'}
              </pre>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}

function formatFromDisplay(message: MessageDetails): string {
    const name = (message.from_name || '').trim();
    const address = (message.from_address || '').trim();
    if (name && address) return `${name} <${address}>`;
    if (address) return address;
    if (name) return name;
    return 'Unknown';
}
