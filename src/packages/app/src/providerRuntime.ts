export type ProviderContactSyncRow = {
	sourceUid: string;
	fullName: string | null;
	email: string;
	phone?: string | null;
	organization?: string | null;
	title?: string | null;
	note?: string | null;
};

export type ProviderCalendarSyncRow = {
	calendarUrl: string;
	uid: string;
	summary?: string | null;
	description?: string | null;
	location?: string | null;
	startsAt?: string | null;
	endsAt?: string | null;
	etag?: string | null;
	rawIcs?: string | null;
};

export type ProviderCalendarRange = {
	startIso: string;
	endIso: string;
};

export type ProviderContactMutationPayload = {
	fullName?: string | null;
	email: string;
	emails?: string[];
	phone?: string | null;
	phones?: string[];
	organization?: string | null;
	title?: string | null;
	note?: string | null;
};

export interface ProviderContactsRuntime {
	sync(accessToken: string): Promise<{
		rows: ProviderContactSyncRow[];
		meta?: Record<string, number | string | boolean | null>;
	}>;
	create(accessToken: string, payload: ProviderContactMutationPayload): Promise<{sourceUid: string}>;
	update(accessToken: string, sourceUid: string, payload: ProviderContactMutationPayload): Promise<void>;
	delete(accessToken: string, sourceUid: string): Promise<void>;
}

export interface ProviderCalendarRuntime {
	sync(
		accessToken: string,
		calendarRange: ProviderCalendarRange | null,
	): Promise<{
		rows: ProviderCalendarSyncRow[];
		legacySeriesUidsByCalendar: Record<string, string[]>;
	}>;
}

export interface ProviderCloudRuntime {
	sync(): Promise<{synced: boolean}>;
	runAction(action: string, payload?: unknown): Promise<{ok: boolean}>;
}
