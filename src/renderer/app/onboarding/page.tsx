import React, {useEffect, useMemo} from 'react';
import {useNavigate} from 'react-router-dom';
import {Check, Globe2, LayoutTemplate, MonitorCog, Moon, Sparkles, Sun} from '@llamamail/ui/icon';
import {Button} from '@llamamail/ui/button';
import {FormCheckbox, FormSelect} from '@llamamail/ui/form';
import {APP_LANGUAGE_OPTIONS, APP_THEME_OPTIONS, MAIL_VIEW_OPTIONS} from '@llamamail/app/settingsOptions';
import {parseAppLanguage} from '@llamamail/app/settingsRules';
import {createDefaultAppSettings} from '@llamamail/app/defaults';
import type {AppLanguage, AppTheme, MailView} from '@llamamail/app/ipcTypes';
import {ipcClient} from '@renderer/lib/ipcClient';
import llamaArt from '@resource/llama.png';
import {useThemePreference} from '@renderer/hooks/useAppTheme';
import {useForm} from '@renderer/hooks/useForm';
import {useI18n} from '@llamamail/app/i18n/renderer';

type ThemeOptionValue = 'light' | 'dark' | 'system';
type OnboardingFormValues = {
	language: AppLanguage;
	theme: AppTheme;
	mailView: MailView;
	minimizeToTray: boolean;
	autoUpdateEnabled: boolean;
};

const THEME_OPTION_META: Record<ThemeOptionValue, {icon: React.ReactNode; subtitleKey: string}> = {
	light: {
		icon: <Sun size={15} />,
		subtitleKey: 'theme.light_subtitle',
	},
	dark: {
		icon: <Moon size={15} />,
		subtitleKey: 'theme.dark_subtitle',
	},
	system: {
		icon: <MonitorCog size={15} />,
		subtitleKey: 'theme.system_subtitle',
	},
};

