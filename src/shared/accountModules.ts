export type AccountModuleSelection = {
	sync_emails: number;
	sync_contacts: number;
	sync_calendar: number;
};
type AccountModuleSelectionLike = {
	sync_emails?: number | null;
	sync_contacts?: number | null;
	sync_calendar?: number | null;
};

export const DEFAULT_ACCOUNT_MODULE_SELECTION: AccountModuleSelection = {
	sync_emails: 1,
	sync_contacts: 1,
	sync_calendar: 1,
};

export function normalizeAccountModuleFlag(value: unknown, fallback: number): 0 | 1 {
	if (value === null || value === undefined) return fallback === 0 ? 0 : 1;
	if (typeof value === 'boolean') return value ? 1 : 0;
	const parsed = Number(value);
	if (!Number.isFinite(parsed)) return fallback === 0 ? 0 : 1;
	return parsed > 0 ? 1 : 0;
}

export function normalizeAccountModuleSelection(
	input?: AccountModuleSelectionLike | null,
	fallback: AccountModuleSelection = DEFAULT_ACCOUNT_MODULE_SELECTION,
): AccountModuleSelection {
	return {
		sync_emails: normalizeAccountModuleFlag(input?.sync_emails, fallback.sync_emails),
		sync_contacts: normalizeAccountModuleFlag(input?.sync_contacts, fallback.sync_contacts),
		sync_calendar: normalizeAccountModuleFlag(input?.sync_calendar, fallback.sync_calendar),
	};
}

export function hasAnyEnabledAccountModule(input: AccountModuleSelectionLike | null | undefined): boolean {
	return isAccountEmailModuleEnabled(input) || isAccountContactsModuleEnabled(input) || isAccountCalendarModuleEnabled(input);
}

export function isAccountEmailModuleEnabled(input: AccountModuleSelectionLike | null | undefined): boolean {
	return Number(input?.sync_emails ?? 1) > 0;
}

export function isAccountContactsModuleEnabled(input: AccountModuleSelectionLike | null | undefined): boolean {
	return Number(input?.sync_contacts ?? 1) > 0;
}

export function isAccountCalendarModuleEnabled(input: AccountModuleSelectionLike | null | undefined): boolean {
	return Number(input?.sync_calendar ?? 1) > 0;
}
