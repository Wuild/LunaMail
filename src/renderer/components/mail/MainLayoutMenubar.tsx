import React from 'react';
import {
	Bug,
	CalendarDays,
	ChevronLeft,
	ChevronRight,
	CircleHelp,
	Mail,
	PenSquare,
	Search,
	Settings,
	Users,
} from '@llamamail/ui/icon';
import {Button} from '@llamamail/ui/button';
import {ipcClient} from '@renderer/lib/ipcClient';
import {cn} from '@llamamail/ui/utils';
import type {Workspace} from '@renderer/lib/workspace';
import {useI18n} from '@llamamail/app/i18n/renderer';

type MainLayoutMenubarProps = {
	canNavigateBack: boolean;
	canNavigateForward: boolean;
	onNavigateBack?: () => void;
	onNavigateForward?: () => void;
	activeWorkspace: Workspace;
	searchModalOpen: boolean;
	onOpenSearch: () => void;
	onOpenCalendar: () => void;
	onOpenContacts: () => void;
};

export default function MainLayoutMenubar({
	canNavigateBack,
	canNavigateForward,
	onNavigateBack,
	onNavigateForward,
	activeWorkspace,
	searchModalOpen,
	onOpenSearch,
	onOpenCalendar,
	onOpenContacts,
}: MainLayoutMenubarProps) {
	const {t} = useI18n();
	return (
		<div className="flex h-full items-center justify-between gap-3 px-4">
			<div className="min-w-0 flex items-center gap-3">
				<div className="flex items-center gap-2">
					<Button
						variant="ghost"
						className="titlebar-nav-button h-9 w-9 rounded-md p-0 disabled:opacity-40"
						onClick={() => onNavigateBack?.()}
						title={t('mail_components.titlebar.back')}
						aria-label={t('mail_components.titlebar.back')}
						disabled={!canNavigateBack}
					>
						<ChevronLeft size={16} />
					</Button>
					<Button
						variant="ghost"
						className="titlebar-nav-button h-9 w-9 rounded-md p-0 disabled:opacity-40"
						onClick={() => onNavigateForward?.()}
						title={t('mail_components.titlebar.forward')}
						aria-label={t('mail_components.titlebar.forward')}
						disabled={!canNavigateForward}
					>
						<ChevronRight size={16} />
					</Button>
					<Mail size={18} className="opacity-90" />
					<p className="titlebar-brand truncate text-base font-semibold tracking-tight">LlamaMail</p>
				</div>
				<Button
					variant="ghost"
					className="titlebar-nav-button h-9 rounded-md px-3"
					onClick={() => ipcClient.openComposeWindow()}
					title={t('mail_components.titlebar.compose')}
					aria-label={t('mail_components.titlebar.compose')}
				>
					<PenSquare size={16} className="mr-2" />
					<span className="text-sm font-medium">{t('mail_components.titlebar.compose')}</span>
				</Button>
				<Button
					variant="ghost"
					className={cn(
						'titlebar-nav-button h-9 rounded-md px-3',
						activeWorkspace === 'calendar' && 'is-active',
					)}
					onClick={onOpenCalendar}
					title={t('mail_components.titlebar.open_calendar')}
					aria-label={t('mail_components.titlebar.open_calendar')}
				>
					<CalendarDays size={16} className="mr-2" />
					<span className="text-sm font-medium">{t('mail_components.titlebar.calendar')}</span>
				</Button>
				<Button
					variant="ghost"
					className={cn(
						'titlebar-nav-button h-9 rounded-md px-3',
						activeWorkspace === 'contacts' && 'is-active',
					)}
					onClick={onOpenContacts}
					title={t('mail_components.titlebar.open_contacts')}
					aria-label={t('mail_components.titlebar.open_contacts')}
				>
					<Users size={16} className="mr-2" />
					<span className="text-sm font-medium">{t('mail_components.titlebar.contacts')}</span>
				</Button>
			</div>
			<div className="flex items-center justify-end">
				<Button
					variant="ghost"
					className={cn('titlebar-nav-button mr-1 h-9 w-9 rounded-md p-0', searchModalOpen && 'is-active')}
					onClick={onOpenSearch}
					title={t('mail_components.titlebar.search_mail')}
					aria-label={t('mail_components.titlebar.search_mail')}
				>
					<Search size={15} />
				</Button>
				<Button
					variant="ghost"
					className="titlebar-nav-button mr-1 h-9 w-9 rounded-md p-0"
					onClick={() => {
						window.location.hash = '/settings/application';
					}}
					title={t('mail_components.titlebar.app_settings')}
					aria-label={t('mail_components.titlebar.app_settings')}
				>
					<Settings size={17} />
				</Button>
				<Button
					variant="ghost"
					className="titlebar-nav-button h-9 w-9 rounded-md p-0"
					onClick={() => {
						window.location.hash = '/debug';
					}}
					title={t('mail_components.titlebar.debug_console')}
					aria-label={t('mail_components.titlebar.debug_console')}
				>
					<Bug size={17} />
				</Button>
				<Button
					variant="ghost"
					className="titlebar-nav-button h-9 w-9 rounded-md p-0"
					onClick={() => {
						window.location.hash = '/about';
					}}
					title={t('mail_components.titlebar.about')}
					aria-label={t('mail_components.titlebar.about')}
				>
					<CircleHelp size={17} />
				</Button>
			</div>
		</div>
	);
}
