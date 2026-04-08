import React from 'react';
import {Bug, CalendarDays, ChevronLeft, ChevronRight, CircleHelp, Mail, PenSquare, Search, Settings, Users} from 'lucide-react';
import {Button} from '../ui/button';
import {ipcClient} from '../../lib/ipcClient';
import {cn} from '../../lib/utils';
import type {Workspace} from '../../lib/workspace';

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
    return (
        <div className="flex h-full items-center justify-between gap-3 px-4">
            <div className="min-w-0 flex items-center gap-3">
                <div className="flex items-center gap-2">
                    <Button
                        variant="ghost"
                        className="h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white disabled:opacity-40"
                        onClick={() => onNavigateBack?.()}
                        title="Back"
                        aria-label="Back"
                        disabled={!canNavigateBack}
                    >
                        <ChevronLeft size={16}/>
                    </Button>
                    <Button
                        variant="ghost"
                        className="h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white disabled:opacity-40"
                        onClick={() => onNavigateForward?.()}
                        title="Forward"
                        aria-label="Forward"
                        disabled={!canNavigateForward}
                    >
                        <ChevronRight size={16}/>
                    </Button>
                    <Mail size={18} className="opacity-90"/>
                    <p className="truncate text-base font-semibold tracking-tight text-white">LunaMail</p>
                </div>
                <Button
                    variant="ghost"
                    className="h-9 rounded-md px-3 text-white/90 hover:bg-white/15 hover:text-white"
                    onClick={() => ipcClient.openComposeWindow()}
                    title="Compose"
                    aria-label="Compose"
                >
                    <PenSquare size={16} className="mr-2"/>
                    <span className="text-sm font-medium">Compose</span>
                </Button>
                <Button
                    variant="ghost"
                    className={cn(
                        'h-9 rounded-md px-3 text-white/90 hover:bg-white/15 hover:text-white',
                        activeWorkspace === 'calendar' && 'bg-white/20 text-white',
                    )}
                    onClick={onOpenCalendar}
                    title="Open calendar"
                    aria-label="Open calendar"
                >
                    <CalendarDays size={16} className="mr-2"/>
                    <span className="text-sm font-medium">Calendar</span>
                </Button>
                <Button
                    variant="ghost"
                    className={cn(
                        'h-9 rounded-md px-3 text-white/90 hover:bg-white/15 hover:text-white',
                        activeWorkspace === 'contacts' && 'bg-white/20 text-white',
                    )}
                    onClick={onOpenContacts}
                    title="Open contacts"
                    aria-label="Open contacts"
                >
                    <Users size={16} className="mr-2"/>
                    <span className="text-sm font-medium">Contacts</span>
                </Button>
            </div>
            <div className="flex items-center justify-end">
                <Button
                    variant="ghost"
                    className={cn(
                        'mr-1 h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white',
                        searchModalOpen && 'bg-white/20 text-white',
                    )}
                    onClick={onOpenSearch}
                    title="Search mail"
                    aria-label="Search mail"
                >
                    <Search size={15}/>
                </Button>
                <Button
                    variant="ghost"
                    className="mr-1 h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white"
                    onClick={() => {
                        window.location.hash = '/settings/application';
                    }}
                    title="App settings"
                    aria-label="App settings"
                >
                    <Settings size={17}/>
                </Button>
                <Button
                    variant="ghost"
                    className="h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white"
                    onClick={() => {
                        window.location.hash = '/debug';
                    }}
                    title="Debug console"
                    aria-label="Debug console"
                >
                    <Bug size={17}/>
                </Button>
                <Button
                    variant="ghost"
                    className="h-9 w-9 rounded-md p-0 text-white/90 hover:bg-white/15 hover:text-white"
                    onClick={() => {
                        window.location.hash = '/help';
                    }}
                    title="Support"
                    aria-label="Support"
                >
                    <CircleHelp size={17}/>
                </Button>
            </div>
        </div>
    );
}
