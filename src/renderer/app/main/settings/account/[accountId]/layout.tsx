import {Navigate, Outlet, useLocation} from 'react-router-dom';
import WorkspaceLayout from '@renderer/layouts/WorkspaceLayout';
import {Button} from '@renderer/components/ui/button';
import {cn} from '@renderer/lib/utils';
import {useRouteAccountId} from './accountRouteHelpers';
import {useAccountSettingsRoute, type UseAccountSettingsRouteResult} from './useAccountSettingsRoute';
import type {AccountPanelSection} from '@renderer/app/main/settings/settingsTypes';

function resolveAccountSection(pathname: string): AccountPanelSection {
    if (pathname.endsWith('/server')) return 'server';
    if (pathname.endsWith('/filters')) return 'filters';
    return 'identity';
}

export default function SettingsAccountLayout() {
    const location = useLocation();
    const accountId = useRouteAccountId();
    if (accountId === null) return <Navigate to="/settings/application" replace/>;

    const controller = useAccountSettingsRoute(accountId, resolveAccountSection(location.pathname));
    const {
        editor,
        accountSection,
        onAccountSectionNavigate,
        accountSectionSidebarWidth,
        onAccountSectionResizeStart,
        accountStatus,
        deletingAccount,
        savingAccount,
        onDeleteAccount,
        onSaveAccount,
    } = controller;

    return (
        <div className="h-full min-h-0 w-full">
            {!editor && <div className="ui-text-muted text-sm">Select an account.</div>}
            {editor && (
                <div className="flex h-full flex-col">
                    <WorkspaceLayout
                        className="h-full bg-transparent"
                        showMenuBar={false}
                        showFooter={false}
                        showStatusBar={false}
                        sidebar={
                            <aside className="sidebar h-full min-h-0 p-3">
                                <p className="px-2 pb-2 ui-text-muted text-xs font-semibold uppercase tracking-wide">
                                    Account Sections
                                </p>
                                <div className="space-y-1">
                                    <Button
                                        type="button"
                                        className={cn(
                                            'block w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                                            accountSection === 'identity' ? 'ui-surface-active ui-text-primary' : 'account-item',
                                        )}
                                        onClick={() => onAccountSectionNavigate('identity')}
                                    >
                                        Identity
                                        <span className="ui-text-muted block truncate text-[11px] font-normal">Name, address, signature</span>
                                    </Button>
                                    <Button
                                        type="button"
                                        className={cn(
                                            'block w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                                            accountSection === 'server' ? 'ui-surface-active ui-text-primary' : 'account-item',
                                        )}
                                        onClick={() => onAccountSectionNavigate('server')}
                                    >
                                        Server Settings
                                        <span className="ui-text-muted block truncate text-[11px] font-normal">IMAP/SMTP and credentials</span>
                                    </Button>
                                    <Button
                                        type="button"
                                        className={cn(
                                            'block w-full rounded-md px-3 py-2 text-left text-sm transition-colors',
                                            accountSection === 'filters' ? 'ui-surface-active ui-text-primary' : 'account-item',
                                        )}
                                        onClick={() => onAccountSectionNavigate('filters')}
                                    >
                                        Filters
                                        <span className="ui-text-muted block truncate text-[11px] font-normal">Automatic message rules</span>
                                    </Button>
                                </div>
                            </aside>
                        }
                        sidebarWidth={accountSectionSidebarWidth}
                        onSidebarResizeStart={onAccountSectionResizeStart}
                        contentClassName="min-h-0 flex-1 overflow-y-auto bg-transparent p-5"
                    >
                        <Outlet context={controller satisfies UseAccountSettingsRouteResult}/>
                    </WorkspaceLayout>
                    <div className="app-footer shrink-0 px-5 py-3">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                {Boolean((accountStatus || '').trim()) &&
                                    <span className="ui-text-muted text-xs">{accountStatus}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <Button
                                    type="button"
                                    variant="danger"
                                    onClick={() => void onDeleteAccount()}
                                    disabled={!editor || deletingAccount}
                                    className="rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
                                >
                                    {deletingAccount ? 'Deleting...' : 'Delete Account'}
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => void onSaveAccount()}
                                    disabled={!editor || savingAccount}
                                    className="button-primary rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50"
                                >
                                    {savingAccount ? 'Saving...' : 'Save'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
