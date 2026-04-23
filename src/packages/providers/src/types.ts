export type ContactSyncRow = {
	sourceUid: string;
	fullName: string | null;
	email: string;
	phone?: string | null;
	organization?: string | null;
	title?: string | null;
	note?: string | null;
};

export type CalendarSyncRow = {
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

export type OAuthContactPayload = {
	fullName?: string | null;
	email: string;
	emails?: string[];
	phone?: string | null;
	phones?: string[];
	organization?: string | null;
	title?: string | null;
	note?: string | null;
};

export type CalendarRange = {
	startIso: string;
	endIso: string;
};

export type CloudAccount = {
	id: number;
	provider: string;
	name: string;
	base_url: string | null;
	user: string | null;
	secret: string;
};

export type CloudItem = {
	id: string;
	name: string;
	path: string;
	isFolder: boolean;
	size: number | null;
	createdAt: string | null;
	modifiedAt: string | null;
	mimeType: string | null;
};

export type CloudUploadedItem = {
	id: string;
	path: string;
	name: string;
};

export type DownloadedCloudItem = {
	name: string;
	mimeType: string | null;
	content: Buffer;
};

export type CloudStorageUsage = {
	usedBytes: number | null;
	totalBytes: number | null;
};

export type CloudItemStatus = {
	exists: boolean;
	item: CloudItem | null;
	checkedAt: string;
};

export type CloudShareLinkResult = {
	url: string;
};
