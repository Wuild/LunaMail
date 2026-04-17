import type {ProviderDriverRegistration} from '../contracts.js';
import {ImapProviderDriver} from '../imapProviderDriver.js';
import {ImapWorkerEmailSyncService} from '../syncServices.js';
import {DavAncillarySyncService} from '../ancillarySyncServices.js';

export const customProviderDriverRegistration: ProviderDriverRegistration = {
	key: 'custom',
	label: 'IMAP',
	logo: 'mail',
	enabled: true,
	capabilities: {
		emails: true,
		contacts: true,
		calendar: true,
		files: false,
	},
	sync: {
		canRunInitialSync: true,
		canRunIncrementalSync: true,
		supportsRealtimeEvents: true,
		supportsPushNotifications: true,
	},
	recommendedAuthMethod: 'password',
	supportedAuthMethods: ['password', 'app_password'],
	createDriver: () =>
		new ImapProviderDriver({
			key: 'custom',
			label: 'IMAP',
			capabilities: ['emails', 'contacts', 'calendar'],
		}),
	createEmailSyncService: (driver) => new ImapWorkerEmailSyncService(driver),
	createAncillarySyncService: (driver) => new DavAncillarySyncService(driver),
};
