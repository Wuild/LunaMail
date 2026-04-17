# Full TODO List — Provider / Driver System + AuthServer Client Refinement

This checklist assumes:

- The **AuthServer already exists**
- The app **already uses the AuthServer**
- The remaining work is to refine how the **client uses it**
- **IMAP is the custom/direct driver**
- **Google / Microsoft / other OAuth providers use the AuthServer**
- OAuth **renewals should go through the AuthServer by default**
- The system should feel like **Laravel/Eloquent/Filesystem/Mail driver architecture**

oauth server can be found at /home/wuild/PhpstormProjects/llamamail-auth

---

## 1. Core Architecture

- [x] Build the integration layer as a **Laravel-style driver system**
- [x] Keep the application core dependent on **contracts/interfaces**, not provider-specific classes
- [x] Resolve providers through a central **Provider Manager**
- [x] Make drivers **swappable/configurable** per account
- [x] Allow each account to declare which provider driver it uses
- [x] Keep provider auth logic separate from sync logic where possible
- [x] Add provider capability detection so the UI and backend know what each driver supports
- [ ] Ensure the architecture feels similar to Laravel `mail`, `cache`, `filesystem`, and database drivers

---

## 2. Provider / Driver System

### 2.1 Driver Base Requirements

- [ ] Define a shared base provider contract
- [ ] Define capability contracts for:
    - [x] Emails
    - [x] Contacts
    - [x] Calendars
    - [x] Cloud Files
- [ ] Ensure providers only implement capabilities they actually support
- [x] Normalize provider responses into common DTOs / resource objects
- [x] Normalize provider errors into one common exception / error format
- [ ] Add provider metadata methods like:
    - [x] `key()`
    - [x] `label()`
    - [x] provider logo metadata in catalog (`logo`)
    - [x] `supports('emails')`
    - [x] `supports('contacts')`
    - [x] `supports('calendar')`
    - [x] `supports('files')`
- [ ] Add sync metadata methods like:
    - [x] `canRunInitialSync()`
    - [x] `canRunIncrementalSync()`
    - [x] `supportsRealtimeEvents()`
    - [x] `supportsPushNotifications()`

### 2.2 Driver Implementations

- [x] Create **IMAP driver** as the custom/direct account driver
- [x] Create **Google driver** that uses the AuthServer for OAuth credentials
- [x] Create **Microsoft driver** that uses the AuthServer for OAuth credentials
- [x] Create a path for adding future OAuth-based providers without rewriting the core
- [x] Ensure every provider is registered through a central manager / registry
- [x] Ensure driver discovery/registration is consistent

### 2.3 Provider Manager

- [x] Create a `ProviderManager` similar to a Laravel manager
- [x] Resolve the correct driver by account/provider type
- [x] Cache resolved drivers when safe
- [x] Allow the manager to expose provider capabilities to the rest of the app
- [x] Allow the manager to return provider-specific sync services
- [x] Allow the manager to fail gracefully when a provider is misconfigured or unsupported

---

## 3. Account Model / Provider Mapping

- [ ] Store the selected provider key on each connected account
- [ ] Store provider-specific account metadata separately from generic account metadata
- [ ] Track whether the account is:
    - [ ] connected
    - [ ] syncing
    - [ ] expired
    - [ ] reconnect-required
    - [ ] disabled
- [ ] Track the last successful sync time per module:
    - [ ] emails
    - [ ] contacts
    - [ ] calendars
    - [ ] files
- [ ] Track provider-level health / sync status
- [ ] Store provider capability flags on account creation or fetch dynamically from the driver
- [ ] Allow one user to connect multiple accounts from the same provider

---

## 4. AuthServer Client Integration

- [ ] Standardize all AuthServer responses
- [x] Use one shared `AuthServerClient` service in the app
- [ ] Remove duplicated auth request logic from pages/components
- [x] Add typed DTOs / schemas for AuthServer responses
- [x] Add timeout handling for AuthServer calls
- [x] Add retry logic where safe
- [x] Add graceful error handling for auth failures
- [ ] Add versioning/compatibility handling for AuthServer responses
- [x] Ensure the client only talks to the AuthServer, not directly to Google/Microsoft OAuth endpoints
- [x] Keep provider secrets and client secrets out of the app client

