import React from 'react';
import ReactDOM from 'react-dom/client';
import SettingsAddAccount from './pages/SettingsAddAccount';
import './index.css';

function Root() {
    return (
        <div className="h-screen w-screen bg-slate-50">
            <SettingsAddAccount/>
        </div>
    );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <Root/>
    </React.StrictMode>
);
