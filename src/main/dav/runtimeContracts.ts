import type {OAuthSession, OAuthProvider} from '@llamamail/app/ipcTypes';

export type ContactRow = {
	id: number;
	account_id: number;
	address_book_id: number | null;
	source: string;
	source_uid: string;
	full_name: string | null;
	email: string;
	phone: string | null;
	organization: string | null;
	title: string | null;
	note: string | null;
	etag: string | null;
	last_seen_sync: string;
	created_at: string;
	updated_at: string;
};

export type OAuthProviderContactContext = {
	provider: OAuthProvider;
	accessToken: string;
};

export type ContactMutationPayload = {
	fullName?: string | null;
	email?: string;
	phone?: string | null;
	organization?: string | null;
	title?: string | null;
	note?: string | null;
};

export type OauthContactsDependencies = {
	getAccountSyncCredentials: (accountId: number) => Promise<{
		auth_method: 'password' | 'app_password' | 'oauth2';
		oauth_provider: OAuthProvider | null;
		oauth_session: OAuthSession | null;
	}>;
	refreshMailOAuthSessionWithOptions: (
		session: OAuthSession,
		options: {additionalScopes?: string[]; replaceExistingScopes?: boolean},
	) => Promise<OAuthSession>;
	getMicrosoftGraphOAuthScopes: () => string[];
	listContacts: (accountId: number, query?: string | null, limit?: number) => ContactRow[];
	upsertContacts: (
		accountId: number,
		rows: Array<{
			sourceUid: string;
			fullName: string | null;
			email: string;
			phone?: string | null;
			organization?: string | null;
			title?: string | null;
			note?: string | null;
		}>,
		source?: string,
	) => {upserted: number; removed: number};
};

export type ModuleLogger = {
	debug: (...args: unknown[]) => void;
	info: (...args: unknown[]) => void;
	warn: (...args: unknown[]) => void;
	error: (...args: unknown[]) => void;
};

export type OauthSyncDependencies = {
	upsertContacts: (
		accountId: number,
		rows: Array<{
			sourceUid: string;
			fullName: string | null;
			email: string;
			phone?: string | null;
			organization?: string | null;
			title?: string | null;
			note?: string | null;
		}>,
		source?: string,
	) => {upserted: number; removed: number};
	upsertCalendarEvents: (
		accountId: number,
		rows: Array<{
			calendarUrl: string;
			uid: string;
			summary?: string | null;
			description?: string | null;
			location?: string | null;
			startsAt?: string | null;
			endsAt?: string | null;
			etag?: string | null;
			rawIcs?: string | null;
		}>,
		source?: string,
		options?: {removeMissing?: boolean},
	) => {upserted: number; removed: number};
	deleteCalendarEventsByUids: (accountId: number, source: string, calendarUrl: string, uids: string[]) => {removed: number};
};