export default function OnboardingPage() {
	const {t} = useI18n();
	const navigate = useNavigate();
	const defaults = useMemo(() => createDefaultAppSettings(), []);
	const allowedThemeValues = useMemo(() => new Set(APP_THEME_OPTIONS.map((option) => option.value)), []);
	const allowedLanguageValues = useMemo(() => new Set(APP_LANGUAGE_OPTIONS.map((option) => option.value)), []);
	const allowedMailViewValues = useMemo(() => new Set(MAIL_VIEW_OPTIONS.map((option) => option.value)), []);
	const form = useForm<OnboardingFormValues, {ok: true}>({
		initialValues: {
			language: defaults.language,
			theme: defaults.theme,
			mailView: defaults.mailView,
			minimizeToTray: defaults.minimizeToTray,
			autoUpdateEnabled: defaults.autoUpdateEnabled,
		},
		validate: (values) => {
			const errors: Partial<Record<keyof OnboardingFormValues, string>> = {};
			if (!allowedLanguageValues.has(values.language)) errors.language = t('onboarding.errors.invalid_language');
			if (!allowedThemeValues.has(values.theme)) errors.theme = t('onboarding.errors.invalid_theme');
			if (!allowedMailViewValues.has(values.mailView))
				errors.mailView = t('onboarding.errors.invalid_mail_layout');
			return errors;
		},
		submit: async (values, {ipc}) => {
			await ipc(() =>
				ipcClient.updateAppSettings({
					language: values.language,
					theme: values.theme,
					mailView: values.mailView,
					minimizeToTray: values.minimizeToTray,
					autoUpdateEnabled: values.autoUpdateEnabled,
				}),
			);
			return {ok: true};
		},
		onSuccess: async () => {
			navigate('/settings/application', {replace: true});
		},
	});
	const setFormValues = form.setValues;
	useThemePreference(form.values.theme);

	useEffect(() => {
		let active = true;
		ipcClient
			.getAppSettings()
			.then((settings) => {
				if (!active || !settings) return;
				setFormValues({
					language: settings.language ?? defaults.language,
					theme: settings.theme ?? defaults.theme,
					mailView: settings.mailView ?? defaults.mailView,
					minimizeToTray: Boolean(settings.minimizeToTray),
					autoUpdateEnabled: Boolean(settings.autoUpdateEnabled),
				});
			})
			.catch(() => undefined);
		return () => {
			active = false;
		};
	}, [
		defaults.autoUpdateEnabled,
		defaults.language,
		defaults.mailView,
		defaults.minimizeToTray,
		defaults.theme,
		setFormValues,
	]);

	return (
		<div className="workspace-content h-full w-full overflow-hidden">
			<div className="panel flex h-full w-full flex-col overflow-hidden border-0">
				<div className="flex h-full min-h-0 flex-col overflow-hidden">
					<div className="grid h-full w-full min-h-0 overflow-hidden lg:grid-cols-[minmax(320px,440px)_minmax(0,1fr)]">
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
							<div className="relative z-10 flex h-full flex-col items-center justify-end text-center">
								<div
									className="inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold tracking-wide"
									style={{
										borderColor: 'rgba(255, 255, 255, 0.25)',
										backgroundColor: 'rgba(255, 255, 255, 0.10)',
									}}
								>
									<Sparkles size={14} />
									{t('onboarding.badge')}
								</div>
								<div className="mt-4 w-full max-w-[300px]">
									<h1 className="text-3xl font-semibold leading-tight md:text-[2rem]">
										{t('onboarding.title')}
									</h1>
									<p className="mt-2 text-sm text-inverse opacity-80">{t('onboarding.subtitle')}</p>
									<ul className="mt-6 space-y-3 text-left text-sm text-inverse opacity-90">
										<li className="flex items-center gap-2.5">
											<span
												className="rounded-full p-1"
												style={{backgroundColor: 'rgba(255, 255, 255, 0.15)'}}
											>
												<Check size={12} />
											</span>
											{t('onboarding.item_theme_language_layout')}
										</li>
										<li className="flex items-center gap-2.5">
											<span
												className="rounded-full p-1"
												style={{backgroundColor: 'rgba(255, 255, 255, 0.15)'}}
											>
												<Check size={12} />
											</span>
											{t('onboarding.item_startup_and_updates')}
										</li>
										<li className="flex items-center gap-2.5">
											<span
												className="rounded-full p-1"
												style={{backgroundColor: 'rgba(255, 255, 255, 0.15)'}}
											>
												<Check size={12} />
											</span>
											{t('onboarding.item_use_without_account')}
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
											{t('onboarding.quick_setup')}
										</p>
										<h2 className="ui-text-primary mt-1 text-2xl font-semibold">
											{t('onboarding.personalize_setup')}
										</h2>
									</div>
								</div>
							</header>
							<main className="min-h-0 flex-1 overflow-y-auto px-6 py-5 md:px-8 md:py-6">
								<div className="mx-auto w-full max-w-4xl space-y-5">
									<section className="panel rounded-xl p-4 md:p-5">
										<h3 className="ui-text-primary text-sm font-semibold uppercase tracking-wide">
											{t('onboarding.theme')}
										</h3>
										<div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
											{APP_THEME_OPTIONS.map((option) => {
												const meta = THEME_OPTION_META[option.value as ThemeOptionValue];
												const selected = form.values.theme === option.value;
												return (
													<Button
														key={option.value}
														type="button"
														variant={selected ? 'default' : 'secondary'}
														size="none"
														className={`h-auto rounded-lg border px-3 py-2.5 text-left ${selected ? 'border-transparent' : 'ui-border-default'}`}
														onClick={() => form.setFieldValue('theme', option.value)}
													>
														<span className="flex w-full items-start gap-2.5">
															<span className="mt-0.5">{meta.icon}</span>
															<span className="min-w-0">
																<span className="block text-sm font-semibold">
																	{option.value === 'light'
																		? t('settings.layout.theme_light')
																		: option.value === 'dark'
																			? t('settings.layout.theme_dark')
																			: t('settings.layout.theme_system')}
																</span>
																<span
																	className={`${selected ? 'text-inverse/80' : 'ui-text-secondary'} block text-xs`}
																>
																	{t(meta.subtitleKey)}
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
											<span className="ui-text-secondary mb-1.5 inline-flex items-center gap-1.5 font-medium">
												<Globe2 size={14} />
												{t('settings.application.language')}
											</span>
											<FormSelect
												value={form.values.language}
												onChange={(event) =>
													form.setFieldValue('language', parseAppLanguage(event.target.value))
												}
											>
												<option value="system">{t('language.system')}</option>
												<option value="en-US">{t('language.en_us')}</option>
												<option value="sv-SE">{t('language.sv_se')}</option>
											</FormSelect>
										</label>
										<label className="block text-sm">
											<span className="ui-text-secondary mb-1.5 inline-flex items-center gap-1.5 font-medium">
												<LayoutTemplate size={14} />
												{t('onboarding.mail_layout')}
											</span>
											<FormSelect
												value={form.values.mailView}
												onChange={(event) =>
													form.setFieldValue('mailView', event.target.value as MailView)
												}
											>
												{MAIL_VIEW_OPTIONS.map((option) => (
													<option key={option.value} value={option.value}>
														{option.value === 'side-list'
															? t('onboarding.mail_layout_side_list')
															: t('onboarding.mail_layout_top_table')}
													</option>
												))}
											</FormSelect>
										</label>
									</section>
									<section className="space-y-3">
										<label className="ui-border-default flex items-start justify-between rounded-lg border px-3 py-3 text-sm">
											<span className="pr-4">
												<span className="ui-text-primary block font-medium">
													{t('settings.application.minimize_to_tray')}
												</span>
												<span className="ui-text-secondary block text-xs">
													{t('onboarding.minimize_to_tray_description')}
												</span>
											</span>
											<FormCheckbox
												checked={form.values.minimizeToTray}
												onChange={(event) =>
													form.setFieldValue('minimizeToTray', event.target.checked)
												}
											/>
										</label>
										<label className="ui-border-default flex items-start justify-between rounded-lg border px-3 py-3 text-sm">
											<span className="pr-4">
												<span className="ui-text-primary block font-medium">
													{t('onboarding.enable_auto_updates')}
												</span>
												<span className="ui-text-secondary block text-xs">
													{t('onboarding.enable_auto_updates_description')}
												</span>
											</span>
											<FormCheckbox
												checked={form.values.autoUpdateEnabled}
												onChange={(event) =>
													form.setFieldValue('autoUpdateEnabled', event.target.checked)
												}
											/>
										</label>
									</section>
									{form.formError && (
										<p className="notice-danger rounded-lg px-4 py-2 text-sm">{form.formError}</p>
									)}
									<p className="ui-text-muted text-xs">{t('onboarding.change_later_in_settings')}</p>
								</div>
							</main>
							<footer className="app-footer flex shrink-0 items-center justify-end px-6 py-4 md:px-8">
								<div className="mx-auto flex w-full max-w-4xl justify-end">
									<Button
										type="button"
										variant="default"
										size="default"
										className="rounded-md px-5 font-semibold"
										disabled={form.isSubmitting}
										onClick={() => void form.submit()}
									>
										{form.isSubmitting
											? t('settings.status.saving')
											: t('onboarding.save_and_continue')}
									</Button>
								</div>
							</footer>
						</section>
					</div>
				</div>
			</div>
		</div>
	);
}
