import type {
	AutoUpdateState,
	MailFilter,
	MailFilterActionType,
	MailFilterField,
	MailFilterMatchMode,
	MailFilterOperator,
} from '@/preload';

export type MailFilterConditionDraft = {
	field: MailFilterField;
	operator: MailFilterOperator;
	value: string;
};

export type MailFilterActionDraft = {
	type: MailFilterActionType;
	value: string;
};

export type MailFilterDraft = {
	id: number | null;
	name: string;
	enabled: boolean;
	run_on_incoming: boolean;
	match_mode: MailFilterMatchMode;
	stop_processing: boolean;
	conditions: MailFilterConditionDraft[];
	actions: MailFilterActionDraft[];
};

export type MailFilterModalState = {
	mode: 'create' | 'edit';
	draft: MailFilterDraft;
} | null;

export function describeUpdatePhase(state: AutoUpdateState): string {
	if (!state.enabled) return 'Auto-update disabled for this build.';
	if (state.phase === 'available') return `Update ${state.latestVersion ?? ''} is available.`;
	if (state.phase === 'not-available') return 'You are up to date.';
	if (state.phase === 'checking') return 'Checking for updates...';
	if (state.phase === 'downloading') return 'Downloading update...';
	if (state.phase === 'downloaded')
		return `Update ${state.downloadedVersion ?? state.latestVersion ?? ''} is ready to install.`;
	if (state.phase === 'error') return 'Update check failed.';
	return 'Ready to check for updates.';
}

export function createDefaultMailFilterDraft(index: number): MailFilterDraft {
	return {
		id: null,
		name: `New filter ${index}`,
		enabled: true,
		run_on_incoming: true,
		match_mode: 'all',
		stop_processing: true,
		conditions: [{field: 'subject', operator: 'contains', value: ''}],
		actions: [{type: 'move_to_folder', value: ''}],
	};
}

export function mapMailFilterToDraft(filter: MailFilter): MailFilterDraft {
	return {
		id: filter.id,
		name: filter.name,
		enabled: !!filter.enabled,
		run_on_incoming: !!filter.run_on_incoming,
		match_mode: filter.match_mode,
		stop_processing: !!filter.stop_processing,
		conditions: filter.conditions.map((condition) => ({
			field: condition.field,
			operator: condition.operator,
			value: condition.value || '',
		})),
		actions: filter.actions.map((action) => ({
			type: action.type,
			value: action.value || '',
		})),
	};
}
