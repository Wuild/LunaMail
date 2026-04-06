import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';
import {installMiddleMousePan} from '../lib/middleMousePan';

export function mountApp(node: React.ReactNode): void {
    installMiddleMousePan();
    ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            {node}
        </React.StrictMode>,
    );
}
