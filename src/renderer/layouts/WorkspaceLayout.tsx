import React from 'react';
import {cn} from '../lib/utils';

type WorkspaceLayoutProps = {
    menubar?: React.ReactNode;
    showMenuBar?: boolean;
    sidebar?: React.ReactNode;
    sidebarWidth?: number;
    onSidebarResizeStart?: (event: React.MouseEvent<HTMLDivElement>) => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    showFooter?: boolean;
    statusText?: string | null;
    statusHintText?: string | null;
    statusBusy?: boolean;
    showStatusBar?: boolean;
    contentClassName?: string;
    className?: string;
};

export default function WorkspaceLayout({
                                            menubar,
                                            showMenuBar = true,
                                            sidebar,
                                            sidebarWidth,
                                            onSidebarResizeStart,
                                            children,
                                            footer,
                                            showFooter = false,
                                            statusText,
                                            statusHintText,
                                            statusBusy = false,
                                            showStatusBar = true,
                                            contentClassName,
                                            className,
                                        }: WorkspaceLayoutProps) {
    const hasFooterContent = React.Children.count(footer) > 0;
    const shouldShowFooter = showFooter && hasFooterContent;
    const effectiveStatusText = statusHintText || statusText || 'Ready';
    const effectiveStatusBusy = statusHintText ? false : statusBusy;
    const statusTextViewportRef = React.useRef<HTMLSpanElement | null>(null);
    const statusTextContentRef = React.useRef<HTMLSpanElement | null>(null);
    const statusTextAnimationRef = React.useRef<Animation | null>(null);
    const [statusScrollDistance, setStatusScrollDistance] = React.useState(0);

    React.useEffect(() => {
        const viewport = statusTextViewportRef.current;
        const content = statusTextContentRef.current;
        if (!viewport || !content || !statusHintText) {
            setStatusScrollDistance(0);
            if (statusTextAnimationRef.current) {
                statusTextAnimationRef.current.cancel();
                statusTextAnimationRef.current = null;
            }
            if (content) content.style.transform = '';
            return;
        }

        const measure = () => {
            const nextDistance = Math.max(0, content.scrollWidth - viewport.clientWidth);
            setStatusScrollDistance(nextDistance > 12 ? nextDistance : 0);
        };

        measure();
        window.addEventListener('resize', measure);
        return () => {
            window.removeEventListener('resize', measure);
        };
    }, [statusHintText, effectiveStatusText]);

    React.useEffect(() => {
        const content = statusTextContentRef.current;
        if (!content) return;
        if (statusTextAnimationRef.current) {
            statusTextAnimationRef.current.cancel();
            statusTextAnimationRef.current = null;
        }
        if (!statusHintText || statusScrollDistance <= 0) {
            content.style.transform = '';
            return;
        }
        const travelMs = Math.max(3500, statusScrollDistance * 22);
        statusTextAnimationRef.current = content.animate(
            [
                {transform: 'translateX(0px)', offset: 0},
                {transform: 'translateX(0px)', offset: 0.18},
                {transform: `translateX(-${statusScrollDistance}px)`, offset: 0.62},
                {transform: `translateX(-${statusScrollDistance}px)`, offset: 0.8},
                {transform: 'translateX(0px)', offset: 1},
            ],
            {
                duration: travelMs,
                iterations: Infinity,
                easing: 'linear',
            },
        );
        return () => {
            if (statusTextAnimationRef.current) {
                statusTextAnimationRef.current.cancel();
                statusTextAnimationRef.current = null;
            }
        };
    }, [statusHintText, statusScrollDistance]);

    return (
        <section
            className={cn('flex h-full min-h-0 flex-col overflow-hidden bg-slate-50 dark:bg-[#26292f]', className)}
        >
            {showMenuBar && (
                <header
                    className="shrink-0 border-b border-slate-200 bg-white px-5 py-3 dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                    {menubar}
                </header>
            )}
            <div className="min-h-0 flex flex-1 overflow-hidden">
                {sidebar && (
                    <div className="relative min-h-0 shrink-0" style={sidebarWidth ? {width: sidebarWidth} : undefined}>
                        {sidebar}
                        {onSidebarResizeStart && (
                            <div
                                role="separator"
                                aria-orientation="vertical"
                                className="absolute inset-y-0 right-0 z-10 w-1.5 cursor-col-resize bg-transparent hover:bg-slate-300/70 dark:hover:bg-slate-500/70"
                                onMouseDown={onSidebarResizeStart}
                            />
                        )}
                    </div>
                )}
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
                    <div className="flex h-full items-center text-xs">
						<span className="flex min-w-0 items-center gap-2 truncate text-slate-600 dark:text-slate-300">
							<span
                                className={cn(
                                    'inline-flex h-2.5 w-2.5 shrink-0 rounded-full',
                                    effectiveStatusBusy ? 'animate-pulse bg-sky-500' : 'bg-slate-300 dark:bg-slate-600',
                                )}
                            />
							<span ref={statusTextViewportRef} className="min-w-0 flex-1 overflow-hidden">
								<span ref={statusTextContentRef} className="block w-max whitespace-nowrap">
									{effectiveStatusText}
								</span>
							</span>
						</span>
                    </div>
                </footer>
            )}
        </section>
    );
}
