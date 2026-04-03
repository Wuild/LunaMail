import React, {useEffect, useMemo, useState} from 'react';
import type {AppSettings} from '../../preload';

type Service = { host: string; port: number; secure: boolean };
type WizardStep = 1 | 2 | 3;
type VerifyType = 'imap' | 'smtp';

type DiscoverResult = {
    provider?: string | null;
    imap?: Service;
    pop3?: Service;
    smtp?: Service;
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

const SettingsAddAccount: React.FC = () => {
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

    const canGoStep1Next = useMemo(() => !!email.trim() && !!password.trim(), [email, password]);
    const canVerifyManual = useMemo(() => !!imap?.host && !!imap.port && !!smtp?.host && !!smtp.port, [imap, smtp]);

    function resetMessages() {
        setError(null);
        setSuccess(null);
    }

    async function verifyService(type: VerifyType, svc: Service): Promise<VerifyResult> {
        return window.electronAPI.verifyCredentials({
            type,
            host: svc.host,
            port: Number(svc.port),
            secure: svc.secure,
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

    async function onStep1Next() {
        if (!canGoStep1Next) return;
        setLoading(true);
        resetMessages();

        let discovered: DiscoverResult;
        try {
            discovered = (await window.electronAPI.discoverMailSettings(email.trim())) as DiscoverResult;
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
                setImap(discovered?.imap ?? {host: domain ? `imap.${domain}` : '', port: 993, secure: true});
                setPop3(discovered?.pop3 ?? null);
                setSmtp(discovered?.smtp ?? {host: domain ? `smtp.${domain}` : '', port: 465, secure: true});
                setStep(2);
                setSuccess('Autodiscover did not return complete settings. Enter server settings manually.');
                return;
            }

            setProvider(discovered.provider ?? null);
            setImap(discovered.imap!);
            setPop3(discovered.pop3 ?? null);
            setSmtp(discovered.smtp!);

            try {
                await verifyImapAndSmtp(discovered.imap!, discovered.smtp!);
                setSuccess('Account verified successfully.');
                setStep(3);
            } catch (verifyError: any) {
                const message = verifyError?.message || String(verifyError);
                if (message === 'Wrong username or password.') {
                    setError(message);
                    return;
                }
                // Discovery succeeded, but verification failed. Let user review/edit manually.
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
            await window.electronAPI.addAccount({
                email: email.trim(),
                display_name: name.trim() || null,
                provider,
                imap_host: imap.host,
                imap_port: Number(imap.port),
                imap_secure: imap.secure ? 1 : 0,
                pop3_host: pop3?.host ?? null,
                pop3_port: pop3?.port ?? null,
                pop3_secure: pop3 ? (pop3.secure ? 1 : 0) : null,
                smtp_host: smtp.host,
                smtp_port: Number(smtp.port),
                smtp_secure: smtp.secure ? 1 : 0,
                user: email.trim(),
                password,
            });
            setSuccess('Account added successfully.');
            window.close();
        } catch (e: any) {
            setError(e?.message || String(e));
        } finally {
            setLoading(false);
        }
    }

    function updateService(setter: React.Dispatch<React.SetStateAction<Service | null>>, patch: Partial<Service>) {
        setter((prev) => ({host: '', port: 0, secure: true, ...(prev ?? {}), ...patch}));
    }

    const primaryActionDisabled =
        loading ||
        (step === 1 && !canGoStep1Next) ||
        (step === 2 && !canVerifyManual);

    const primaryActionLabel =
        step === 1
            ? (loading ? 'Checking account...' : 'Next')
            : step === 2
                ? (loading ? 'Verifying...' : 'Verify and Continue')
                : (loading ? 'Saving...' : 'Add Account');

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

    function onBack() {
        resetMessages();
        if (step === 2) {
            setStep(1);
            return;
        }
        if (step === 3) {
            setStep(2);
        }
    }

    return (
        <div className="h-screen w-screen overflow-hidden bg-slate-100 dark:bg-[#2f3136]">
            <div
                className="flex h-full w-full overflow-hidden border-slate-200 bg-white dark:border-[#3a3d44] dark:bg-[#313338]">
                <aside
                    className="w-72 shrink-0 border-r border-slate-200 bg-slate-900 px-6 py-7 text-slate-100 dark:border-[#25272c] dark:bg-[#1f2125]">
                    <h2 className="text-lg font-semibold">New Account</h2>
                    <p className="mt-1 text-sm text-slate-400">Secure mail onboarding</p>
                    <div className="mt-8 space-y-4">
                        {[1, 2, 3].map((n) => {
                            const s = n as WizardStep;
                            return (
                                <StepItem key={n} step={s} active={step === s} done={step > s} title={stepMeta[s].title}
                                          subtitle={stepMeta[s].subtitle}/>
                            );
                        })}
                    </div>
                </aside>

                <main className="flex min-h-0 flex-1 flex-col">
                    <div className="border-b border-slate-200 px-8 py-6 dark:border-[#3a3d44]">
                        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Step {step} of
                            3</p>
                        <h3 className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{stepMeta[step].title}</h3>
                        <div className="mt-3 h-1.5 w-full rounded-full bg-slate-200 dark:bg-[#25272c]">
                            <div className="h-1.5 rounded-full bg-sky-600 transition-all dark:bg-[#5865f2]"
                                 style={{width: `${(step / 3) * 100}%`}}/>
                        </div>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-8 py-6">
                        {step === 1 && (
                            <section className="space-y-5">
                                <header>
                                    <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Enter your
                                        account credentials</h3>
                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">We will autodiscover
                                        your
                                        server settings and verify authentication.</p>
                                </header>

                                <div
                                    className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                                    <Field label="Name (optional)" value={name} onChange={setName}
                                           placeholder="Your display name"/>
                                    <Field label="Email" value={email} onChange={setEmail} placeholder="you@domain.com"
                                           className="mt-4"/>
                                    <Field label="Password" value={password} onChange={setPassword} type="password"
                                           className="mt-4"/>
                                </div>
                            </section>
                        )}

                        {step === 2 && (
                            <section className="space-y-5">
                                <header>
                                    <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Manual
                                        server
                                        setup</h3>
                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Autodiscover did not
                                        return complete settings. Enter IMAP and SMTP manually.</p>
                                </header>

                                <div className="grid gap-4">
                                    <ServiceEditor title="IMAP Incoming" service={imap}
                                                   onChange={(patch) => updateService(setImap, patch)} accent="sky"/>
                                    <ServiceEditor title="SMTP Outgoing" service={smtp}
                                                   onChange={(patch) => updateService(setSmtp, patch)} accent="cyan"/>
                                </div>
                            </section>
                        )}

                        {step === 3 && (
                            <section className="space-y-5">
                                <header>
                                    <h3 className="text-2xl font-semibold text-slate-900 dark:text-slate-100">Confirm
                                        account details</h3>
                                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Everything looks
                                        good.
                                        Save to add this mailbox.</p>
                                </header>

                                <div
                                    className="rounded-xl border border-slate-200 bg-slate-50 p-5 dark:border-[#3a3d44] dark:bg-[#2b2d31]">
                                    <SummaryRow label="Email" value={email}/>
                                    <SummaryRow label="Provider" value={provider ?? 'custom'}/>
                                    <SummaryRow label="IMAP" value={`${imap?.host ?? '-'}:${imap?.port ?? '-'}`}/>
                                    <SummaryRow label="SMTP" value={`${smtp?.host ?? '-'}:${smtp?.port ?? '-'}`}/>
                                </div>
                            </section>
                        )}

                        {error &&
                            <p className="mt-5 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-900/20 dark:text-red-300">{error}</p>}
                        {success &&
                            <p className="mt-5 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700 dark:border-emerald-500/40 dark:bg-emerald-900/20 dark:text-emerald-300">{success}</p>}
                    </div>

                    <footer
                        className="flex shrink-0 items-center justify-between border-t border-slate-200 px-8 py-4 dark:border-[#3a3d44]">
                        <button
                            disabled={step === 1 || loading}
                            onClick={onBack}
                            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-[#3a3d44] dark:text-slate-200 dark:hover:bg-[#35373c]"
                        >
                            Back
                        </button>
                        <button
                            disabled={primaryActionDisabled}
                            onClick={onPrimaryAction}
                            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50 ${
                                step === 3
                                    ? 'bg-emerald-600 hover:bg-emerald-700'
                                    : 'bg-sky-600 hover:bg-sky-700 dark:bg-[#5865f2] dark:hover:bg-[#4f5bd5]'
                            }`}
                        >
                            {primaryActionLabel}
                        </button>
                    </footer>
                </main>
            </div>
        </div>
    );
};

const StepItem: React.FC<{ step: WizardStep; active: boolean; done: boolean; title: string; subtitle: string }> = ({
                                                                                                                       step,
                                                                                                                       active,
                                                                                                                       done,
                                                                                                                       title,
                                                                                                                       subtitle,
                                                                                                                   }) => {
    const badgeStyle = done ? 'bg-emerald-500 text-white' : active ? 'bg-sky-500 text-white' : 'bg-slate-700 text-slate-300';
    return (
        <div className={`flex items-start gap-3 rounded-lg px-2 py-2 ${active ? 'bg-slate-800' : ''}`}>
            <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${badgeStyle}`}>{step}</span>
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
        <span className="font-medium text-slate-700 dark:text-slate-200">{label}</span>
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100 dark:border-[#3a3d44] dark:bg-[#1f2125] dark:text-slate-100 dark:focus:border-[#5865f2] dark:focus:ring-[#5865f2]/30"
        />
    </label>
);

const ServiceEditor: React.FC<{
    title: string;
    service: Service | null;
    onChange: (patch: Partial<Service>) => void;
    accent: 'sky' | 'cyan';
}> = ({title, service, onChange, accent}) => {
    const accentClass =
        accent === 'sky'
            ? 'border-sky-200 bg-sky-50/40 dark:border-[#30455a] dark:bg-[#243240]'
            : 'border-cyan-200 bg-cyan-50/40 dark:border-[#2a4e57] dark:bg-[#24373d]';

    return (
        <div className={`rounded-xl border p-4 ${accentClass}`}>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h4>
            <div className="mt-3 grid gap-3">
                <Field label="Host" value={service?.host ?? ''} onChange={(host) => onChange({host})}/>
                <div className="grid grid-cols-2 gap-3">
                    <Field
                        label="Port"
                        value={String(service?.port ?? 0)}
                        onChange={(port) => onChange({port: Number(port)})}
                        type="number"
                    />
                    <label
                        className="mt-7 flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-700 dark:border-[#3a3d44] dark:bg-[#1f2125] dark:text-slate-200">
                        <input
                            type="checkbox"
                            checked={!!service?.secure}
                            onChange={(e) => onChange({secure: e.target.checked})}
                        />
                        TLS (SSL)
                    </label>
                </div>
            </div>
        </div>
    );
};

const SummaryRow: React.FC<{ label: string; value: string }> = ({label, value}) => (
    <div
        className="mb-2 flex items-start justify-between border-b border-slate-200 pb-2 last:mb-0 last:border-b-0 last:pb-0 dark:border-[#3a3d44]">
        <span className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</span>
        <span className="max-w-[65%] break-all text-right text-sm text-slate-900 dark:text-slate-100">{value}</span>
    </div>
);

export default SettingsAddAccount;
