import React, {useEffect, useMemo, useState} from 'react';
import {Navigate, useNavigate} from 'react-router-dom';
import {Check, Globe2, LayoutTemplate, Moon, MonitorCog, Sparkles, Sun} from 'lucide-react';
import {Button} from '@renderer/components/ui/button';
import {FormCheckbox, FormSelect} from '@renderer/components/ui/FormControls';
import SettingsAddAccount from '../add-account/AddAccountForm';
import {APP_LANGUAGE_OPTIONS, APP_THEME_OPTIONS, MAIL_VIEW_OPTIONS} from '@/shared/settingsOptions';
import {parseAppLanguage} from '@/shared/settingsRules';
import {createDefaultAppSettings} from '@/shared/defaults';
import type {AppLanguage, AppTheme, MailView} from '@/shared/ipcTypes';
import {ipcClient} from '@renderer/lib/ipcClient';
import llamaArt from '@resource/llama.png';
import {useThemePreference} from '@renderer/hooks/useAppTheme';

type OnboardingPageProps = {
    hasAccounts: boolean;
};

type OnboardingStep = 'preferences' | 'account';
type ThemeOptionValue = 'light' | 'dark' | 'system';

const THEME_OPTION_META: Record<ThemeOptionValue, { icon: React.ReactNode; subtitle: string }> = {
    light: {
        icon: <Sun size={15}/>,
        subtitle: 'Bright workspace',
    },
    dark: {
        icon: <Moon size={15}/>,
        subtitle: 'Low-light comfort',
    },
    system: {
        icon: <MonitorCog size={15}/>,
        subtitle: 'Follow OS setting',
    },
};

