import React, {useEffect, useState} from 'react';
import {Copy, Minus, Square, X} from 'lucide-react';
import {cn} from '../lib/utils';
import lunaLogo from '../../resources/luna.png';

interface WindowTitleBarProps {
    title: string;
    className?: string;
    showMinimize?: boolean;
    showMaximize?: boolean;
    showClose?: boolean;
}

export default function WindowTitleBar({
                                           title,
                                           className,
                                           showMinimize = true,
                                           showMaximize = false,
                                           showClose = true,
                                       }: WindowTitleBarProps) {
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        if (!showMaximize) return;
        void window.electronAPI.isWindowMaximized()
            .then((value) => setIsMaximized(Boolean(value)))
            .catch(() => undefined);

        const onResize = () => {
            void window.electronAPI.isWindowMaximized()
                .then((value) => setIsMaximized(Boolean(value)))
                .catch(() => undefined);
        };
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('resize', onResize);
        };
    }, [showMaximize]);

    return (
        <div
            className={cn(
                'relative flex h-9 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-2 text-slate-100 dark:border-[#08090c] dark:bg-[#0b0c10]',
                className,
            )}
            style={{WebkitAppRegion: 'drag'} as React.CSSProperties}
            onDoubleClick={() => {
                if (!showMaximize) return;
                void window.electronAPI.toggleMaximizeWindow()
                    .then((res) => setIsMaximized(Boolean(res?.isMaximized)))
                    .catch(() => undefined);
            }}
        >
            <div className="flex w-48 shrink-0 items-center px-2 text-xs font-medium text-white/75">{title}</div>
            <div className="pointer-events-none absolute left-1/2 flex -translate-x-1/2 items-center justify-center">
                <div className="flex items-center gap-2 text-xs font-medium text-white/80">
                    <img src={lunaLogo} alt="" className="h-4 w-4 rounded-sm object-contain" draggable={false}/>
                    <span>LunaMail</span>
                </div>
            </div>
            <div
                className="flex w-24 shrink-0 items-center justify-end gap-1"
                style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
            >
                {showMinimize && (
                    <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-white/15 hover:text-white"
                        onClick={() => void window.electronAPI.minimizeWindow()}
                        aria-label="Minimize"
                        title="Minimize"
                    >
                        <Minus size={14}/>
                    </button>
                )}
                {showMaximize && (
                    <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-white/15 hover:text-white"
                        onClick={() => {
                            void window.electronAPI.toggleMaximizeWindow()
                                .then((res) => setIsMaximized(Boolean(res?.isMaximized)))
                                .catch(() => undefined);
                        }}
                        aria-label={isMaximized ? 'Restore' : 'Maximize'}
                        title={isMaximized ? 'Restore' : 'Maximize'}
                    >
                        {isMaximized ? <Copy size={13}/> : <Square size={13}/>}
                    </button>
                )}
                {showClose && (
                    <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-red-600 hover:text-white"
                        onClick={() => void window.electronAPI.closeWindow()}
                        aria-label="Close"
                        title="Close"
                    >
                        <X size={14}/>
                    </button>
                )}
            </div>
        </div>
    );
}
