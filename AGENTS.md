# AGENTS.md

## Project: Electron Mail Client (Outlook-like)

This document defines how AI agents and developers should build and maintain the mail client.

---

## 🧠 Project Vision

Build a modern, fast, offline-capable desktop email client for Linux using:

- Electron (desktop shell)
- React + TypeScript (UI)
- Tailwind CSS (styling)

The app should feel similar to modern Outlook:

- clean UI
- threaded conversations
- multi-account support
- fast local caching

---

## 🏗️ Architecture Overview

### 1. Main Process (Electron Backend)

Responsible for:

- IMAP syncing
- SMTP sending
- local database (SQLite)
- file system access
- notifications

### 2. Renderer (React Frontend)

Responsible for:

- UI rendering
- state management
- user interactions

### 3. Preload (Bridge Layer)

- exposes safe APIs via contextBridge
- prevents direct Node access in UI

---

## 🔐 Security Rules (MANDATORY)

- contextIsolation = true
- nodeIntegration = false
- sanitize all email HTML
- block remote scripts in emails
- store credentials securely (keytar recommended)
- never expose filesystem or IMAP directly to renderer

---

## 🧱 Tech Stack

- Electron
- React + TypeScript
- Tailwind CSS
- Vite
- Zustand (state)
- TanStack Query (server/cache)
- better-sqlite3 (database)
- Drizzle ORM + drizzle-kit (ORM + migrations)
- ImapFlow (IMAP)
- Nodemailer (SMTP)
- MailParser (email parsing)

---

## 📂 Folder Structure

```
src/
  main/
    mail/
    db/
    ipc/
    notifications/
  preload/
  renderer/
    components/
    entrypoints/
    features/
    hooks/
    layouts/
    pages/
    lib/
```

---

## 🧭 Renderer Structure Rules

- Keep a single `MainWindowApp` route shell for core app pages (`/mail`, `/settings`, `/debug`, `/help`, etc.).
- Only use dedicated windows for flows that must be separate top-level windows (for example compose and message view).
- If a view is reachable as a route in the main app shell, do not create a separate Electron window for it.
- Window bootstraps must live under `src/renderer/entrypoints/` and mount through shared helpers.
- Prefer shared hooks/components over page-local copies when logic/UI appears in more than one page.
- Use `WorkspaceLayout` as the default page shell for new/refactored main-window routes.
- If a request references `WorkPageLayout`, treat it as `WorkspaceLayout` in this codebase.
- Keep existing sidebar/status/titlebar patterns unless a change request explicitly asks for a new shell.
- Required shared primitives currently in use:
    - Theme synchronization: `src/renderer/hooks/useAppTheme.ts`
    - Reusable grouped server settings card: `src/renderer/components/settings/ServiceSettingsCard.tsx`
    - Reusable data-driven sidebar: `src/renderer/components/navigation/DynamicSidebar.tsx`
    - Renderer bridge client: `src/renderer/lib/ipcClient.ts` (avoid direct `window.electronAPI` usage outside this module)

---

## 📡 IPC Contract Rules

All communication MUST go through preload APIs.

Examples:

- getAccounts()
- addAccount()
- fetchMessages(folderId)
- getMessage(messageId)
- sendEmail(payload)

### Renderer Routing and `window.electronAPI`

Renderer uses React Router (`HashRouter`) and preload is the only bridge to main process functionality.

Routing:

- Main shell routes:
    - `/email`
    - `/contacts`
    - `/calendar`
    - `/settings/:tab`
    - `/debug`
    - `/help`
- Settings tabs:
    - `/settings` redirects to `/settings/application` (`replace`)
    - `/settings/application`
    - `/settings/developer`
    - `/settings/account?accountId=<id>`
- Invalid settings tabs must redirect to `/settings/application`.

Update UX (main window):

- Automatically check for updates after main window creation:
    - once after ~15 seconds
    - then every 6 hours
- Show a titlebar update indicator when phase is:
    - `available`
    - `downloading`
    - `downloaded`
- Clicking indicator navigates to `/settings/application`.

`window.electronAPI` surface (source: `src/preload/index.ts`):

- Account/settings:
    - `getAccounts()`
    - `addAccount(payload)`
    - `updateAccount(accountId, payload)`
    - `deleteAccount(accountId)`
    - `getAppSettings()`
    - `updateAppSettings(patch)`
    - `getSystemLocale()`
