# LunaMail

LunaMail is a modern, offline-first desktop email client for Linux built with:

- Electron
- React + TypeScript
- Tailwind CSS
- SQLite (better-sqlite3 + Drizzle ORM)

## Features

- Multi-account IMAP/SMTP support
- Local-first mail cache
- Add-account wizard with autodiscovery + manual setup
- Compose, reply, forward, attachments
- Message viewer window
- Account/App settings windows
- Debug and support windows

## Requirements

- Node.js 20+
- npm 10+
- Linux desktop environment

## Install

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

## Linux Packaging

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

## Project Structure

```text
src/
  main/
  preload/
  renderer/
```

## License

ISC. See [LICENSE](LICENSE).
