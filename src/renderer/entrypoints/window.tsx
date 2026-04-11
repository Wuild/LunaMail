import React from 'react';
import {mountApp} from './mountApp';
import {HashRouter, Navigate, useRoutes, type RouteObject} from 'react-router-dom';
import AppLayout from '@renderer/app/layout';
import {useAppTheme} from '@renderer/hooks/useAppTheme';

const MAIN_WINDOW_LOADER = () => import('@renderer/app/windows/main/page');
const ADD_ACCOUNT_LOADER = () => import('@renderer/app/windows/add-account/page');
const COMPOSE_LOADER = () => import('@renderer/app/windows/compose/page');
const MESSAGE_LOADER = () => import('@renderer/app/windows/message/page');
const DEBUG_LOADER = () => import('@renderer/app/windows/debug/page');
const SPLASH_LOADER = () => import('@renderer/app/windows/splash/page');
const MainWindow = React.lazy(MAIN_WINDOW_LOADER);
const AddAccountWindow = React.lazy(ADD_ACCOUNT_LOADER);
const ComposeWindow = React.lazy(COMPOSE_LOADER);
const MessageWindow = React.lazy(MESSAGE_LOADER);
const DebugWindow = React.lazy(DEBUG_LOADER);
const SplashWindow = React.lazy(SPLASH_LOADER);

const routeObjects: RouteObject[] = [
    {path: '/windows/splash', element: <SplashWindow/>},
    {
        element: <AppLayout/>,
        children: [
            {path: '/windows/add-account', element: <AddAccountWindow/>},
            {path: '/windows/compose', element: <ComposeWindow/>},
            {path: '/windows/message', element: <MessageWindow/>},
            {path: '/windows/debug', element: <DebugWindow/>},
            {path: '/windows/main', element: <Navigate to="/" replace/>},
            {path: '*', element: <MainWindow/>},
        ],
    },
];

function WindowBootstrap(): React.ReactElement | null {
    useAppTheme();
    const routes = useRoutes(routeObjects);
    return <React.Suspense fallback={null}>{routes}</React.Suspense>;
}

mountApp(
    <HashRouter>
        <WindowBootstrap/>
    </HashRouter>,
);
