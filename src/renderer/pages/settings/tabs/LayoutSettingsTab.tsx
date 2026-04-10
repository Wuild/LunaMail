import React from 'react';
import type {AppSettings} from '../../../../preload';
import {cn} from '../../../lib/utils';
import {Button} from '../../../components/ui/button';
import {APP_THEME_OPTIONS, MAIL_VIEW_OPTIONS} from '../../../../shared/settingsOptions';

type LayoutSettingsTabProps = {
    settings: AppSettings;
    effectiveUseNativeTitleBar: boolean;
    onTitlebarModeChange: (useNativeTitleBar: boolean) => Promise<void>;
    applySettingsPatch: (patch: Partial<AppSettings>) => Promise<boolean>;
};

export default function LayoutSettingsTab({
                                              settings,
                                              effectiveUseNativeTitleBar,
                                              onTitlebarModeChange,
                                              applySettingsPatch,
                                          }: LayoutSettingsTabProps) {
    return (
        <div className="mx-auto w-full max-w-5xl space-y-4">
            <div className="panel space-y-3 rounded-xl p-4">
                <div className="block text-sm">
                    <span className="ui-text-secondary mb-1 block font-medium">Theme</span>
                    <div className="ui-border-default inline-flex w-full overflow-hidden rounded-md border">
                        {APP_THEME_OPTIONS.map((option) => {
                            const active = settings.theme === option.value;
                            return (
                                <Button
                                    key={option.value}
                                    type="button"
                                    className={cn(
                                        'h-10 flex-1 border-r ui-border-default text-sm transition-colors last:border-r-0',
                                        active ? 'button-primary' : 'button-secondary',
                                    )}
                                    onClick={() => void applySettingsPatch({theme: option.value})}
                                >
                                    {option.label}
                                </Button>
                            );
                        })}
                    </div>
                </div>
                <div className="block text-sm">
                    <span className="ui-text-secondary mb-1 block font-medium">Titlebar</span>
                    <div className="ui-border-default inline-flex w-full overflow-hidden rounded-md border">
                        <Button
                            type="button"
                            className={cn(
                                'h-10 flex-1 border-r ui-border-default text-sm transition-colors',
                                !effectiveUseNativeTitleBar ? 'button-primary' : 'button-secondary',
                            )}
                            onClick={() => void onTitlebarModeChange(false)}
                        >
                            Custom titlebar
                        </Button>
                        <Button
                            type="button"
                            className={cn(
                                'h-10 flex-1 text-sm transition-colors',
                                effectiveUseNativeTitleBar ? 'button-primary' : 'button-secondary',
                            )}
                            onClick={() => void onTitlebarModeChange(true)}
                        >
                            Native titlebar
                        </Button>
                    </div>
                    <p className="mt-2 ui-text-muted text-xs">Changing titlebar mode requires restarting the app.</p>
                    {settings.pendingUseNativeTitleBar !== null && (
                        <p className="notice-warning mt-2 rounded px-2 py-1 text-xs">
                            Restart queued: will switch
                            to {settings.pendingUseNativeTitleBar ? 'native' : 'custom'} titlebar.
                        </p>
                    )}
                </div>
            </div>
            <div className="panel space-y-3 rounded-xl p-4">
                <div className="block text-sm">
                    <span className="ui-text-secondary mb-1 block font-medium">Mail view</span>
                    <div className="ui-border-default inline-flex w-full overflow-hidden rounded-md border">
                        {MAIL_VIEW_OPTIONS.map((option) => {
                            const active = settings.mailView === option.value;
                            return (
                                <Button
                                    key={option.value}
                                    type="button"
                                    className={cn(
                                        'h-10 flex-1 border-r ui-border-default text-sm transition-colors last:border-r-0',
                                        active ? 'button-primary' : 'button-secondary',
                                    )}
                                    onClick={() => void applySettingsPatch({mailView: option.value})}
                                >
                                    {option.label}
                                </Button>
                            );
                        })}
                    </div>
                    <p className="mt-2 ui-text-muted text-xs">
                        Side List keeps folders and message list side-by-side. Top Table places a compact table above
                        message
                        preview.
                    </p>
                </div>
            </div>
        </div>
    );
}
