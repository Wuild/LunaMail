import React, {useEffect, useMemo, useState} from 'react';
import type {AppSettings, PublicAccount, UpdateAccountPayload} from '../../preload';

type AccountEditor = UpdateAccountPayload & { id: number };

export default function AccountSettingsPage() {
    const [accounts, setAccounts] = useState<PublicAccount[]>([]);
    const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
    const [editor, setEditor] = useState<AccountEditor | null>(null);
    const [saving, setSaving] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [status, setStatus] = useState<string | null>(null);

    useEffect(() => {
        const media = window.matchMedia('(prefers-color-scheme: dark)');
        const applyTheme = (settings?: AppSettings | null) => {
            const theme = settings?.theme ?? 'system';
            const useDark = theme === 'dark' || (theme === 'system' && media.matches);
            document.documentElement.classList.toggle('dark', useDark);
            document.body.classList.toggle('dark', useDark);
        };

        window.electronAPI.getAppSettings().then((settings) => applyTheme(settings)).catch(() => applyTheme(null));
        const off = window.electronAPI.onAppSettingsUpdated?.((settings) => applyTheme(settings));
        const onChange = () => window.electronAPI.getAppSettings().then((settings) => applyTheme(settings)).catch(() => applyTheme(null));
        media.addEventListener('change', onChange);
        return () => {
            if (typeof off === 'function') off();
            media.removeEventListener('change', onChange);
        };
    }, []);

    useEffect(() => {
        let active = true;
        const load = async () => {
            const [list, targetId] = await Promise.all([
                window.electronAPI.getAccounts(),
                window.electronAPI.getAccountSettingsTarget?.(),
            ]);
            if (!active) return;
            setAccounts(list);
            const preferred = typeof targetId === 'number' && list.some((a) => a.id === targetId) ? targetId : list[0]?.id ?? null;
            setSelectedAccountId(preferred);
        };
        void load();

        const offTarget = window.electronAPI.onAccountSettingsTarget?.((targetId) => {
            if (typeof targetId === 'number') {
                setSelectedAccountId(targetId);
            }
        });
        const offUpdated = window.electronAPI.onAccountUpdated?.((updated) => {
            setAccounts((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
        });
        const offDeleted = window.electronAPI.onAccountDeleted?.((deleted) => {
            setAccounts((prev) => prev.filter((a) => a.id !== deleted.id));
            setSelectedAccountId((prev) => (prev === deleted.id ? null : prev));
        });

        return () => {
            active = false;
            if (typeof offTarget === 'function') offTarget();
            if (typeof offUpdated === 'function') offUpdated();
            if (typeof offDeleted === 'function') offDeleted();
        };
    }, []);

    const selectedAccount = useMemo(
        () => accounts.find((a) => a.id === selectedAccountId) ?? null,
        [accounts, selectedAccountId],
    );

    useEffect(() => {
        if (!selectedAccount) {
            setEditor(null);
            return;
        }
        setEditor({
            id: selectedAccount.id,
            email: selectedAccount.email,
            provider: selectedAccount.provider,
            display_name: selectedAccount.display_name,
            reply_to: selectedAccount.reply_to,
            organization: selectedAccount.organization,
            signature_text: selectedAccount.signature_text,
            signature_is_html: selectedAccount.signature_is_html,
            signature_file_path: selectedAccount.signature_file_path,
            attach_vcard: selectedAccount.attach_vcard,
            user: selectedAccount.user,
            imap_host: selectedAccount.imap_host,
            imap_port: selectedAccount.imap_port,
            imap_secure: selectedAccount.imap_secure,
            pop3_host: selectedAccount.pop3_host,
            pop3_port: selectedAccount.pop3_port,
            pop3_secure: selectedAccount.pop3_secure,
            smtp_host: selectedAccount.smtp_host,
            smtp_port: selectedAccount.smtp_port,
            smtp_secure: selectedAccount.smtp_secure,
            password: '',
        });
    }, [selectedAccount]);

    async function onSave() {
        if (!editor || saving) return;
        setSaving(true);
        setStatus('Saving account...');
        try {
            const normalized: UpdateAccountPayload = {
                ...editor,
                email: editor.email.trim(),
                user: editor.user.trim(),
                provider: editor.provider?.trim() || null,
                display_name: editor.display_name?.trim() || null,
                reply_to: editor.reply_to?.trim() || null,
                organization: editor.organization?.trim() || null,
                signature_text: editor.signature_text ?? null,
                signature_is_html: editor.signature_is_html ? 1 : 0,
                signature_file_path: editor.signature_file_path?.trim() || null,
                attach_vcard: editor.attach_vcard ? 1 : 0,
                imap_host: editor.imap_host.trim(),
                smtp_host: editor.smtp_host.trim(),
                pop3_host: editor.pop3_host?.trim() || null,
                password: editor.password?.trim() || null,
            };
            await window.electronAPI.updateAccount(editor.id, normalized);
            setStatus('Account settings saved.');
            setEditor((prev) => (prev ? {...prev, password: ''} : prev));
            window.close();
        } catch (e: any) {
            setStatus(`Save failed: ${e?.message || String(e)}`);
        } finally {
            setSaving(false);
        }
    }

    async function onDelete() {
        if (!editor || deleting) return;
        const confirmed = window.confirm(`Delete account "${editor.email}"?\n\nThis removes all synced local data for this account.`);
        if (!confirmed) return;
        setDeleting(true);
        setStatus('Deleting account...');
        try {
            await window.electronAPI.deleteAccount(editor.id);
            setStatus('Account deleted.');
            window.close();
        } catch (e: any) {
            setStatus(`Delete failed: ${e?.message || String(e)}`);
        } finally {
            setDeleting(false);
        }
    }

    return (
        <div className="h-screen w-screen overflow-hidden bg-slate-100 dark:bg-[#2f3136]">
            <div className="flex h-full w-full flex-col">
                <header
                    className="border-b border-slate-200 bg-white px-5 py-4 dark:border-[#3a3d44] dark:bg-[#1f2125]">
                    <h1 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Account Settings</h1>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Manage account configuration and
                        credentials</p>
                </header>

                <div className="flex min-h-0 flex-1 overflow-hidden">
                    <aside
                        className="w-72 shrink-0 border-r border-slate-200 bg-white p-3 dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                        <div className="space-y-1">
                            {accounts.map((account) => (
                                <button
                                    key={account.id}
                                    className={`w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                                        account.id === selectedAccountId
                                            ? 'bg-sky-100 text-sky-900 dark:bg-[#3d4153] dark:text-slate-100'
                                            : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-[#35373c]'
                                    }`}
                                    onClick={() => setSelectedAccountId(account.id)}
                                >
                                    {account.email}
                                </button>
                            ))}
                            {accounts.length === 0 && (
                                <p className="px-2 py-2 text-sm text-slate-500 dark:text-slate-400">No accounts
                                    available.</p>
                            )}
                        </div>
                    </aside>

                    <main className="min-h-0 flex-1 overflow-auto p-6">
                        {!editor && (
                            <div className="text-sm text-slate-500 dark:text-slate-400">Select an account.</div>
                        )}
                        {editor && (
                            <div className="space-y-6">
                                <section
                                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Default
                                        Identity</h2>
                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                                        Each account has an identity that recipients see when reading your messages.
                                    </p>

                                    <div className="mt-4 grid grid-cols-[180px_1fr] items-center gap-3">
                                        <Label>Your Name:</Label>
                                        <Field value={editor.display_name || ''}
                                               onChange={(v) => setEditor((p) => (p ? {...p, display_name: v} : p))}/>
                                        <Label>Email Address:</Label>
                                        <Field value={editor.email}
                                               onChange={(v) => setEditor((p) => (p ? {...p, email: v} : p))}/>
                                        <Label>Reply-to Address:</Label>
                                        <Field value={editor.reply_to || ''}
                                               onChange={(v) => setEditor((p) => (p ? {...p, reply_to: v} : p))}
                                               placeholder="Recipients will reply to this address"/>
                                        <Label>Organization:</Label>
                                        <Field value={editor.organization || ''}
                                               onChange={(v) => setEditor((p) => (p ? {...p, organization: v} : p))}/>
                                        <Label>Signature text:</Label>
                                        <div className="space-y-2">
                                            <label
                                                className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                                <input
                                                    type="checkbox"
                                                    checked={!!editor.signature_is_html}
                                                    onChange={(e) => setEditor((p) => (p ? {
                                                        ...p,
                                                        signature_is_html: e.target.checked ? 1 : 0
                                                    } : p))}
                                                />
                                                Use HTML (e.g., &lt;b&gt;bold&lt;/b&gt;)
                                            </label>
                                            <textarea
                                                value={editor.signature_text || ''}
                                                onChange={(e) => setEditor((p) => (p ? {
                                                    ...p,
                                                    signature_text: e.target.value
                                                } : p))}
                                                className="min-h-28 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
                                            />
                                            <label
                                                className="inline-flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                                                <input
                                                    type="checkbox"
                                                    checked={!!editor.attach_vcard}
                                                    onChange={(e) => setEditor((p) => (p ? {
                                                        ...p,
                                                        attach_vcard: e.target.checked ? 1 : 0
                                                    } : p))}
                                                />
                                                Attach my vCard to messages
                                            </label>
                                        </div>
                                    </div>
                                </section>

                                <section
                                    className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                                    <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Server
                                        Settings</h2>
                                    <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                                        <Field label="User" value={editor.user}
                                               onChange={(v) => setEditor((p) => (p ? {...p, user: v} : p))}/>
                                        <Field label="Provider" value={editor.provider || ''}
                                               onChange={(v) => setEditor((p) => (p ? {...p, provider: v} : p))}/>
                                        <Field type="password" label="New password (optional)"
                                               value={editor.password || ''}
                                               onChange={(v) => setEditor((p) => (p ? {...p, password: v} : p))}/>
                                        <Field label="IMAP host" value={editor.imap_host}
                                               onChange={(v) => setEditor((p) => (p ? {...p, imap_host: v} : p))}/>
                                        <Field type="number" label="IMAP port" value={String(editor.imap_port)}
                                               onChange={(v) => setEditor((p) => (p ? {
                                                   ...p,
                                                   imap_port: Number(v || 0)
                                               } : p))}/>
                                        <Field label="SMTP host" value={editor.smtp_host}
                                               onChange={(v) => setEditor((p) => (p ? {...p, smtp_host: v} : p))}/>
                                        <Field type="number" label="SMTP port" value={String(editor.smtp_port)}
                                               onChange={(v) => setEditor((p) => (p ? {
                                                   ...p,
                                                   smtp_port: Number(v || 0)
                                               } : p))}/>
                                    </div>
                                </section>
                            </div>
                        )}
                    </main>
                </div>

                <footer
                    className="flex items-center justify-between border-t border-slate-200 bg-white px-5 py-3 dark:border-[#3a3d44] dark:bg-[#1f2125]">
                    <button
                        type="button"
                        onClick={() => void onDelete()}
                        disabled={!editor || deleting}
                        className="rounded-md border border-red-300 px-3 py-2 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-700/50 dark:text-red-300 dark:hover:bg-red-900/30"
                    >
                        {deleting ? 'Deleting...' : 'Delete Account'}
                    </button>
                    <div className="flex items-center gap-2">
                        {status && <span className="text-xs text-slate-500 dark:text-slate-400">{status}</span>}
                        <button
                            type="button"
                            onClick={() => window.close()}
                            className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                        >
                            Close
                        </button>
                        <button
                            type="button"
                            onClick={() => void onSave()}
                            disabled={!editor || saving}
                            className="rounded-md bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]"
                        >
                            {saving ? 'Saving...' : 'Save'}
                        </button>
                    </div>
                </footer>
            </div>
        </div>
    );
}

function Field({
                   label,
                   value,
                   onChange,
                   type = 'text',
                   placeholder,
               }: {
    label?: string;
    value: string;
    onChange: (next: string) => void;
    type?: string;
    placeholder?: string;
}) {
    return (
        <label className="block text-sm">
            {label && <span className="mb-1 block font-medium text-slate-700 dark:text-slate-200">{label}</span>}
            <input
                type={type}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-sky-500 dark:border-[#3a3d44] dark:bg-[#1e1f22] dark:text-slate-100 dark:focus:border-[#5865f2]"
            />
        </label>
    );
}

function Label({children}: { children: React.ReactNode }) {
    return <div className="text-sm font-medium text-slate-700 dark:text-slate-200">{children}</div>;
}
