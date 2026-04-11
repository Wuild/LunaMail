import {useOutletContext} from 'react-router-dom';
import ServiceSettingsCard from '@renderer/components/settings/ServiceSettingsCard';
import {Field} from '@renderer/app/main/settings/formParts';
import type {UseAccountSettingsRouteResult} from '../useAccountSettingsRoute';

export default function SettingsAccountServerPage() {
    const {editor, setEditor} = useOutletContext<UseAccountSettingsRouteResult>();
    if (!editor) return null;

    return (
        <>
            <section className="panel rounded-xl p-4">
                <h2 className="ui-text-primary text-base font-semibold">Server Settings</h2>
                <div className="mt-4 flex flex-col gap-4">
                    <Field
                        label="User"
                        value={editor.user}
                        onChange={(v) => setEditor((p) => (p ? {...p, user: v} : p))}
                    />
                    <Field
                        label="Provider"
                        value={editor.provider || ''}
                        onChange={(v) => setEditor((p) => (p ? {...p, provider: v} : p))}
                    />
                    <Field
                        type="password"
                        label="New password (optional)"
                        value={editor.password || ''}
                        onChange={(v) => setEditor((p) => (p ? {...p, password: v} : p))}
                    />
                </div>
            </section>
            <div className="mt-4">
                <ServiceSettingsCard
                    title="IMAP Incoming"
                    host={editor.imap_host}
                    port={editor.imap_port}
                    security={editor.imap_secure ? 'ssl' : 'starttls'}
                    onHostChange={(value) => setEditor((p) => (p ? {...p, imap_host: value} : p))}
                    onPortChange={(value) => setEditor((p) => (p ? {...p, imap_port: value} : p))}
                    onSecurityChange={(value) =>
                        setEditor((p) =>
                            p
                                ? {
                                    ...p,
                                    imap_secure: value === 'ssl' ? 1 : 0,
                                }
                                : p,
                        )
                    }
                    controlVariant="subtle"
                    controlSize="lg"
                />
            </div>
            <div className="mt-4">
                <ServiceSettingsCard
                    title="SMTP Outgoing"
                    host={editor.smtp_host}
                    port={editor.smtp_port}
                    security={editor.smtp_secure ? 'ssl' : 'starttls'}
                    onHostChange={(value) => setEditor((p) => (p ? {...p, smtp_host: value} : p))}
                    onPortChange={(value) => setEditor((p) => (p ? {...p, smtp_port: value} : p))}
                    onSecurityChange={(value) =>
                        setEditor((p) =>
                            p
                                ? {
                                    ...p,
                                    smtp_secure: value === 'ssl' ? 1 : 0,
                                }
                                : p,
                        )
                    }
                    controlVariant="subtle"
                    controlSize="lg"
                />
            </div>
        </>
    );
}
