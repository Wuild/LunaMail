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
- Required shared primitives currently in use:
    - Theme synchronization: `src/renderer/hooks/useAppTheme.ts`
    - Reusable grouped server settings card: `src/renderer/components/settings/ServiceSettingsCard.tsx`
    - Reusable data-driven sidebar: `src/renderer/components/navigation/DynamicSidebar.tsx`

---

## 📡 IPC Contract Rules

All communication MUST go through preload APIs.

Examples:

- getAccounts()
- addAccount()
- fetchMessages(folderId)
- getMessage(messageId)
- sendEmail(payload)

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
- NEVER store plain passwords
- ALWAYS sanitize HTML
- KEEP logic out of React (UI only)
- USE SQLite for offline-first behavior
- USE Drizzle ORM for database queries; avoid raw SQL in app code except inside migrations
- MAKE all user-visible app actions truly optimistic: apply local/UI state changes immediately and run remote sync in
  the background in good faith (reconcile on failure, but do not block primary UX on network/server roundtrips)
- FORMAT code by default using PhpStorm-style formatting conventions (consistent spacing, wrapping, and brace style as
  the project/codebase expects)
- WRITE modular, testable code
- FAVOR route consolidation over adding more windows for settings/help/debug style pages
- WHEN refactoring renderer code, remove dead files/imports and fold duplicated page logic into reusable modules
- RUN `npm run build` after structural refactors and before handoff

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