export default function OnboardingPage({hasAccounts}: OnboardingPageProps) {
    const navigate = useNavigate();
    const defaults = useMemo(() => createDefaultAppSettings(), []);
    const [step, setStep] = useState<OnboardingStep>('preferences');
    const [language, setLanguage] = useState<AppLanguage>(defaults.language);
    const [theme, setTheme] = useState<AppTheme>(defaults.theme);
    const [mailView, setMailView] = useState<MailView>(defaults.mailView);
    const [minimizeToTray, setMinimizeToTray] = useState<boolean>(defaults.minimizeToTray);
    const [autoUpdateEnabled, setAutoUpdateEnabled] = useState<boolean>(defaults.autoUpdateEnabled);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    useThemePreference(theme);

    useEffect(() => {
        let active = true;
        ipcClient
            .getAppSettings()
            .then((settings) => {
                if (!active || !settings) return;
                setLanguage(settings.language ?? defaults.language);
                setTheme(settings.theme ?? defaults.theme);
                setMailView(settings.mailView ?? defaults.mailView);
                setMinimizeToTray(Boolean(settings.minimizeToTray));
                setAutoUpdateEnabled(Boolean(settings.autoUpdateEnabled));
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [defaults.autoUpdateEnabled, defaults.language, defaults.mailView, defaults.minimizeToTray, defaults.theme]);

    if (hasAccounts) {
        return <Navigate to="/email" replace/>;
    }

    async function onContinueToAccountStep() {
        setSaving(true);
        setError(null);
        try {
            await ipcClient.updateAppSettings({
                language,
                theme,
                mailView,
                minimizeToTray,
                autoUpdateEnabled,
            });
            setStep('account');
        } catch (e: any) {
            setError(e?.message || String(e));
        } finally {
            setSaving(false);
        }
    }

    return (
        <div className="workspace-content h-full w-full overflow-hidden">
            <div className="panel flex h-full w-full flex-col overflow-hidden border-0">
                {step === 'preferences' ? (
                    <div className="flex h-full min-h-0 flex-col overflow-hidden">
                        <div
                            className="grid h-full w-full min-h-0 overflow-hidden lg:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
                            <section
                                className="relative hidden overflow-hidden px-6 py-7 text-inverse md:px-8 md:py-9 lg:block"
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
                                    className="relative z-10 flex h-full flex-col items-center justify-end text-center">
                                    <div
                                        className="inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide"
                                        style={{
                                            borderColor: 'rgba(255, 255, 255, 0.25)',
                                            backgroundColor: 'rgba(255, 255, 255, 0.10)',
                                        }}
                                    >
                                        <Sparkles size={14}/>
                                        Setup wizard
                                    </div>
                                    <div className="mt-4 w-full max-w-[300px]">
                                        <h1 className="text-3xl font-semibold leading-tight md:text-[2rem]">
                                            Welcome to LlamaMail
                                        </h1>
                                        <p className="mt-2 text-sm text-inverse opacity-80">
                                            Set your workspace preferences in under a minute, then connect your first
                                            account.
                                        </p>
                                        <ul className="mt-6 space-y-3 text-left text-sm text-inverse opacity-90">
                                            <li className="flex items-center gap-2.5">
												<span
                                                    className="rounded-full p-1"
                                                    style={{backgroundColor: 'rgba(255, 255, 255, 0.15)'}}
                                                >
													<Check size={12}/>
												</span>
                                                Theme, language, and message layout
                                            </li>
                                            <li className="flex items-center gap-2.5">
												<span
                                                    className="rounded-full p-1"
                                                    style={{backgroundColor: 'rgba(255, 255, 255, 0.15)'}}
                                                >
													<Check size={12}/>
												</span>
                                                Startup and update behavior
                                            </li>
                                            <li className="flex items-center gap-2.5">
												<span
                                                    className="rounded-full p-1"
                                                    style={{backgroundColor: 'rgba(255, 255, 255, 0.15)'}}
                                                >
													<Check size={12}/>
												</span>
                                                First account setup and sync
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
                            </section>
                            <section className="panel flex min-h-0 flex-col border-0">
                                <header className="ui-border-default border-b px-6 py-5 md:px-8">
                                    <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-3">
                                        <div>
                                            <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide">
                                                Step 1 of 2
                                            </p>
                                            <h2 className="ui-text-primary mt-1 text-2xl font-semibold">
                                                Personalize your setup
                                            </h2>
                                        </div>
                                        <div className="flex items-center gap-2">
											<span
                                                className="h-2.5 w-8 rounded-full"
                                                style={{backgroundColor: 'var(--color-primary)'}}
                                            />
                                            <span
                                                className="h-2.5 w-8 rounded-full"
                                                style={{backgroundColor: 'var(--app-border)'}}
                                            />
                                        </div>
                                    </div>
                                </header>
                                <main className="min-h-0 flex-1 overflow-y-auto px-6 py-5 md:px-8 md:py-6">
                                    <div className="mx-auto w-full max-w-4xl space-y-5">
                                        <section className="panel rounded-xl p-4 md:p-5">
                                            <h3 className="ui-text-primary text-sm font-semibold uppercase tracking-wide">
                                                Theme
                                            </h3>
                                            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                                {APP_THEME_OPTIONS.map((option) => {
                                                    const meta = THEME_OPTION_META[option.value as ThemeOptionValue];
                                                    const selected = theme === option.value;
                                                    return (
                                                        <Button
                                                            key={option.value}
                                                            type="button"
                                                            variant={selected ? 'default' : 'secondary'}
                                                            size="none"
                                                            className={`h-auto rounded-lg border px-3 py-2.5 text-left ${selected ? 'border-transparent' : 'ui-border-default'}`}
                                                            onClick={() => setTheme(option.value)}
                                                        >
															<span className="flex w-full items-start gap-2.5">
																<span className="mt-0.5">{meta.icon}</span>
																<span className="min-w-0">
																	<span className="block text-sm font-semibold">
																		{option.label}
																	</span>
																	<span
                                                                        className={`${selected ? 'text-inverse/80' : 'ui-text-secondary'} block text-xs`}
                                                                    >
																		{meta.subtitle}
																	</span>
																</span>
															</span>
                                                        </Button>
                                                    );
                                                })}
                                            </div>
                                        </section>
                                        <section className="grid gap-4 md:grid-cols-2">
                                            <label className="block text-sm">
												<span
                                                    className="ui-text-secondary mb-1.5 inline-flex items-center gap-1.5 font-medium">
													<Globe2 size={14}/>
													Language
												</span>
                                                <FormSelect
                                                    value={language}
                                                    onChange={(event) =>
                                                        setLanguage(parseAppLanguage(event.target.value))
                                                    }
                                                >
                                                    {APP_LANGUAGE_OPTIONS.map((option) => (
                                                        <option key={option.value} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </FormSelect>
                                            </label>
                                            <label className="block text-sm">
												<span
                                                    className="ui-text-secondary mb-1.5 inline-flex items-center gap-1.5 font-medium">
													<LayoutTemplate size={14}/>
													Mail layout
												</span>
                                                <FormSelect
                                                    value={mailView}
                                                    onChange={(event) => setMailView(event.target.value as MailView)}
                                                >
                                                    {MAIL_VIEW_OPTIONS.map((option) => (
                                                        <option key={option.value} value={option.value}>
                                                            {option.label}
                                                        </option>
                                                    ))}
                                                </FormSelect>
                                            </label>
                                        </section>
                                        <section className="space-y-3">
                                            <label
                                                className="ui-border-default flex items-start justify-between rounded-lg border px-3 py-3 text-sm">
												<span className="pr-4">
													<span className="ui-text-primary block font-medium">
														Minimize to tray
													</span>
													<span className="ui-text-secondary block text-xs">
														Keep LlamaMail running in the background.
													</span>
												</span>
                                                <FormCheckbox
                                                    checked={minimizeToTray}
                                                    onChange={(event) => setMinimizeToTray(event.target.checked)}
                                                />
                                            </label>
                                            <label
                                                className="ui-border-default flex items-start justify-between rounded-lg border px-3 py-3 text-sm">
												<span className="pr-4">
													<span className="ui-text-primary block font-medium">
														Enable auto updates
													</span>
													<span className="ui-text-secondary block text-xs">
														Download and apply updates automatically.
													</span>
												</span>
                                                <FormCheckbox
                                                    checked={autoUpdateEnabled}
                                                    onChange={(event) => setAutoUpdateEnabled(event.target.checked)}
                                                />
                                            </label>
                                        </section>
                                        {error && <p className="notice-danger rounded-lg px-4 py-2 text-sm">{error}</p>}
                                        <p className="ui-text-muted text-xs">
                                            You can change any of these options later in Settings.
                                        </p>
                                    </div>
                                </main>
                                <footer className="app-footer flex shrink-0 items-center justify-end px-6 py-4 md:px-8">
                                    <div className="mx-auto flex w-full max-w-4xl justify-end">
                                        <Button
                                            type="button"
                                            variant="default"
                                            size="default"
                                            className="rounded-md px-5 font-semibold"
                                            disabled={saving}
                                            onClick={() => {
                                                void onContinueToAccountStep();
                                            }}
                                        >
                                            {saving ? 'Saving...' : 'Continue to account setup'}
                                        </Button>
                                    </div>
                                </footer>
                            </section>
                        </div>
                    </div>
                ) : (
                    <SettingsAddAccount
                        embedded
                        onCompleted={() => {
                            navigate('/email', {replace: true});
                        }}
                        onCancel={() => setStep('preferences')}
                    />
                )}
            </div>
        </div>
    );
}
