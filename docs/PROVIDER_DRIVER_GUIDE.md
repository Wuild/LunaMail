# Provider Driver Guide

This codebase uses a provider-driver architecture for account sync and capabilities.

## Where To Start

- Driver contracts: `src/main/mail/providers/contracts.ts`
- Manager and registry: `src/main/mail/providers/providerManager.ts`
- Driver discovery: `src/main/mail/providers/driverDiscovery.ts`
- Driver implementations: `src/main/mail/providers/drivers/*.driver.ts`
- Shared catalog types: `src/shared/ipcTypes.ts`

## Driver Contract Requirements

Each driver must satisfy `MailProviderDriver`:

- Metadata:
  - `key()`
  - `label()`
  - `supports('emails' | 'contacts' | 'calendar' | 'files')`
- Sync metadata:
  - `canRunInitialSync()`
  - `canRunIncrementalSync()`
  - `supportsRealtimeEvents()`
  - `supportsPushNotifications()`
- Account/module resolution:
  - `resolveSyncModules(account)`
  - `resolveSyncCredentials(accountId)`

Driver registration must satisfy `ProviderDriverRegistration`:

- `key`, `label`, `logo`
- capability flags (`emails`, `contacts`, `calendar`, `files`)
- sync metadata flags
- auth metadata (`recommendedAuthMethod`, `supportedAuthMethods`)
- factories:
  - `createDriver()`
  - `createEmailSyncService(driver)`
  - `createAncillarySyncService(driver)`

## Adding A New Provider Driver

1. Add a new file in `src/main/mail/providers/drivers/` named `<provider>.driver.ts`.
2. Export a `ProviderDriverRegistration` constant (see existing Google/Microsoft/custom drivers).
3. Implement a `MailProviderDriver` class with accurate capability and sync metadata.
4. Implement email and ancillary sync service factories for that provider.
5. Ensure the provider key is enabled in `src/shared/mailProviderConfig.ts`.
6. Build and validate:
   - `npm run check:architecture`
   - `npm run build`

No hardcoded manager wiring is required; discovery loads driver registrations automatically.

## Normalized Provider Metadata

Renderer provider selection consumes catalog metadata from IPC (`ProviderDriverCatalogItem`):

- identity: `key`, `label`, `logo`, `enabled`
- capabilities: module flags
- sync metadata
- auth metadata

Keep this metadata accurate, because it drives UI availability and sync behavior.

