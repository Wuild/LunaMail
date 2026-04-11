import React from 'react';
import WindowTitleBar from '@renderer/components/WindowTitleBar';

type AppShellProps = {
    title: string;
    titleActions?: React.ReactNode;
    showMaximize?: boolean;
    onRequestClose?: () => boolean;
    navRail?: React.ReactNode;
    showNavRail?: boolean;
    children: React.ReactNode;
};

export default function AppShell({
                                     title,
                                     titleActions,
                                     showMaximize = true,
                                     onRequestClose,
                                     navRail,
                                     showNavRail = false,
                                     children,
                                 }: AppShellProps) {
    return (
        <div className="flex h-full min-h-0 flex-col">
            <WindowTitleBar
                title={title}
                titleActions={titleActions}
                showMaximize={showMaximize}
                onRequestClose={onRequestClose}
            />
            <div className="min-h-0 flex flex-1 overflow-hidden">
                {showNavRail && navRail}
                <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
            </div>
        </div>
    );
}
