import React from 'react';
import ReactDOM from 'react-dom/client';
import {QueryClientProvider} from '@tanstack/react-query';
import '../index.css';
import {installMiddleMousePan} from '../lib/middleMousePan';
import {queryClient} from '../lib/queryClient';

export function mountApp(node: React.ReactNode): void {
    installMiddleMousePan();
    ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            <QueryClientProvider client={queryClient}>{node}</QueryClientProvider>
        </React.StrictMode>,
    );
}
