# LunaMail

LunaMail is a modern, offline-first desktop email client for Linux built with:

- Electron
- React + TypeScript
- Tailwind CSS
- SQLite (better-sqlite3 + Drizzle ORM)

## Features

- Multi-account IMAP/SMTP support
- Local-first mail cache with fast folder/message browsing
- Add-account wizard (autodiscovery + manual setup)
- Compose, reply, reply all, forward, attachments
- Message viewer window + full message source viewer
- Optimistic message actions (read/unread, move, archive, delete, flag)
- Multi-select message operations + keyboard navigation
- Mail layout modes:
  - side list view
  - top table view with configurable columns
- Advanced search filters (account, folder, read/starred, date, size, sender/subject/to)
- Remote content privacy controls:
  - block remote content by default
  - load once
  - allowlist sender/domain
- Help and Debug pages routed inside the main shell
- Live Debug Console with source filters (`imap`, `smtp`, `carddav`, `caldav`, `app`)
- Custom title bar and update status indicator

## Requirements

- Node.js 20+
- npm 10+
- Linux desktop environment

## Setup (From Source)

```bash
npm install
```

## Development

Run the full development stack (TypeScript watch, Vite, Electron):

```bash
npm run dev
```

## Build

Build main/preload/renderer:

```bash
npm run build
```

## Package (Linux)

Build all Linux targets (`AppImage`, `deb`, `rpm`, `flatpak`):

```bash
npm run build:linux
```

Per target:

```bash
npm run build:linux:appimage
npm run build:linux:deb
npm run build:linux:rpm
npm run build:linux:flatpak
```

See [docs/PACKAGING.md](docs/PACKAGING.md) for host dependencies and packaging notes.

## Install (Linux Packages)

After packaging, artifacts are generated under `dist/`.

Install a `.deb`:

```bash
sudo apt install ./dist/*.deb
```

Install an `.rpm`:

```bash
sudo dnf install ./dist/*.rpm
```

Run AppImage:

```bash
chmod +x ./dist/*.AppImage
./dist/*.AppImage
```

## Project Structure

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

## Renderer IPC and Routing

See [AGENTS.md](AGENTS.md) for:

- current `window.electronAPI` functions exposed by preload
- route structure and settings tab navigation (`/settings/:tab`)

## License

ISC. See [LICENSE](LICENSE).
