import React from 'react';
import {mountApp} from './mountApp';

type WindowKind = 'main' | 'add-account' | 'compose' | 'message' | 'splash';

const WINDOW_KIND_TO_TITLE: Record<WindowKind, string> = {
    main: 'LunaMail',
    'add-account': 'LunaMail - Add Account',
    compose: 'LunaMail - Compose',
    message: 'LunaMail - Message',
    splash: 'LunaMail - Starting',
};

function parseWindowKind(): WindowKind {
    const raw = new URLSearchParams(window.location.search).get('window') || 'main';
    if (raw === 'main' || raw === 'add-account' || raw === 'compose' || raw === 'message' || raw === 'splash') {
        return raw;
    }
    return 'main';
}

const MAIN_WINDOW_LOADER = () => import('../MainWindowApp');
const ADD_ACCOUNT_LOADER = () => import('../pages/SettingsAddAccount');
const COMPOSE_LOADER = () => import('../pages/ComposeEmailPage');
const MESSAGE_LOADER = () => import('../pages/MessageWindowPage');
const SPLASH_LOADER = () => import('../pages/SplashScreenPage');
const MainWindow = React.lazy(MAIN_WINDOW_LOADER);
const AddAccountWindow = React.lazy(ADD_ACCOUNT_LOADER);
const ComposeWindow = React.lazy(COMPOSE_LOADER);
const MessageWindow = React.lazy(MESSAGE_LOADER);
const SplashWindow = React.lazy(SPLASH_LOADER);

function WindowBootstrap({kind}: { kind: WindowKind }): React.ReactElement {
    if (kind === 'main') {
        return (
            <React.Suspense fallback={null}>
                <MainWindow/>
            </React.Suspense>
        );
    }
    if (kind === 'add-account') {
        return (
            <React.Suspense fallback={null}>
                <div className="h-screen w-screen bg-slate-50">
                    <AddAccountWindow/>
                </div>
            </React.Suspense>
        );
    }
    if (kind === 'compose') {
        return (
            <React.Suspense fallback={null}>
                <ComposeWindow/>
            </React.Suspense>
        );
    }
    if (kind === 'message') {
        return (
            <React.Suspense fallback={null}>
                <MessageWindow/>
            </React.Suspense>
        );
    }
    return (
        <React.Suspense fallback={null}>
            <SplashWindow/>
        </React.Suspense>
    );
}

const windowKind = parseWindowKind();
document.title = WINDOW_KIND_TO_TITLE[windowKind];
mountApp(<WindowBootstrap kind={windowKind}/>);
