import React, {useMemo, useState} from 'react';
import type {DavDiscoveryResult} from '../../preload';
import WindowTitleBar from '../components/WindowTitleBar';
import ServiceSettingsCard, {type ServiceSecurityMode} from '../components/settings/ServiceSettingsCard';
import {Button} from '../components/ui/button';
import {FormInput} from '../components/ui/FormControls';
import {useAppTheme} from '../hooks/useAppTheme';
import {isEditableTarget} from '../lib/dom';
import {ipcClient} from '../lib/ipcClient';

type Service = { host: string; port: number; security: ServiceSecurityMode };
type WizardStep = 1 | 2 | 3;
type VerifyType = 'imap' | 'smtp';
type DiscoverService = { host: string; port: number; secure: boolean };

type DiscoverResult = {
    provider?: string | null;
    imap?: DiscoverService;
    pop3?: DiscoverService;
    smtp?: DiscoverService;
};

type VerifyResult = {
    ok: boolean;
    error?: string;
};

const stepMeta: Record<WizardStep, { title: string; subtitle: string }> = {
    1: {title: 'Credentials', subtitle: 'Email and password'},
    2: {title: 'Manual Setup', subtitle: 'Server settings'},
    3: {title: 'Confirm', subtitle: 'Review and add'},
};

type SettingsAddAccountProps = {
    embedded?: boolean;
    onCompleted?: () => void;
    onCancel?: () => void;
};

