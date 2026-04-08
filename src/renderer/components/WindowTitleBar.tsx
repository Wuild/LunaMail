import React from 'react';
import {Copy, Minus, Square, X} from 'lucide-react';
import {cn} from '../lib/utils';
import lunaLogo from '../../resources/luna.png';
import {useWindowControlsState} from '../hooks/ipc/useWindowControlsState';
import {useAppSettings} from '../hooks/ipc/useAppSettings';
import {DEFAULT_APP_SETTINGS} from '../../shared/defaults';

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
    const {appSettings} = useAppSettings(DEFAULT_APP_SETTINGS);
    const {isMaximized, toggleMaximize, minimize, close} = useWindowControlsState();
    if (appSettings.useNativeTitleBar) {
        return null;
    }

    return (
        <div
            className={cn(
                'relative flex h-9 shrink-0 items-center justify-between border-b border-slate-800 bg-slate-900 px-2 text-slate-100 dark:border-[#08090c] dark:bg-[#0b0c10]',
                className,
            )}
            style={{WebkitAppRegion: 'drag'} as React.CSSProperties}
            onDoubleClick={() => {
                if (!showMaximize) return;
                void toggleMaximize();
            }}
        >
            <div className="pointer-events-none flex min-w-0 flex-1 items-center justify-start gap-3">
                <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-white/80">
                    <img src={lunaLogo} alt="" className="h-4 w-4 rounded-sm object-contain" draggable={false}/>
                    <span>LunaMail</span>
                </div>
                <span aria-hidden className="h-3.5 w-px shrink-0 bg-white/25"/>
                <span className="block min-w-0 flex-1 truncate text-xs font-semibold tracking-wide text-white/80">
					{title}
				</span>
            </div>
            <div
                className="flex w-24 shrink-0 items-center justify-end gap-1"
                style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
            >
                {showMinimize && (
                    <button
                        type="button"
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-white/80 hover:bg-white/15 hover:text-white"
                        onClick={() => void minimize()}
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
                        onClick={() => void toggleMaximize()}
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
                        onClick={() => void close()}
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