- Mail/folders:
    - `getUnreadCount()`
    - `syncAccount(accountId)`
    - `getFolders(accountId)`
    - `createFolder(accountId, folderPath)`
    - `deleteFolder(accountId, folderPath)`
    - `updateFolderSettings(accountId, folderPath, payload)`
    - `reorderCustomFolders(accountId, orderedFolderPaths)`
    - `getFolderMessages(accountId, folderPath, limit?)`
  - `getMailFilters(accountId)`
  - `saveMailFilter(accountId, payload)`
  - `deleteMailFilter(accountId, filterId)`
  - `runMailFilters(accountId, payload?)`
      - `searchMessages(accountId, query, folderPath?, limit?)`
      - `getMessage(messageId)`
      - `getMessageBody(messageId, requestId?)`
      - `cancelMessageBody(requestId)`
      - `setMessageRead(messageId, isRead)`
  - `markMessageRead(messageId)`
  - `markMessageUnread(messageId)`
      - `setMessageFlagged(messageId, isFlagged)`
      - `moveMessage(messageId, targetFolderPath)`
  - `archiveMessage(messageId)`
      - `deleteMessage(messageId)`
      - `openMessageAttachment(messageId, attachmentIndex, action?)`
- Compose/windows:
    - `sendEmail(payload)`
    - `saveDraft(payload)`
    - `openAddAccountWindow()`
    - `openComposeWindow(draft?)`
    - `openMessageWindow(messageId?)`
    - `getComposeDraft()`
    - `getMessageWindowTarget()`
- Contacts/calendar (DAV):
    - `discoverDav(accountId)`
    - `syncDav(accountId)`
    - `getContacts(accountId, query?, limit?, addressBookId?)`
    - `getRecentRecipients(accountId, query?, limit?)`
    - `getAddressBooks(accountId)`
    - `addAddressBook(accountId, name)`
    - `deleteAddressBook(accountId, addressBookId)`
    - `addContact(accountId, payload)`
    - `updateContact(contactId, payload)`
    - `deleteContact(contactId)`
    - `exportContacts(accountId, payload)`
    - `getCalendarEvents(accountId, startIso?, endIso?, limit?)`
    - `addCalendarEvent(accountId, payload)`
- Update:
    - `getAutoUpdateState()`
    - `checkForUpdates()`
    - `downloadUpdate()`
    - `quitAndInstallUpdate()`
- Window/diagnostics:
    - `minimizeWindow()`
    - `toggleMaximizeWindow()`
    - `closeWindow()`
    - `isWindowMaximized()`
    - `openDevTools()`
    - `getDebugLogs(limit?)`
    - `clearDebugLogs()`
    - `pickComposeAttachments()`
- Developer test actions:
    - `devShowNotification(payload?)`
    - `devPlayNotificationSound()`
    - `devOpenUpdaterWindow()`
- Event subscriptions:
    - `onAccountAdded(cb)`
    - `onAccountUpdated(cb)`
    - `onAccountDeleted(cb)`
    - `onUnreadCountUpdated(cb)`
  - `onMessageReadUpdated(cb)`
      - `onAccountSyncStatus(cb)`
      - `onComposeDraft(cb)`
      - `onAppSettingsUpdated(cb)`
      - `onOpenMessageTarget(cb)`
      - `onMessageWindowTarget(cb)`
      - `onDebugLog(cb)`
      - `onAutoUpdateStatus(cb)`

---

## 📦 Core Features (MVP)

### Accounts

- add IMAP/SMTP account
- store securely

### Mail Sync

- fetch folders
- fetch message headers
- fetch full message on demand

### Inbox

- list messages
- mark read/unread
- star/unstar

### Reading

- HTML + text support
- attachments

### Compose

- send email
- reply / forward
- attachments

### Search

- local search (subject, sender)

### Notifications

- new mail alerts

---

## 🧵 Threading Rules

Use:

1. Message-ID
2. In-Reply-To
3. References
   Fallback:

- normalized subject

Store a computed thread_key.

---

## 🗄️ Database Design

Tables:

- accounts
- folders
- messages
- message_bodies
- attachments
- threads
- sync_state

ORM & Migrations:

- Use Drizzle ORM (SQLite/better-sqlite3 driver) for all DB access and schema typings.
- Manage schema in `src/main/db/schema.ts` and instantiate the client in `src/main/db/drizzle.ts`.
- Use drizzle-kit for SQL migrations (`drizzle.config.ts`, `drizzle/` folder). Generate and run migrations during
  dev/build.

---

## 🚀 Development Phases

### Phase 1

- App shell
- Layout (sidebar, inbox, viewer)

### Phase 2

- Database
- Account setup
- IMAP connection

### Phase 3

- Fetch messages
- Render inbox
- Read emails

### Phase 4

- Compose + SMTP

### Phase 5

- Threads
- Search
- Notifications

### Phase 6

- Polish + packaging

---

## 🎨 UI Guidelines

- Outlook-style 3-column layout
- clean spacing
- rounded elements
- subtle hover states
- dark mode support

---

## 📦 Packaging

Use electron-builder:

- AppImage
- deb
- rpm

---

## ⚠️ Important Rules for Agents

