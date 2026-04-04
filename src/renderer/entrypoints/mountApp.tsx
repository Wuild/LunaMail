import React from 'react';
import ReactDOM from 'react-dom/client';
import '../index.css';

export function mountApp(node: React.ReactNode): void {
    ReactDOM.createRoot(document.getElementById('root')!).render(
        <React.StrictMode>
            {node}
        </React.StrictMode>,
    );
}
