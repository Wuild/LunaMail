import React from 'react';
import ReactDOM from 'react-dom/client';
import {QueryClientProvider} from '@tanstack/react-query';
import '../index.css';
import {installMiddleMousePan} from '../lib/middleMousePan';
import {queryClient} from '../lib/queryClient';

function isInternalAppHref(rawHref: string): boolean {
    const href = String(rawHref || '').trim();
    if (!href) return false;
    if (href.startsWith('#/') || href.startsWith('/#/')) return true;
    if (
        href.startsWith('http://') ||
        href.startsWith('https://') ||
        href.startsWith('mailto:') ||
        href.startsWith('tel:')
    ) {
        return false;
    }
    try {
        const parsed = new URL(href, window.location.href);
        return parsed.origin === window.location.origin && parsed.hash.startsWith('#/');
    } catch {
        return false;
    }
}

function installInternalLinkDragGuard(): void {
    const guardKey = '__lunamailInternalLinkDragGuardInstalled';
    if ((window as any)[guardKey]) return;
    (window as any)[guardKey] = true;

    document.addEventListener('dragstart', (event) => {
        const target = event.target as HTMLElement | null;
        if (!target) return;
        const anchor = target.closest('a[href]') as HTMLAnchorElement | null;
        if (!anchor) return;
        if (!isInternalAppHref(anchor.getAttribute('href') || '')) return;
        event.preventDefault();
    });
}

export function mountApp(node: React.ReactNode): void {
    installMiddleMousePan();
    installInternalLinkDragGuard();
    ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
        </React.StrictMode>,
    );
}
