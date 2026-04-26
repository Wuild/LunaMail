import {Button} from '@llamamail/ui/button';
import React from 'react';
import {Copy, Minus, Square, X} from '@llamamail/ui/icon';
import {cn} from '@llamamail/ui/utils';
import llamaLogo from '@resource/llamatray.png';
import {useWindowControlsState} from '@renderer/hooks/ipc/useWindowControlsState';
import {useAppSettings} from '@renderer/hooks/ipc/useAppSettings';
import {DEFAULT_APP_SETTINGS} from '@llamamail/app/defaults';
import {APP_NAME} from '@llamamail/app/appConfig';
import {useAutoUpdateState} from '@renderer/hooks/ipc/useAutoUpdateState';
import {useI18n} from '@llamamail/app/i18n/renderer';

interface WindowTitleBarProps {
	title: string;
	className?: string;
	titleActions?: React.ReactNode;
	showMinimize?: boolean;
	showMaximize?: boolean;
	showClose?: boolean;
	onRequestClose?: () => boolean;
}

export default function WindowTitleBar({
	title,
	className,
	titleActions,
	showMinimize = true,
	showMaximize = false,
	showClose = true,
	onRequestClose,
}: WindowTitleBarProps) {
	const {t} = useI18n();
	const {appSettings} = useAppSettings(DEFAULT_APP_SETTINGS);
	const {isMaximized, capabilities, toggleMaximize, minimize, close} = useWindowControlsState();
	const {appVersion} = useAutoUpdateState();
	const hasPageTitle = String(title || '').trim().length > 0;
	if (appSettings.useNativeTitleBar) {
		return null;
	}
	const allowMinimize = showMinimize && capabilities.minimizable;
	const allowMaximize = showMaximize && capabilities.maximizable;

	return (
		<div
			className={cn('titlebar relative flex h-9 shrink-0 items-center justify-between px-2', className)}
			style={{WebkitAppRegion: 'drag'} as React.CSSProperties}
			onDoubleClick={() => {
				if (!allowMaximize) return;
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
				{hasPageTitle ? <span aria-hidden className="titlebar-divider h-3.5 w-px shrink-0" /> : null}
				{hasPageTitle ? (
					<span className="titlebar-title block min-w-0 flex-1 truncate text-xs font-semibold tracking-wide">
						{title}
					</span>
				) : null}
			</div>
			<div
				className="titlebar-actions flex shrink-0 items-center justify-end gap-1"
				style={{WebkitAppRegion: 'no-drag'} as React.CSSProperties}
			>
				{titleActions}
				{allowMinimize && (
					<Button
						type="button"
						className="titlebar-button inline-flex h-7 w-7 items-center justify-center rounded"
						onClick={() => void minimize()}
						aria-label={t('window_controls.minimize')}
						title={t('window_controls.minimize')}
					>
						<Minus size={14} />
					</Button>
				)}
				{allowMaximize && (
					<Button
						type="button"
						className="titlebar-button inline-flex h-7 w-7 items-center justify-center rounded"
						onClick={() => void toggleMaximize()}
						aria-label={isMaximized ? t('window_controls.restore') : t('window_controls.maximize')}
						title={isMaximized ? t('window_controls.restore') : t('window_controls.maximize')}
					>
						{isMaximized ? <Copy size={13} /> : <Square size={13} />}
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
						aria-label={t('window_controls.close')}
						title={t('window_controls.close')}
					>
						<X size={14} />
					</Button>
				)}
			</div>
		</div>
	);
}