- NEVER bypass preload layer
- NEVER call `window.electronAPI` directly from pages/components/hooks; use `src/renderer/lib/ipcClient.ts`
- NEVER store plain passwords
- ALWAYS sanitize HTML
- KEEP logic out of React (UI only)
- USE SQLite for offline-first behavior
- USE Drizzle ORM for repository queries by default
- Raw SQL is allowed only when justified (complex CTE/window queries or measured hot paths), and must include a short inline rationale comment
- MAKE all user-visible app actions truly optimistic: apply local/UI state changes immediately and run remote sync in
  the background in good faith (reconcile on failure, but do not block primary UX on network/server roundtrips)
- FORMAT code by default using PhpStorm-style formatting conventions (consistent spacing, wrapping, and brace style as
  the project/codebase expects)
- WRITE modular, testable code
- FAVOR route consolidation over adding more windows for settings/help/debug style pages
- WHEN refactoring renderer code, remove dead files/imports and fold duplicated page logic into reusable modules
- USE shared renderer UI primitives for all new/updated form controls and buttons:
    - Form controls: `src/renderer/components/ui/FormControls.tsx`
        - `FormInput`, `FormSelect`, `FormTextarea`, `FormCheckbox`, `FormControlGroup`
        - Prefer variants (`variant`, `size`) over inline one-off styling.
        - Use icon slots (`leftIcon`, `rightIcon`) where applicable.
        - Use grouped controls with `FormControlGroup` plus `groupPosition` (`first`/`middle`/`last`) for toolbar-style
          rows.
    - Buttons: `src/renderer/components/ui/button.tsx`
        - `Button`, `ButtonGroup`
        - Prefer button variants (`default`, `secondary`, `outline`, `ghost`, `danger`, `success`) and sizes.
        - Use icon slots (`leftIcon`, `rightIcon`) instead of manual icon spacing wrappers.
        - Use grouped buttons with `ButtonGroup` plus `groupPosition` (`first`/`middle`/`last`) for segmented/toolbar
          actions.
- Avoid introducing new ad-hoc `<input>`, `<select>`, `<textarea>`, `<input type="checkbox">`, or raw `<button>` styles in pages/components when these shared primitives can be used.
- RUN `npm run build` after structural refactors and before handoff

---

## ✅ Development Workflow (Required)

Use this as the default process for all future development work.

### 1) Plan and Scope

- Track work in `docs/OPTIMIZATION_ROADMAP.md` (or add a new roadmap/checklist doc for non-optimization epics).
- Work in small, behavior-preserving slices. Check off only what is actually complete.
- Prefer extracting pure logic into reusable modules/hooks before adding more page-level code.
- Keep `docs/OPTIMIZATION_ROADMAP.md` in sync with actual completed work.

### 2) Contract-First IPC Changes

- Define or reuse shared payload/result types in `src/shared/ipcTypes.ts`.
- Keep shared app defaults and select options in `src/shared/` (for example `defaults.ts`, `settingsOptions.ts`) and
  consume them from both main and renderer instead of duplicating literals.
- Keep `src/preload/index.ts` as the single renderer bridge surface.
- If adding or renaming an IPC channel:
    - update main `ipcMain.handle(...)` registration
    - update preload `ipcRenderer.invoke(...)` wrapper
    - update affected renderer callers/hooks
    - keep integration contract tests passing
- Add runtime validation for riskier IPC inputs (especially mutation payloads and file actions).

### 3) Renderer State Rules

- Use TanStack Query for async server/cache state and mutations.
- Keep optimistic UX for user-visible actions (read/unread, tag/flag, move/delete/archive, etc.).
- Use Zustand only for cross-route UI state that must persist beyond a single page scope.
- Prefer shared IPC hooks/clients over direct page-local subscription boilerplate.
- Remove redundant manual loading/error/event wiring where Query/shared hooks already cover it.

### 4) Data Layer Rules

- Drizzle-first for repository code.
- Raw SQL is allowed only where justified (complex CTE/window queries, performance-critical paths).
- Any intentionally retained raw SQL must include a short inline justification comment.

### 5) Required Validation Before Handoff

Run these locally for refactors/features:

- `npm run check:architecture`
- `npm run test:unit`
- `npm run build`

Also update:

- relevant checklist/roadmap checkboxes

### 6) Tests and Guardrails

- Unit tests live under `src/tests/` and should target extracted pure logic first.
- Integration contract tests should validate preload ↔ main IPC channel parity and critical event wiring.
- Keep `.github/pull_request_template.md` requirements satisfied.
- Keep `.github/workflows/quality.yml` green (architecture checks, unit tests, build).

---

## 💡 Future Features

- unified inbox
- snooze emails
- tagging
- rules/filters
- calendar integration
- contacts

---

## 🧭 Goal

Build a stable, fast, modern Linux mail client with a clean UX and strong offline capabilities.
