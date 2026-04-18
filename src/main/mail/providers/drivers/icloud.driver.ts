import type {ProviderDriverRegistration} from '../contracts.js';
import {ImapProviderDriver} from '../imapProviderDriver.js';
import {ImapWorkerEmailSyncService} from '../syncServices.js';
import {DavAncillarySyncService} from '../ancillarySyncServices.js';

export const icloudProviderDriverRegistration: ProviderDriverRegistration = {
	key: 'icloud',
	label: 'iCloud',
	logo: 'mail',
	enabled: false,
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
	recommendedAuthMethod: 'app_password',
	supportedAuthMethods: ['app_password'],
	createDriver: () =>
		new ImapProviderDriver({
			key: 'icloud',
			label: 'iCloud (IMAP)',
			capabilities: ['emails', 'contacts', 'calendar'],
		}),
	createEmailSyncService: (driver) => new ImapWorkerEmailSyncService(driver),
	createAncillarySyncService: (driver) => new DavAncillarySyncService(driver),
};
