import React, {useMemo, useState} from 'react';
import {Check, Sparkles} from 'lucide-react';
import type {DavDiscoveryResult} from '../../preload';
import WindowTitleBar from '../components/WindowTitleBar';
import ServiceSettingsCard, {type ServiceSecurityMode} from '../components/settings/ServiceSettingsCard';
import {Button} from '../components/ui/button';
import {FormInput} from '../components/ui/FormControls';
import {useAppTheme} from '../hooks/useAppTheme';
import {isEditableTarget} from '../lib/dom';
import {ipcClient} from '../lib/ipcClient';
import llamaArt from '../../resources/llama.png';

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
        <div className={`${embedded ? 'h-full w-full' : 'h-screen w-screen'} workspace-content overflow-hidden`}>
            <div className="panel flex h-full w-full flex-col overflow-hidden border-0">
                {!embedded && <WindowTitleBar title="Add Account" />}
                <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
                    <aside
                        className="relative hidden min-h-0 overflow-hidden px-6 py-7 text-inverse lg:flex lg:flex-col"
                        style={{
                            backgroundImage:
                                'radial-gradient(120% 120% at 12% 0%, rgba(190, 132, 255, 0.52) 0%, transparent 52%), radial-gradient(120% 120% at 88% 100%, #7b3fe0 0%, transparent 56%), linear-gradient(160deg, #6a34cc 0%, #7440d8 40%, #552ab8 72%, #3c1e86 100%)',
                        }}
                    >
                        <div
                            className="absolute -left-14 top-8 h-52 w-52 rounded-full blur-3xl"
                            style={{backgroundColor: 'rgba(255, 255, 255, 0.10)'}}
                        />
                        <div
                            className="absolute -right-16 bottom-0 h-56 w-56 rounded-full blur-3xl"
                            style={{backgroundColor: 'rgba(236, 72, 153, 0.20)'}}
                        />
                        <div
                            className="absolute inset-x-0 bottom-0 h-40 opacity-45"
                            style={{
                                backgroundImage:
                                    'radial-gradient(70% 130% at 25% 100%, rgba(255,255,255,0.78) 0%, rgba(255,255,255,0.22) 48%, transparent 74%), radial-gradient(80% 120% at 76% 100%, rgba(255,255,255,0.72) 0%, rgba(255,255,255,0.16) 45%, transparent 73%)',
                            }}
                        />
                        <div
                            className="relative z-10 flex h-full min-h-0 flex-col items-center justify-end text-center">
                            <div
                                className="inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide"
                                style={{
                                    borderColor: 'rgba(255, 255, 255, 0.25)',
                                    backgroundColor: 'rgba(255, 255, 255, 0.10)',
                                }}
                            >
                                <Sparkles size={14}/>
                                Account setup
                            </div>
                            <div className="mt-4 w-full max-w-[300px]">
                                <h2 className="text-xl font-semibold">Connect your first mailbox</h2>
                                <p className="mt-1 text-sm text-inverse opacity-80">
                                    We will auto-detect settings, verify auth, and save everything securely.
                                </p>
                                <ul className="mt-5 space-y-2.5 text-left text-sm text-inverse opacity-90">
                                    <li className="flex items-center gap-2.5">
                                        <span
                                            className="rounded-full p-1"
                                            style={{backgroundColor: 'rgba(255, 255, 255, 0.15)'}}
                                        >
                                            <Check size={12}/>
                                        </span>
                                        Fast autodiscover
                                    </li>
                                    <li className="flex items-center gap-2.5">
                                        <span
                                            className="rounded-full p-1"
                                            style={{backgroundColor: 'rgba(255, 255, 255, 0.15)'}}
                                        >
                                            <Check size={12}/>
                                        </span>
                                        Manual fallback when needed
                                    </li>
                                    <li className="flex items-center gap-2.5">
                                        <span
                                            className="rounded-full p-1"
                                            style={{backgroundColor: 'rgba(255, 255, 255, 0.15)'}}
                                        >
                                            <Check size={12}/>
                                        </span>
                                        IMAP/SMTP verification before save
                                    </li>
                                </ul>
                            </div>
                            <div className="mt-6 w-full max-w-[300px]">
                                <img
                                    src={llamaArt}
                                    alt=""
                                    className="mx-auto h-auto w-full max-w-[220px] object-contain drop-shadow-[0_12px_28px_rgba(21,8,46,0.45)]"
                                    draggable={false}
                                />
                            </div>
                        </div>
                    </aside>

                    <form
                        className="flex min-h-0 min-w-0 flex-1 flex-col"
                        onSubmit={onSubmit}
                        onContextMenuCapture={(event) => {
                            if (!isEditableTarget(event.target as HTMLElement | null)) return;
                            event.stopPropagation();
                        }}
                    >
                        <div className="ui-border-default shrink-0 border-b px-6 py-5 md:px-8 md:py-6">
                            <p className="ui-text-muted text-xs font-medium uppercase tracking-wide">
                                Step {step} of 3
                            </p>
                            <h3 className="ui-text-primary mt-1 text-lg font-semibold">{stepMeta[step].title}</h3>
                            <div className="ui-surface-hover mt-3 h-1.5 w-full rounded-full">
                                <div
                                    className="button-primary h-1.5 rounded-full border-0 transition-all"
                                    style={{width: `${(step / 3) * 100}%`}}
                                />
                            </div>
                        </div>
                        <main className="min-h-0 flex-1">
                            <div className="h-full overflow-y-auto px-6 py-5 md:px-8 md:py-6">
                                <div className="mx-auto w-full max-w-5xl">
                                    {step === 1 && (
                                        <section className="space-y-5">
                                            <header>
                                                <h3 className="ui-text-primary text-2xl font-semibold">
                                                    Enter your account credentials
                                                </h3>
                                                <p className="ui-text-muted mt-1 text-sm">
                                                    We will autodiscover your server settings and verify authentication.
                                                </p>
                                            </header>

                                            <div className="space-y-4">
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
                                                />
                                                <Field
                                                    label="Password"
                                                    value={password}
                                                    onChange={setPassword}
                                                    type="password"
                                                />
                                            </div>

                                            {loading && (
                                                <div
                                                    className="notice-info flex items-start gap-3 rounded-xl px-4 py-3 text-sm">
                                                    <span
                                                        className="spinner-info mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full"
                                                        aria-hidden
                                                    />
                                                    <div>
                                                        <p className="font-semibold">Running autodiscover</p>
                                                        <p className="mt-0.5 text-xs opacity-90">
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
                                                <h3 className="ui-text-primary text-2xl font-semibold">
                                                    Manual server setup
                                                </h3>
                                                <p className="ui-text-muted mt-1 text-sm">
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
                                                    controlVariant="subtle"
                                                    controlSize="lg"
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
                                                    controlVariant="subtle"
                                                    controlSize="lg"
                                                />
                                            </div>
                                        </section>
                                    )}

                                    {step === 3 && (
                                        <section className="space-y-5">
                                            <header>
                                                <h3 className="ui-text-primary text-2xl font-semibold">
                                                    Confirm account details
                                                </h3>
                                                <p className="ui-text-muted mt-1 text-sm">
                                                    Everything looks good. Save to add this mailbox.
                                                </p>
                                            </header>

                                            <div className="space-y-1">
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
                                        <p className="notice-danger mt-5 rounded-lg px-4 py-2 text-sm">
                                            {error}
                                        </p>
                                    )}
                                    {success && (
                                        <p className="notice-info mt-5 rounded-lg px-4 py-2 text-sm">
                                            {success}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </main>
                        <footer className="app-footer flex shrink-0 items-center justify-between px-6 py-4 md:px-8">
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
                                className="button-secondary rounded-lg px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {step === 1 && canClose ? 'Cancel' : 'Back'}
                            </Button>
                            <Button
                                type="submit"
                                disabled={primaryActionDisabled}
                                className={`rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                                    step === 3
                                        ? 'button-success'
                                        : 'button-primary'
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

const Field: React.FC<{
    label: string;
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    type?: string;
}> = ({label, value, onChange, placeholder, type = 'text'}) => (
    <label className="block text-sm">
        <span className="ui-text-secondary font-medium">{label}</span>
        <FormInput
            type={type}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
            variant="subtle"
            size="lg"
            className="mt-2"
        />
    </label>
);

const SummaryRow: React.FC<{ label: string; value: string }> = ({label, value}) => (
    <div
        className="ui-border-default mb-2 flex items-start justify-between border-b pb-2 last:mb-0 last:border-b-0 last:pb-0">
        <span className="ui-text-secondary text-sm font-medium">{label}</span>
        <span className="ui-text-primary max-w-[65%] break-all text-right text-sm">{value}</span>
    </div>
);

export default SettingsAddAccount;