---

## 5. OAuth Provider Flow

- [x] When connecting Google/Microsoft, request the login flow from the AuthServer
- [x] Handle callback/session completion cleanly in the client
- [x] Save the returned account identity and token metadata
- [x] Link the newly authenticated provider account to the correct internal account record
- [x] Trigger first sync after successful OAuth connection
- [ ] Show connection progress and first-sync progress in the UI
- [ ] Support reconnect flow when tokens are expired or revoked
- [ ] Support multiple OAuth accounts per provider

---

## 6. OAuth Renewal Strategy

- [x] Use the AuthServer for **token renewal by default**
- [x] Send renewal requests through the shared AuthServer client
- [ ] Refresh tokens before expiry
- [x] Retry failed renewals when safe
- [ ] Mark accounts as reconnect-required after repeated renewal failures
- [ ] Ensure renewed token metadata is saved back to the account
- [ ] Log renewal failures separately from sync failures
- [ ] Show clear UI states when an account has renewal/auth problems

### Optional investigation

- [ ] Investigate whether any provider can safely renew tokens directly from the client **without secrets/client IDs**
- [ ] Only allow direct client renewal if the provider officially supports secure public-client refresh flows
- [ ] Keep AuthServer-based renewal as the default/fallback even if direct renewal becomes possible

---

## 7. IMAP / Custom Driver Flow

- [ ] Treat IMAP as the custom/direct driver
- [ ] Support direct login using email + password
- [ ] Support manual server configuration when auto-detection fails
- [ ] Support IMAP + SMTP settings where needed
- [ ] Support SSL/TLS/STARTTLS
- [ ] Add a pre-auth/server-auth check to determine whether the server requires:
    - [ ] 2FA
    - [ ] app password
    - [ ] standard password only
- [ ] Only ask for app password / extra verification if the auth flow/server requires it
- [ ] Store IMAP account metadata separately from OAuth token metadata
- [ ] Allow IMAP accounts to run first sync immediately after successful connection

---

## 8. First-Time Account Setup

- [ ] User selects a provider
- [ ] Resolve the correct provider driver
- [ ] Run the correct auth flow:
    - [ ] direct login for IMAP
    - [ ] AuthServer OAuth flow for Google/Microsoft
- [ ] Create/save the account record
- [ ] Store provider metadata and capabilities
- [ ] Trigger first-time sync automatically
- [ ] Populate the frontend store with initial synced data
- [ ] Show success/failure state per sync module
- [ ] Handle partial first-sync success cleanly

---

## 9. Sync Engine

### 9.1 Shared Sync Behavior

- [ ] Create a unified sync pipeline for all providers
- [ ] Support:
    - [ ] first/full sync
    - [ ] incremental sync
    - [ ] manual sync
    - [ ] background sync jobs
    - [ ] per-module sync
- [ ] Allow sync to run per account
- [ ] Allow sync to run per capability/module
- [ ] Handle pagination consistently across providers
- [ ] Add retry handling for transient sync errors
- [ ] Add rate-limit handling
- [ ] Add backoff behavior for temporary failures
- [ ] Support partial success reporting instead of treating the whole sync as failed unnecessarily

### 9.2 Sync Job Structure

- [ ] Separate jobs/actions for:
    - [ ] initial account sync
    - [ ] email sync
    - [ ] contact sync
    - [ ] calendar sync
    - [ ] file sync
    - [ ] token renewal
- [ ] Track job duration
- [ ] Track job result per module
- [ ] Track last successful incremental checkpoint / cursor
- [ ] Support safe job retries without duplicating data

---

## 10. Email Sync

- [ ] Define a normalized email model for all providers
- [ ] Sync inbox/folders/labels consistently
- [ ] Sync message metadata
- [ ] Sync unread/starred/flagged state
- [ ] Sync thread relationships where supported
- [ ] Sync attachment metadata
- [ ] Lazy-load full message bodies when appropriate
- [ ] Support sending/replying/forwarding if included in scope
- [ ] Keep email data page-view driven in the frontend
- [ ] Do not fully mirror all emails into the global UI store by default
- [ ] Support new-mail incremental sync
- [ ] Support push/realtime updates when providers can emit them

