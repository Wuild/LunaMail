export const MAIL_PROVIDER_FLAGS = {
	custom: true,
	google: false,
	microsoft: false,
} as const;

export type MailProviderChoice = keyof typeof MAIL_PROVIDER_FLAGS;

export function isMailProviderEnabled(provider: MailProviderChoice): boolean {
	return MAIL_PROVIDER_FLAGS[provider] === true;
}
