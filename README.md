![LlamaMail Banner](./screenshots/banner.png)

# LlamaMail

LlamaMail is a modern, offline-first desktop mail client built with Electron, React, TypeScript, Tailwind CSS, and SQLite (better-sqlite3 + Drizzle ORM).

## Screenshots

![LlamaMail Mail View](./screenshots/email-dark.png)![LlamaMail Compose View](./screenshots/compose-dark.png)

## Highlights

- Multi-account IMAP/SMTP support
- Fast local caching and offline-first message browsing
- Threaded message view and rich message reader
- Compose, reply, reply-all, forward, and attachments
- Optimistic actions: read/unread, flag, move, archive, delete
- Local search across folders and messages
- Contacts and calendar (DAV) integration
- Cloud provider integrations
- Developer diagnostics and debug console

## Tech Stack

- Electron
- React + TypeScript
- Tailwind CSS
- Vite
- Zustand
- TanStack Query
- SQLite (`better-sqlite3`)
- Drizzle ORM + drizzle-kit

## Requirements

- Node.js 20+
- npm 10+

## Getting Started

Install dependencies:

```bash
npm install
```

Run the app in development mode:

```bash
npm run dev
```

## Build

Build main, preload, and renderer:

```bash
npm run build
```

## Support

If you want to support ongoing development, you can back the project on Patreon:

- https://patreon.com/wuild

## Environment Overrides

You can create a local `.env` file in the project root to override runtime settings.

Example:

```bash
cp .env.example .env
```

OAuth/Auth server defaults to `https://llama.voracious.se` and can be overridden with:

```bash
LLAMA_AUTH_SERVER_BASE_URL=https://your-auth-host.example
```

## Environment Variables

LlamaMail reads `LLAMA_*` variables by default. Legacy `LUNAMAIL_*` names are still accepted as fallback.

| Variable                             | Default                      | Description                                                                                                  | Legacy fallback                         |
| ------------------------------------ | ---------------------------- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------- |
| `LLAMA_AUTH_SERVER_BASE_URL`         | `https://llama.voracious.se` | Base URL for OAuth/Auth server (`/api/auth/start`, `/exchange`, `/refresh`, etc.).                           | `LUNAMAIL_AUTH_SERVER_BASE_URL`         |
| `LLAMA_AUTH_SERVER_TIMEOUT_MS`       | `8000`                       | Timeout in ms for auth server HTTP requests.                                                                 | `LUNAMAIL_AUTH_SERVER_TIMEOUT_MS`       |
| `LLAMA_AUTH_SERVER_MAX_RETRIES`      | `1`                          | Retry count for auth server HTTP requests.                                                                   | `LUNAMAIL_AUTH_SERVER_MAX_RETRIES`      |
| `LLAMA_ENV_FILE`                     | unset                        | Absolute path to a `.env` file to load explicitly at runtime.                                                | `LUNAMAIL_ENV_FILE`                     |
| `LLAMA_DB_PATH`                      | unset                        | Override SQLite DB path (otherwise uses Electron `userData/llamamail.db`).                                   | `LUNAMAIL_DB_PATH`                      |
| `LLAMA_ALLOW_MULTI_INSTANCE`         | `0`                          | Set to `1` to bypass single-instance lock (debug/dev only).                                                  | `LUNAMAIL_ALLOW_MULTI_INSTANCE`         |
| `LLAMA_ALLOW_STANDALONE_CLOUD_OAUTH` | `0`                          | Set to `1` to enable standalone cloud OAuth flow (`link-cloud-oauth`). Default enforces account-token reuse. | `LUNAMAIL_ALLOW_STANDALONE_CLOUD_OAUTH` |

## Package

Linux:

```bash
npm run build:linux
```

Windows:

```bash
npm run build:win
```

macOS:

```bash
npm run build:mac
```

Additional packaging notes are in [docs/PACKAGING.md](./docs/PACKAGING.md).

## Quality Checks

```bash
npm run test:unit
npm run build
```

## Project Layout

```text
src/
  main/
  preload/
  renderer/
    entrypoints/
    components/
    features/
    hooks/
    layouts/
    lib/
    pages/
```

For architecture and agent conventions, see [AGENTS.md](./AGENTS.md).

## License

ISC. See [LICENSE](./LICENSE).