---

## 11. Contacts Sync

- [ ] Define a normalized contact model
- [ ] Sync contacts from each supported provider
- [ ] Support initial contact import
- [ ] Support incremental updates
- [ ] Support deletes / archived contacts handling
- [ ] Normalize fields like:
    - [ ] name
    - [ ] multiple emails
    - [ ] phone numbers
    - [ ] avatars/photos
    - [ ] notes
    - [ ] company/title
- [ ] Support fast search in the app
- [ ] Handle duplicates/merging strategy

---

## 12. Calendar Sync

- [ ] Define normalized calendar and event models
- [ ] Sync calendars per account
- [ ] Sync events per calendar
- [ ] Support initial sync
- [ ] Support incremental sync
- [ ] Support recurring events
- [ ] Support timezone-safe storage and rendering
- [ ] Support attendees/RSVP where available
- [ ] Support reminders/notifications where available
- [ ] Normalize create/update/delete flows if write support is included

---

## 13. Cloud File System

- [ ] Build file integrations using the same Laravel-style driver philosophy
- [ ] Treat cloud file providers as capability-based drivers
- [ ] Define normalized file/folder models
- [ ] Support:
    - [ ] browse
    - [ ] search
    - [ ] upload
    - [ ] download
    - [ ] delete
    - [ ] rename
    - [ ] move
- [ ] Support shared files/folders when available
- [ ] Support thumbnails/previews where available
- [ ] Support incremental file sync / metadata refresh
- [ ] Keep provider-specific file quirks behind the driver layer

---

## 14. Frontend State Architecture

### 14.1 Global Store

- [ ] Create a global optimistic store for:
    - [ ] accounts
    - [ ] contacts
    - [ ] calendars
    - [ ] events
    - [ ] files
    - [ ] notifications
    - [ ] sync states
    - [ ] account/provider health states

### 14.2 Optimistic UI

- [ ] Keep the frontend optimistic (Electron Renderer via IPC-backed store) by default where safe
- [ ] Update the store immediately on user actions
- [ ] Reconcile with server/provider sync results afterward
- [ ] Roll back failed optimistic actions cleanly
- [ ] Make account and sync states visible in the UI

### 14.3 Emails Special Handling

- [ ] Keep emails out of the main always-hot global store where practical
- [ ] Load emails by page/view/thread instead
- [ ] Cache viewed threads/messages locally as needed
- [ ] Refresh inbox/thread views when realtime events arrive

---



## 14.4 Electron IPC Architecture

- [ ] Treat the desktop app as an **Electron application**
- [ ] Use IPC channels/events between Renderer and Main process
- [ ] Use IPC callbacks/promises for requests that return data
- [ ] Use push IPC events for realtime updates from Main → Renderer
- [ ] Keep provider/auth/sync logic in the Main process where possible
- [ ] Keep the Renderer focused on UI and state rendering
- [ ] Hydrate the global store from IPC responses
- [ ] Update the global store from IPC events
- [ ] Prevent duplicate state updates when sync + IPC events overlap
- [ ] Validate and type all IPC payloads

### Suggested IPC Flows

- [ ] `accounts:list` → returns connected accounts
- [ ] `accounts:connect` → starts provider auth flow
- [ ] `accounts:sync` → triggers sync
- [ ] `emails:list` → returns paginated emails
- [ ] `contacts:list` → returns contacts
- [ ] `calendar:list` → returns calendars/events
- [ ] `files:list` → returns files/folders
- [ ] `store:hydrate` → initial app state
- [ ] `event:new-email` → push update
- [ ] `event:sync-status` → sync progress updates
- [ ] `event:account-state` → auth/renewal/account status updates


## 15. Realtime / Event System

