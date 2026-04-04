import React from 'react';
import {cn} from '../lib/utils';

type WorkspaceLayoutProps = {
    menubar?: React.ReactNode;
    showMenuBar?: boolean;
    sidebar?: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    showFooter?: boolean;
    statusText?: string | null;
    statusBusy?: boolean;
    showStatusBar?: boolean;
    contentClassName?: string;
    className?: string;
};

export default function WorkspaceLayout({
                                            menubar,
                                            showMenuBar = true,
                                            sidebar,
                                            children,
                                            footer,
                                            showFooter = false,
                                            statusText,
                                            statusBusy = false,
                                            showStatusBar = true,
                                            contentClassName,
                                            className,
                                        }: WorkspaceLayoutProps) {
    const hasFooterContent = React.Children.count(footer) > 0;
    const shouldShowFooter = showFooter && hasFooterContent;

    return (
        <section
            className={cn('flex h-full min-h-0 flex-col overflow-hidden bg-slate-50 dark:bg-[#26292f]', className)}>
            {showMenuBar && (
                <header
                    className="shrink-0 border-b border-slate-200 bg-white px-5 py-3 dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                    {menubar}
                </header>
            )}
            <div className="min-h-0 flex flex-1 overflow-hidden">
                {sidebar}
                <main className={cn('min-h-0 flex-1 overflow-auto p-5', contentClassName)}>{children}</main>
            </div>
            {shouldShowFooter && (
                <div
                    className="shrink-0 border-t border-slate-200 bg-white px-5 py-3 dark:border-[#3a3d44] dark:bg-[#1f2125]">
                    {footer}
                </div>
            )}
            {showStatusBar && (
                <footer
                    className="h-8 shrink-0 border-t border-slate-200 bg-slate-50 px-3 dark:border-[#2a2d31] dark:bg-[#1b1c20]">
                    <div className="flex h-full items-center justify-between text-xs">
                        <span className="flex min-w-0 items-center gap-2 truncate text-slate-600 dark:text-slate-300">
                            <span
                                className={cn(
                                    'inline-flex h-2.5 w-2.5 shrink-0 rounded-full',
                                    statusBusy ? 'animate-pulse bg-sky-500' : 'bg-slate-300 dark:bg-slate-600',
                                )}
                            />
                            <span className="truncate">{statusText || 'Ready'}</span>
                        </span>
                        <span className="ml-3 shrink-0 text-slate-400 dark:text-slate-500">LunaMail</span>
                    </div>
                </footer>
            )}
        </section>
    );
}