const SettingsAddAccount: React.FC<SettingsAddAccountProps> = ({embedded = false, onCompleted, onCancel}) => {
    useAppTheme();
    const [step, setStep] = useState<WizardStep>(1);
    const [email, setEmail] = useState('');
    const [name, setName] = useState('');
    const [password, setPassword] = useState('');
    const [provider, setProvider] = useState<string | null>(null);
    const [imap, setImap] = useState<Service | null>(null);
    const [pop3, setPop3] = useState<Service | null>(null);
    const [smtp, setSmtp] = useState<Service | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [davDiscovery, setDavDiscovery] = useState<DavDiscoveryResult | null>(null);

    const canGoStep1Next = useMemo(() => !!email.trim() && !!password.trim(), [email, password]);
    const canVerifyManual = useMemo(() => !!imap?.host && !!imap.port && !!smtp?.host && !!smtp.port, [imap, smtp]);

    function resetMessages() {
        setError(null);
        setSuccess(null);
    }

    async function verifyService(type: VerifyType, svc: Service): Promise<VerifyResult> {
        return ipcClient.verifyCredentials({
            type,
            host: svc.host,
            port: Number(svc.port),
            secure: svc.security === 'ssl',
            user: email.trim(),
            password,
        });
    }

    async function verifyImapAndSmtp(imapService: Service, smtpService: Service): Promise<void> {
        const imapResult = await verifyService('imap', imapService);
        if (!imapResult.ok) {
            throw new Error(imapResult.error || 'IMAP verification failed.');
        }

        const smtpResult = await verifyService('smtp', smtpService);
        if (!smtpResult.ok) {
            throw new Error(smtpResult.error || 'SMTP verification failed.');
        }
    }

    async function discoverDavPreview(imapService: Service): Promise<void> {
        try {
            const discovered = await ipcClient.discoverDavPreview({
                email: email.trim(),
                user: email.trim(),
                password,
                imapHost: imapService.host,
            });
            setDavDiscovery(discovered);
        } catch {
            setDavDiscovery(null);
        }
    }

    async function onStep1Next() {
        if (!canGoStep1Next) return;
        setLoading(true);
        resetMessages();

        let discovered: DiscoverResult;
        try {
            discovered = (await ipcClient.discoverMailSettings(email.trim())) as DiscoverResult;
        } catch (e: any) {
            const message = e?.message || String(e);
            setError(`Could not run autodiscover: ${message}`);
            setLoading(false);
            return;
        }

        try {
            const hasAutoSettings = !!discovered?.imap && !!discovered?.smtp;
            if (!hasAutoSettings) {
                const [, domain] = email.trim().split('@');
                setProvider(discovered?.provider ?? null);
                setImap(
                    discovered?.imap
                        ? {
                              host: discovered.imap.host,
                              port: discovered.imap.port,
                              security: discovered.imap.secure ? 'ssl' : 'starttls',
                          }
                        : {host: domain ? `imap.${domain}` : '', port: 993, security: 'ssl'},
                );
                setPop3(
                    discovered?.pop3
                        ? {
                              host: discovered.pop3.host,
                              port: discovered.pop3.port,
                              security: discovered.pop3.secure ? 'ssl' : 'starttls',
                          }
                        : null,
                );
                setSmtp(
                    discovered?.smtp
                        ? {
                              host: discovered.smtp.host,
                              port: discovered.smtp.port,
                              security: discovered.smtp.secure ? 'ssl' : 'starttls',
                          }
                        : {host: domain ? `smtp.${domain}` : '', port: 465, security: 'ssl'},
                );
                setStep(2);
                setSuccess('Autodiscover did not return complete settings. Enter server settings manually.');
                return;
            }

            setProvider(discovered.provider ?? null);
            setImap({
                host: discovered.imap!.host,
                port: discovered.imap!.port,
                security: discovered.imap!.secure ? 'ssl' : 'starttls',
            });
            setPop3(
                discovered.pop3
                    ? {
                          host: discovered.pop3.host,
                          port: discovered.pop3.port,
                          security: discovered.pop3.secure ? 'ssl' : 'starttls',
                      }
                    : null,
            );
            setSmtp({
                host: discovered.smtp!.host,
                port: discovered.smtp!.port,
                security: discovered.smtp!.secure ? 'ssl' : 'starttls',
            });
            const discoveredImap: Service = {
                host: discovered.imap!.host,
                port: discovered.imap!.port,
                security: discovered.imap!.secure ? 'ssl' : 'starttls',
            };
            const discoveredSmtp: Service = {
                host: discovered.smtp!.host,
                port: discovered.smtp!.port,
                security: discovered.smtp!.secure ? 'ssl' : 'starttls',
            };

            try {
                await verifyImapAndSmtp(discoveredImap, discoveredSmtp);
                await discoverDavPreview(discoveredImap);
                setSuccess('Account verified successfully.');
                setStep(3);
            } catch (verifyError: any) {
                const message = verifyError?.message || String(verifyError);
                if (message === 'Wrong username or password.') {
                    setError(message);
                    return;
                }
                setStep(2);
                setSuccess('Autodiscover succeeded. Please review server settings manually.');
            }
        } finally {
            setLoading(false);
        }
    }

    async function onVerifyManual() {
        if (!imap || !smtp || !canVerifyManual) return;
        setLoading(true);
        resetMessages();
        try {
            await verifyImapAndSmtp(imap, smtp);
            await discoverDavPreview(imap);
            setSuccess('Server settings verified successfully.');
            setStep(3);
        } catch (e: any) {
            const message = e?.message || String(e);
            setError(message === 'Wrong username or password.' ? message : `Could not verify settings: ${message}`);
        } finally {
            setLoading(false);
        }
    }

    async function onSave() {
        if (!imap || !smtp) return;
        setLoading(true);
        resetMessages();
        try {
            await ipcClient.addAccount({
                email: email.trim(),
                display_name: name.trim() || null,
                provider,
                imap_host: imap.host,
                imap_port: Number(imap.port),
                imap_secure: imap.security === 'ssl' ? 1 : 0,
                pop3_host: pop3?.host ?? null,
                pop3_port: pop3?.port ?? null,
                pop3_secure: pop3 ? (pop3.security === 'ssl' ? 1 : 0) : null,
                smtp_host: smtp.host,
                smtp_port: Number(smtp.port),
                smtp_secure: smtp.security === 'ssl' ? 1 : 0,
                user: email.trim(),
                password,
            });
            setSuccess('Account added successfully.');
            onCompleted?.();
            if (!embedded) {
                window.close();
            }
        } catch (e: any) {
            setError(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    }

    function updateService(setter: React.Dispatch<React.SetStateAction<Service | null>>, patch: Partial<Service>) {
        setter((prev) => ({host: '', port: 0, security: 'ssl', ...(prev ?? {}), ...patch}));
    }

    const primaryActionDisabled = loading || (step === 1 && !canGoStep1Next) || (step === 2 && !canVerifyManual);

    const primaryActionLabel =
        step === 1
            ? loading
                ? 'Checking account...'
                : 'Next'
            : step === 2
              ? loading
                  ? 'Verifying...'
                  : 'Verify and Continue'
              : loading
                ? 'Saving...'
                : 'Add Account';

    async function onPrimaryAction() {
        if (step === 1) {
            await onStep1Next();
            return;
        }
        if (step === 2) {
            await onVerifyManual();
            return;
        }
        await onSave();
    }

    function onSubmit(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (primaryActionDisabled) return;
        void onPrimaryAction();
    }

    function onBack() {
        resetMessages();
        if (step === 2) {
            setStep(1);
            setDavDiscovery(null);
            return;
        }
        if (step === 3) {
            setStep(2);
        }
    }

    const canClose = embedded && typeof onCancel === 'function';

    return (
        <div className={`${embedded ? 'h-full w-full' : 'h-screen w-screen'} lm-content overflow-hidden`}>
            <div className="lm-card flex h-full w-full flex-col overflow-hidden border-0">
                {!embedded && <WindowTitleBar title="Add Account" />}
                <div className="flex min-h-0 flex-1 overflow-hidden">
                    <aside className="lm-sidebar w-72 shrink-0 px-6 py-7">
                        <h2 className="text-lg font-semibold">New Account</h2>
                        <p className="lm-text-muted mt-1 text-sm">Secure mail onboarding</p>
                        <div className="mt-8 space-y-4">
                            {[1, 2, 3].map((n) => {
                                const s = n as WizardStep;
                                return (
                                    <StepRailItem
                                        key={n}
                                        step={s}
                                        active={step === s}
                                        done={step > s}
                                        title={stepMeta[s].title}
                                        subtitle={stepMeta[s].subtitle}
                                    />
                                );
                            })}
                        </div>
                    </aside>

                    <form
                        className="flex min-h-0 flex-1 flex-col"
                        onSubmit={onSubmit}
                        onContextMenuCapture={(event) => {
                            if (!isEditableTarget(event.target as HTMLElement | null)) return;
                            event.stopPropagation();
                        }}
                    >
                        <div className="lm-border-default shrink-0 border-b px-8 py-6">
                            <p className="lm-text-muted text-xs font-medium uppercase tracking-wide">
                                Step {step} of 3
                            </p>
                            <h3 className="lm-text-primary mt-1 text-lg font-semibold">{stepMeta[step].title}</h3>
                            <div className="lm-bg-hover mt-3 h-1.5 w-full rounded-full">
                                <div
                                    className="lm-btn-primary h-1.5 rounded-full border-0 transition-all"
                                    style={{width: `${(step / 3) * 100}%`}}
                                />
                            </div>
                        </div>
                        <main className="min-h-0 flex-1">
                            <div className="h-full overflow-y-auto px-8 py-6">
                                <div className="mx-auto w-full max-w-5xl">
                                    {step === 1 && (
                                        <section className="space-y-5">
                                            <header>
                                                <h3 className="lm-text-primary text-2xl font-semibold">
                                                    Enter your account credentials
                                                </h3>
                                                <p className="lm-text-muted mt-1 text-sm">
                                                    We will autodiscover your server settings and verify authentication.
                                                </p>
                                            </header>

                                            <div className="lm-card rounded-xl p-5">
                                                <Field
                                                    label="Name (optional)"
                                                    value={name}
                                                    onChange={setName}
                                                    placeholder="Your display name"
                                                />
                                                <Field
                                                    label="Email"
                                                    value={email}
                                                    onChange={setEmail}
                                                    placeholder="you@domain.com"
                                                    className="mt-4"
                                                />
                                                <Field
                                                    label="Password"
                                                    value={password}
                                                    onChange={setPassword}
                                                    type="password"
                                                    className="mt-4"
                                                />
                                            </div>

                                            {loading && (
                                                <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                                                    <span
                                                        className="mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-sky-300 border-t-sky-600"
                                                        aria-hidden
                                                    />
                                                    <div>
                                                        <p className="font-semibold">Running autodiscover</p>
                                                        <p className="mt-0.5 text-xs text-sky-700/90">
                                                            Detecting server settings and verifying IMAP/SMTP credentials.
                                                        </p>
                                                    </div>
                                                </div>
                                            )}
                                        </section>
                                    )}

                                    {step === 2 && (
                                        <section className="space-y-5">
                                            <header>
                                                <h3 className="lm-text-primary text-2xl font-semibold">
                                                    Manual server setup
                                                </h3>
                                                <p className="lm-text-muted mt-1 text-sm">
                                                    Autodiscover did not return complete settings. Enter IMAP and SMTP manually.
                                                </p>
                                            </header>

                                            <div className="grid gap-4">
                                                <ServiceSettingsCard
                                                    title="IMAP Incoming"
                                                    host={imap?.host ?? ''}
                                                    port={imap?.port ?? 0}
                                                    security={imap?.security ?? 'ssl'}
                                                    onHostChange={(host) => updateService(setImap, {host})}
                                                    onPortChange={(port) => updateService(setImap, {port})}
                                                    onSecurityChange={(security) => updateService(setImap, {security})}
                                                    allowNone
                                                    tone="muted"
                                                />
                                                <ServiceSettingsCard
                                                    title="SMTP Outgoing"
                                                    host={smtp?.host ?? ''}
                                                    port={smtp?.port ?? 0}
                                                    security={smtp?.security ?? 'ssl'}
                                                    onHostChange={(host) => updateService(setSmtp, {host})}
                                                    onPortChange={(port) => updateService(setSmtp, {port})}
                                                    onSecurityChange={(security) => updateService(setSmtp, {security})}
                                                    allowNone
                                                    tone="muted"
                                                />
                                            </div>
                                        </section>
                                    )}

                                    {step === 3 && (
                                        <section className="space-y-5">
                                            <header>
                                                <h3 className="lm-text-primary text-2xl font-semibold">
                                                    Confirm account details
                                                </h3>
                                                <p className="lm-text-muted mt-1 text-sm">
                                                    Everything looks good. Save to add this mailbox.
                                                </p>
                                            </header>

                                            <div className="lm-card rounded-xl p-5">
                                                <SummaryRow label="Email" value={email} />
                                                <SummaryRow label="Provider" value={provider ?? 'custom'} />
                                                <SummaryRow label="IMAP" value={`${imap?.host ?? '-'}:${imap?.port ?? '-'}`} />
                                                <SummaryRow label="SMTP" value={`${smtp?.host ?? '-'}:${smtp?.port ?? '-'}`} />
                                                {davDiscovery?.carddavUrl && <SummaryRow label="CardDAV" value={davDiscovery.carddavUrl} />}
                                                {davDiscovery?.caldavUrl && <SummaryRow label="CalDAV" value={davDiscovery.caldavUrl} />}
                                            </div>
                                        </section>
                                    )}

                                    {error && (
                                        <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
                                            {error}
                                        </p>
                                    )}
                                    {success && (
                                        <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
                                            {success}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </main>
                        <footer className="lm-footer flex shrink-0 items-center justify-between px-8 py-4">
                            <Button
                                type="button"
                                disabled={loading || (!canClose && step === 1)}
                                onClick={() => {
                                    if (step === 1 && canClose) {
                                        onCancel?.();
                                        return;
                                    }
                                    onBack();
                                }}
                                className="lm-btn-secondary rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {step === 1 && canClose ? 'Cancel' : 'Back'}
                            </Button>
                            <Button
                                type="submit"
                                disabled={primaryActionDisabled}
                                className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                                    step === 3
                                        ? 'bg-emerald-600 hover:bg-emerald-700'
                                        : 'lm-btn-primary'
                                }`}
                            >
                                {primaryActionLabel}
                            </Button>
                        </footer>
                    </form>
                </div>
            </div>
        </div>
    );
};

const StepRailItem: React.FC<{
    step: WizardStep;
    active: boolean;
    done: boolean;
    title: string;
    subtitle: string;
}> = ({step, active, done, title, subtitle}) => {
    const badgeStyle = done ? 'bg-emerald-500 text-white' : active ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300';
    return (
        <div className={`flex items-start gap-3 rounded-lg px-2 py-2 ${active ? 'bg-slate-800' : ''}`}>
            <span className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${badgeStyle}`}>
                {step}
            </span>
            <div>
                <p className={`text-sm font-medium ${active ? 'text-white' : 'text-slate-200'}`}>{title}</p>
                <p className="text-xs text-slate-400">{subtitle}</p>
            </div>
        </div>
    );
};

const Field: React.FC<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: string;
    className?: string;
}> = ({label, value, onChange, placeholder, type = 'text', className = ''}) => (
    <label className={`block text-sm ${className}`}>
        <span className="lm-text-secondary font-medium">{label}</span>
        <FormInput
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            className="mt-1.5 py-2.5"
        />
    </label>
);

const SummaryRow: React.FC<{ label: string; value: string }> = ({label, value}) => (
    <div className="lm-border-default mb-2 flex items-start justify-between border-b pb-2 last:mb-0 last:border-b-0 last:pb-0">
        <span className="lm-text-secondary text-sm font-medium">{label}</span>
        <span className="lm-text-primary max-w-[65%] break-all text-right text-sm">{value}</span>
    </div>
);

export default SettingsAddAccount;