- [ ] Allow providers to emit events into the app
- [ ] Support WebSocket/SSE/event-stream updates
- [ ] Push UI updates when providers report changes before the next normal sync cycle
- [ ] Ensure the app can mark data as stale and request resync when needed

### Event examples

- [ ] `NewEmailReceived`
- [ ] `EmailUpdated`
- [ ] `ContactsChanged`
- [ ] `CalendarChanged`
- [ ] `FilesChanged`
- [ ] `AccountConnected`
- [ ] `TokenRenewed`
- [ ] `SyncStarted`
- [ ] `SyncCompleted`
- [ ] `SyncFailed`

---

## 16. Error Handling / Partial Success

- [ ] Create one normalized provider error format
- [ ] Distinguish between:
    - [ ] auth errors
    - [ ] renewal errors
    - [ ] timeout errors
    - [ ] rate-limit errors
    - [ ] provider API errors
    - [ ] partial sync errors
- [ ] Make partial success a first-class result
- [ ] Report sync status per module instead of only one global pass/fail
- [ ] Surface useful messages in the UI
- [ ] Log enough detail for debugging without leaking secrets

### Example desired result shape

- [ ] emails: success
- [ ] contacts: failed
- [ ] calendars: success
- [ ] files: skipped
- [ ] reason: timeout

---

## 17. Google Sync Error Investigation

- [ ] Investigate the case where Google reports a sync error but emails still sync successfully
- [ ] Check whether the failure happens after email sync in:
    - [ ] contacts sync
    - [ ] calendar sync
    - [ ] file sync
- [ ] Check queue/job timeout settings
- [ ] Check provider pagination/cursor handling
- [ ] Check renewal during sync
- [ ] Check partial-success handling so successful email sync is not reported as a total failure
- [ ] Add step-by-step logs for the Google driver
- [ ] Add duration metrics per sync stage

---

## 18. Security

- [ ] Encrypt tokens at rest
- [ ] Encrypt stored passwords/secrets at rest where applicable
- [ ] Keep OAuth secrets only on the AuthServer
- [ ] Never expose provider secrets/client IDs to the frontend
- [ ] Secure reconnect flows
- [ ] Add account revocation/disconnect support
- [ ] Add audit logs for account connection/disconnection/renewal
- [ ] Add rate limiting around auth and reconnect flows
- [ ] Review how sensitive provider metadata is stored and exposed

---

## 19. Observability / Monitoring

- [ ] Add structured sync logs
- [ ] Add per-provider health checks
- [ ] Add queue monitoring
- [ ] Add renewal monitoring
- [ ] Add provider/API error tracking
- [ ] Add metrics for:
    - [ ] sync duration
    - [ ] renewal success rate
    - [ ] provider failure rate
    - [ ] partial sync rate
- [ ] Add internal debug pages/tools for account sync state

---

## 20. Developer Experience
- [ ] Add a simple way to register new providers
- [x] Document driver contract requirements
- [ ] Document normalized DTO/resource formats
- [x] Document provider capability flags
- [ ] Document how first sync, incremental sync, and renewal should work

---

## 21. Suggested Laravel-Style Structure

- [ ] `app/Contracts/Providers/*`
- [ ] `app/Drivers/*`
- [ ] `app/Managers/ProviderManager.php`
- [ ] `app/Auth/AuthServerClient.php`
- [ ] `app/Actions/Accounts/*`
- [ ] `app/Actions/Sync/*`
- [ ] `app/Jobs/*`
- [ ] `app/Events/*`
- [ ] `app/Listeners/*`
- [ ] `app/DataTransferObjects/*`
- [ ] `app/Exceptions/Providers/*`

---

## 22. Final Architecture Rule

- [ ] Keep **IMAP as the custom/direct driver**
- [ ] Keep **Google/Microsoft and other OAuth providers behind the AuthServer**
- [ ] Keep **OAuth renewals going through the AuthServer by default**
- [ ] Keep **all providers behind a unified Laravel-style driver/capability system**
- [ ] Keep the **frontend optimistic (Electron Renderer via IPC-backed store)**, but handle emails as page-view-driven data
- [ ] Keep **partial sync success** visible and supported across the whole system
