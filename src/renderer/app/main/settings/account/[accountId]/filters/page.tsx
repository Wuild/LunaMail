import {useOutletContext} from 'react-router-dom';
import type {MailFilterActionType, MailFilterField, MailFilterMatchMode, MailFilterOperator} from '@preload';
import {Button} from '@llamamail/ui/button';
import {Card} from '@llamamail/ui/card';
import {FormCheckbox, FormInput, FormSelect} from '@llamamail/ui/form';
import {Modal} from '@llamamail/ui/modal';
import {isProtectedFolder} from '@renderer/features/mail/folders';
import {getFolderColorClass, getFolderIcon} from '@renderer/lib/mail/folderPresentation';
import {cn} from '@llamamail/ui/utils';
import {useI18n} from '@llamamail/app/i18n/renderer';
import type {UseAccountSettingsRouteResult} from '../useAccountSettingsRoute';

export default function SettingsAccountFiltersPage() {
	const {t} = useI18n();
	const {
		editor,
		mailFilters,
		mailFilterBusy,
		runningFilterId,
		mailFilterModal,
		setMailFilterModal,
		updateMailFilterDraft,
		onSaveMailFilterModal,
		onOpenCreateMailFilter,
		onOpenEditMailFilter,
		onRunMailFilter,
		onDeleteMailFilter,
		accountFolders,
	} = useOutletContext<UseAccountSettingsRouteResult>();

	if (!editor) return null;

	const getFolderLabel = (name: string, path: string): string => {
		const displayName = String(name || '').trim();
		const displayPath = String(path || '').trim();
		if (!displayPath || displayPath.toLowerCase() === displayName.toLowerCase()) {
			return displayName || displayPath;
		}
		return `${displayName || displayPath} (${displayPath})`;
	};

	const protectedFolders = accountFolders.filter((folder) => isProtectedFolder(folder));
	const customFolders = accountFolders.filter((folder) => !isProtectedFolder(folder));
	const toFolderOption = (folder: (typeof accountFolders)[number]) => {
		const iconColorClass = getFolderColorClass(folder.color);
		return {
			value: folder.path,
			label: getFolderLabel(folder.custom_name || folder.name || '', folder.path),
			icon: <span className={cn('inline-flex items-center', iconColorClass)}>{getFolderIcon(folder)}</span>,
		};
	};

	const folderOptions = [
		{
			value: '',
			label: t('settings.account_filters.choose_folder'),
		},
		...protectedFolders.map(toFolderOption),
		...(protectedFolders.length > 0 && customFolders.length > 0
			? [
					{
						value: '__folder-divider__',
						label: t('settings.account_filters.custom_folders'),
						disabled: true,
					},
				]
			: []),
		...customFolders.map(toFolderOption),
		...(accountFolders.length === 0
			? [
					{
						value: '__no-folders__',
						label: t('settings.account_filters.no_folders_for_account'),
						disabled: true,
					},
				]
			: []),
	];

	return (
		<>
			<Card
				header={
					<div className="flex items-start justify-between gap-3">
						<div>
							<h2 className="ui-text-primary text-base font-semibold">{t('settings.account_filters.title')}</h2>
							<p className="mt-1 ui-text-muted text-sm">
								{t('settings.account_filters.subtitle')}
							</p>
						</div>
						<div className="flex items-center gap-2">
							<Button
								type="button"
								variant="secondary"
								size="sm"
								onClick={() => void onRunMailFilter()}
								disabled={runningFilterId !== null || mailFilterBusy || !!mailFilterModal}
								className="rounded-md"
							>
								{runningFilterId === -1
									? t('settings.account_filters.running')
									: t('settings.account_filters.run_all')}
							</Button>
							<Button
								type="button"
								variant="default"
								size="sm"
								onClick={onOpenCreateMailFilter}
								disabled={mailFilterBusy || !!mailFilterModal}
								className="rounded-md font-medium"
							>
								{t('settings.account_filters.add_rule')}
							</Button>
						</div>
					</div>
				}
			>
				<div className="space-y-4">
					{mailFilters.length === 0 && (
						<div className="ui-border-default ui-text-muted rounded-md border border-dashed px-3 py-4 text-sm">
							{t('settings.account_filters.no_rules')}
						</div>
					)}
					{mailFilters.map((filter) => (
						<Card key={filter.id} variant="outline" size="sm">
							<div className="flex items-start justify-between gap-3">
								<div>
									<div className="ui-text-primary text-sm font-semibold">{filter.name}</div>
									<div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
										<span
											className={cn(
												'rounded px-2 py-0.5',
												filter.enabled ? 'chip-success' : 'ui-surface-hover ui-text-secondary',
											)}
										>
											{filter.enabled
												? t('settings.account_filters.enabled')
												: t('settings.account_filters.disabled')}
										</span>
										<span className="ui-surface-hover ui-text-secondary rounded px-2 py-0.5">
											{filter.run_on_incoming
												? t('settings.account_filters.runs_on_new_mail')
												: t('settings.account_filters.manual_only')}
										</span>
										<span className="ui-surface-hover ui-text-secondary rounded px-2 py-0.5">
											{t('settings.account_filters.match_badge', {
												mode: t(`settings.account_filters.match_mode_badge.${filter.match_mode}`),
											})}
										</span>
									</div>
									<div className="mt-2 ui-text-muted text-xs">
										{filter.match_mode === 'all_messages'
											? t('settings.account_filters.applies_all_messages')
											: filter.conditions.length === 1
												? t('settings.account_filters.conditions_count_one', {
													count: filter.conditions.length,
												})
												: t('settings.account_filters.conditions_count_other', {
													count: filter.conditions.length,
												})}
										{' · '}
										{filter.actions.length === 1
											? t('settings.account_filters.actions_count_one', {count: filter.actions.length})
											: t('settings.account_filters.actions_count_other', {
												count: filter.actions.length,
											})}
									</div>
								</div>
							</div>
							<div className="mt-3 flex items-center gap-2">
								<Button
									type="button"
									variant="default"
									size="sm"
									onClick={() => onOpenEditMailFilter(filter)}
									disabled={mailFilterBusy || !!mailFilterModal}
									className="rounded-md font-medium"
								>
									{t('settings.account_filters.edit')}
								</Button>
								<Button
									type="button"
									variant="secondary"
									size="sm"
									onClick={() => void onRunMailFilter(filter.id)}
									disabled={runningFilterId !== null || mailFilterBusy || !!mailFilterModal}
									className="rounded-md"
								>
									{runningFilterId === filter.id
										? t('settings.account_filters.running')
										: t('settings.account_filters.run_rule')}
								</Button>
								<Button
									type="button"
									variant="danger"
									size="sm"
									onClick={() => void onDeleteMailFilter(filter.id)}
									disabled={mailFilterBusy}
									className="rounded-md"
								>
									{t('settings.account_filters.delete')}
								</Button>
							</div>
						</Card>
					))}
				</div>
			</Card>

			{mailFilterModal && (
				<Modal
					open
					onClose={() => setMailFilterModal(null)}
					backdropClassName="z-[1200]"
					contentClassName="max-w-4xl overflow-hidden p-0"
				>
					<header className="ui-border-default flex items-start justify-between gap-3 border-b px-5 py-4">
						<div className="min-w-0">
							<h3 className="ui-text-primary text-lg font-semibold">
								{mailFilterModal.mode === 'create'
									? t('settings.account_filters.create_rule')
									: t('settings.account_filters.edit_rule')}
							</h3>
							<p className="ui-text-muted mt-1 text-sm">
								{t('settings.account_filters.modal_subtitle')}
							</p>
						</div>
						<Button
							type="button"
							variant="secondary"
							size="sm"
							className="rounded-md px-2"
							onClick={() => setMailFilterModal(null)}
							disabled={mailFilterBusy}
						>
							{t('settings.account_filters.close')}
						</Button>
					</header>

					<div className="max-h-[72vh] space-y-4 overflow-y-auto px-5 py-4">
						<section className="panel rounded-xl p-4">
							<div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-end">
								<label className="block text-sm">
									<span className="ui-text-secondary mb-1.5 block font-medium">
										{t('settings.account_filters.filter_name')}
									</span>
									<FormInput
										value={mailFilterModal.draft.name}
										onChange={(e) =>
											updateMailFilterDraft((prev) => ({
												...prev,
												name: e.target.value,
											}))
										}
										placeholder={t('settings.account_filters.filter_name_placeholder')}
									/>
								</label>
								<label className="ui-border-default inline-flex h-12 items-center gap-2 rounded-lg border px-3 text-sm ui-text-secondary">
									<FormCheckbox
										checked={mailFilterModal.draft.enabled}
										onChange={(e) =>
											updateMailFilterDraft((prev) => ({
												...prev,
												enabled: e.target.checked,
											}))
										}
									/>
									{t('settings.account_filters.enabled')}
								</label>
								<label className="ui-border-default inline-flex h-12 items-center gap-2 rounded-lg border px-3 text-sm ui-text-secondary">
									<FormCheckbox
										checked={mailFilterModal.draft.run_on_incoming}
										onChange={(e) =>
											updateMailFilterDraft((prev) => ({
												...prev,
												run_on_incoming: e.target.checked,
											}))
										}
									/>
									{t('settings.account_filters.getting_new_mail')}
								</label>
							</div>
						</section>

						<section className="panel rounded-xl p-4">
							<div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:items-end">
								<label className="block text-sm">
									<span className="ui-text-secondary mb-1.5 block font-medium">
										{t('settings.account_filters.match_mode')}
									</span>
									<FormSelect
										value={mailFilterModal.draft.match_mode}
										onChange={(e) =>
											updateMailFilterDraft((prev) => ({
												...prev,
												match_mode: e.target.value as MailFilterMatchMode,
											}))
										}
									>
										<option value="all">{t('settings.account_filters.match_mode_option.all')}</option>
										<option value="any">{t('settings.account_filters.match_mode_option.any')}</option>
										<option value="all_messages">
											{t('settings.account_filters.match_mode_option.all_messages')}
										</option>
									</FormSelect>
								</label>
								<label className="ui-border-default inline-flex h-12 items-center gap-2 rounded-lg border px-3 text-sm ui-text-secondary">
									<FormCheckbox
										checked={mailFilterModal.draft.stop_processing}
										onChange={(e) =>
											updateMailFilterDraft((prev) => ({
												...prev,
												stop_processing: e.target.checked,
											}))
										}
									/>
									{t('settings.account_filters.stop_processing')}
								</label>
							</div>
						</section>

						{mailFilterModal.draft.match_mode !== 'all_messages' && (
							<section className="panel rounded-xl p-4">
								<div className="mb-3 flex items-center justify-between gap-2">
									<p className="ui-text-primary text-sm font-semibold">
										{t('settings.account_filters.conditions_title')}
									</p>
									<Button
										type="button"
										variant="secondary"
										size="sm"
										className="rounded-md px-2"
										onClick={() =>
											updateMailFilterDraft((prev) => ({
												...prev,
												conditions: [
													...prev.conditions,
													{
														field: 'subject',
														operator: 'contains',
														value: '',
													},
												],
											}))
										}
									>
										{t('settings.account_filters.add_condition')}
									</Button>
								</div>
								<div className="space-y-2">
									{mailFilterModal.draft.conditions.map((condition, index) => (
										<div
											key={index}
											className="grid grid-cols-1 gap-2 xl:grid-cols-[minmax(0,180px)_minmax(0,220px)_minmax(0,1fr)_auto]"
										>
											<FormSelect
												value={condition.field}
												onChange={(e) =>
													updateMailFilterDraft((prev) => ({
														...prev,
														conditions: prev.conditions.map((row, rowIndex) =>
															rowIndex === index
																? {
																		...row,
																		field: e.target.value as MailFilterField,
																	}
																: row,
														),
													}))
												}
											>
												<option value="subject">{t('settings.account_filters.field.subject')}</option>
												<option value="from">{t('settings.account_filters.field.from')}</option>
												<option value="to">{t('settings.account_filters.field.to')}</option>
												<option value="body">{t('settings.account_filters.field.body')}</option>
											</FormSelect>
											<FormSelect
												value={condition.operator}
												onChange={(e) =>
													updateMailFilterDraft((prev) => ({
														...prev,
														conditions: prev.conditions.map((row, rowIndex) =>
															rowIndex === index
																? {
																		...row,
																		operator: e.target.value as MailFilterOperator,
																	}
																: row,
														),
													}))
												}
											>
												<option value="contains">{t('settings.account_filters.operator.contains')}</option>
												<option value="not_contains">
													{t('settings.account_filters.operator.not_contains')}
												</option>
												<option value="equals">{t('settings.account_filters.operator.equals')}</option>
												<option value="starts_with">
													{t('settings.account_filters.operator.starts_with')}
												</option>
												<option value="ends_with">{t('settings.account_filters.operator.ends_with')}</option>
											</FormSelect>
											<FormInput
												type="text"
												value={condition.value || ''}
												onChange={(e) =>
													updateMailFilterDraft((prev) => ({
														...prev,
														conditions: prev.conditions.map((row, rowIndex) =>
															rowIndex === index
																? {
																		...row,
																		value: e.target.value,
																	}
																: row,
														),
													}))
												}
												placeholder={t('settings.account_filters.value')}
											/>
											<Button
												type="button"
												variant="danger"
												size="sm"
												className="rounded-md px-2"
												onClick={() =>
													updateMailFilterDraft((prev) => ({
														...prev,
														conditions: prev.conditions.filter(
															(_, rowIndex) => rowIndex !== index,
														),
													}))
												}
											>
												{t('settings.account_filters.remove')}
											</Button>
										</div>
									))}
								</div>
							</section>
						)}

						<section className="panel rounded-xl p-4">
							<div className="mb-3 flex items-center justify-between gap-2">
								<p className="ui-text-primary text-sm font-semibold">
									{t('settings.account_filters.actions_title')}
								</p>
								<Button
									type="button"
									variant="secondary"
									size="sm"
									className="rounded-md px-2"
									onClick={() =>
										updateMailFilterDraft((prev) => ({
											...prev,
											actions: [...prev.actions, {type: 'move_to_folder', value: ''}],
										}))
									}
								>
									{t('settings.account_filters.add_action')}
								</Button>
							</div>
							<div className="space-y-2">
								{mailFilterModal.draft.actions.map((action, index) => (
									<div
										key={index}
										className="grid grid-cols-1 gap-2 lg:grid-cols-[minmax(0,220px)_minmax(0,1fr)_auto]"
									>
										<FormSelect
											value={action.type}
											onChange={(e) =>
												updateMailFilterDraft((prev) => ({
													...prev,
													actions: prev.actions.map((row, rowIndex) =>
														rowIndex === index
															? {
																	...row,
																	type: e.target.value as MailFilterActionType,
																}
															: row,
													),
												}))
											}
										>
											<option value="move_to_folder">
												{t('settings.account_filters.action.move_to_folder')}
											</option>
											<option value="mark_read">{t('settings.account_filters.action.mark_read')}</option>
											<option value="mark_unread">
												{t('settings.account_filters.action.mark_unread')}
											</option>
											<option value="star">{t('settings.account_filters.action.star')}</option>
											<option value="unstar">{t('settings.account_filters.action.unstar')}</option>
										</FormSelect>
										{action.type === 'move_to_folder' ? (
											<FormSelect
												value={action.value || ''}
												options={folderOptions}
												onChange={(e) =>
													updateMailFilterDraft((prev) => ({
														...prev,
														actions: prev.actions.map((row, rowIndex) =>
															rowIndex === index
																? {
																		...row,
																		value: e.target.value,
																	}
																: row,
														),
													}))
												}
												renderSelectedOption={(option) =>
													option ? (
														<span className="flex min-w-0 items-center gap-2">
															{option.icon ? (
																<span className="shrink-0">{option.icon}</span>
															) : null}
															<span className="truncate">{option.label}</span>
														</span>
													) : (
														<span className="truncate">{t('settings.account_filters.choose_folder')}</span>
													)
												}
												renderOption={(option) => {
													if (option.value === '__folder-divider__') {
														return (
															<div className="ui-text-muted flex items-center gap-2 px-1 text-[11px] uppercase tracking-wide">
																<span className="ui-border-default h-px flex-1 border-t" />
																<span>{option.label}</span>
																<span className="ui-border-default h-px flex-1 border-t" />
															</div>
														);
													}
													return (
														<div className="flex min-w-0 items-center gap-2">
															{option.icon ? (
																<span className="shrink-0">{option.icon}</span>
															) : null}
															<span className="min-w-0 flex-1 truncate">
																{option.label}
															</span>
														</div>
													);
												}}
											/>
										) : (
											<FormInput
												type="text"
												disabled
												value=""
												variant="subtle"
												size="lg"
												className="ui-text-muted"
											/>
										)}
										<Button
											type="button"
											variant="danger"
											size="sm"
											className="rounded-md px-2"
											onClick={() =>
												updateMailFilterDraft((prev) => ({
													...prev,
													actions: prev.actions.filter((_, rowIndex) => rowIndex !== index),
												}))
											}
										>
											{t('settings.account_filters.remove')}
										</Button>
									</div>
								))}
							</div>
						</section>
					</div>
					<footer className="ui-border-default flex items-center justify-end gap-2 border-t px-5 py-4">
						<Button
							type="button"
							variant="secondary"
							size="default"
							className="rounded-md px-4"
							onClick={() => setMailFilterModal(null)}
							disabled={mailFilterBusy}
						>
							{t('settings.account_filters.cancel')}
						</Button>
						<Button
							type="button"
							variant="default"
							size="default"
							onClick={() => void onSaveMailFilterModal()}
							disabled={mailFilterBusy}
							className="rounded-md px-4 font-medium disabled:opacity-50"
						>
							{mailFilterBusy
								? t('settings.account_filters.saving')
								: mailFilterModal.mode === 'create'
									? t('settings.account_filters.create_rule')
									: t('settings.account_filters.save_rule')}
						</Button>
					</footer>
				</Modal>
			)}
		</>
	);
}
