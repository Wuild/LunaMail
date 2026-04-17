export const MAIL_PROVIDER_FLAGS = {
	custom: true,
	google: true,
	microsoft: true,
} as const;

export type MailProviderChoice = keyof typeof MAIL_PROVIDER_FLAGS | (string & {});

export function isMailProviderEnabled(provider: MailProviderChoice): boolean {
	const normalized = String(provider || '').trim().toLowerCase();
	if (!normalized) return false;
	if (Object.prototype.hasOwnProperty.call(MAIL_PROVIDER_FLAGS, normalized)) {
		return MAIL_PROVIDER_FLAGS[normalized as keyof typeof MAIL_PROVIDER_FLAGS] === true;
	}
	return true;
}
