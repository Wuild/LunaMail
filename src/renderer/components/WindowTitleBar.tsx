import {Button} from './ui/button';
import React from 'react';
import {Copy, Minus, Square, X} from 'lucide-react';
import {cn} from '../lib/utils';
import llamaLogo from '../../resources/llamatray.png';
import {useWindowControlsState} from '../hooks/ipc/useWindowControlsState';
import {useAppSettings} from '../hooks/ipc/useAppSettings';
import {DEFAULT_APP_SETTINGS} from '../../shared/defaults';
import {APP_NAME} from '../../shared/appConfig';
import {useAutoUpdateState} from "../hooks/ipc/useAutoUpdateState";

interface WindowTitleBarProps {
    title: string;
    className?: string;
    showMinimize?: boolean;
    showMaximize?: boolean;
    showClose?: boolean;
    onRequestClose?: () => boolean;
}

export default function WindowTitleBar({
                                           title,
                                           className,
                                           showMinimize = true,
                                           showMaximize = false,
                                           showClose = true,
                                           onRequestClose,
                                       }: WindowTitleBarProps) {
    const {appSettings} = useAppSettings(DEFAULT_APP_SETTINGS);
    const {isMaximized, toggleMaximize, minimize, close} = useWindowControlsState();
    const {appVersion} = useAutoUpdateState();
    if (appSettings.useNativeTitleBar) {
        return null;
    }

    return (
        <div
            className={cn(
                'titlebar relative flex h-9 shrink-0 items-center justify-between px-2',
                className,
            )}
            style={{WebkitAppRegion: 'drag'} as React.CSSProperties}
            onDoubleClick={() => {
                if (!showMaximize) return;
                void toggleMaximize();
            }}
        >
            <div className="titlebar-left pointer-events-none flex min-w-0 flex-1 items-center justify-start gap-3">
                <div className="titlebar-title flex shrink-0 items-center gap-2 text-xs font-medium">
                    <img
                        src={llamaLogo}
                        alt=""
                        className="h-7 w-7 object-contain contrast-125 saturate-125"
                        style={{imageRendering: '-webkit-optimize-contrast'}}
                        draggable={false}
                    />
                    <span>{APP_NAME}</span>
                    <span className="titlebar-meta text-[10px] font-semibold uppercase tracking-wide">
								{appVersion}
							</span>
                </div>
                <span aria-hidden className="titlebar-divider h-3.5 w-px shrink-0"/>
                <span
                    className="titlebar-title block min-w-0 flex-1 truncate text-xs font-semibold tracking-wide">
                    {title}
                </span>
            </div>
            <div
                className="titlebar-actions flex w-24 shrink-0 items-center justify-end gap-1"
                style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
            >
                {showMinimize && (
                    <Button
                        type="button"
                        className="titlebar-button inline-flex h-7 w-7 items-center justify-center rounded"
                        onClick={() => void minimize()}
                        aria-label="Minimize"
                        title="Minimize"
                    >
                        <Minus size={14}/>
                    </Button>
                )}
                {showMaximize && (
                    <Button
                        type="button"
                        className="titlebar-button inline-flex h-7 w-7 items-center justify-center rounded"
                        onClick={() => void toggleMaximize()}
                        aria-label={isMaximized ? 'Restore' : 'Maximize'}
                        title={isMaximized ? 'Restore' : 'Maximize'}
                    >
                        {isMaximized ? <Copy size={13}/> : <Square size={13}/>}
                    </Button>
                )}
                {showClose && (
                    <Button
                        type="button"
                        className="titlebar-button-close inline-flex h-7 w-7 items-center justify-center rounded"
                        onClick={() => {
                            if (onRequestClose && !onRequestClose()) return;
                            void close();
                        }}
                        aria-label="Close"
                        title="Close"
                    >
                        <X size={14}/>
                    </Button>
                )}
            </div>
        </div>
    );
}
