# Linux Packaging

LunaMail can be packaged for Linux as:

- AppImage
- deb
- rpm
- flatpak

## Build Commands

From project root:

```bash
npm run build:linux
```

Artifacts are written to `dist/`.

## Host Requirements

Install common build tools first:

```bash
sudo apt install -y build-essential rpm fakeroot dpkg
```

For Flatpak target support, ensure Flatpak tooling is installed:

```bash
sudo apt install -y flatpak flatpak-builder
```

On Fedora/Nobara/RHEL-family hosts, install compatibility libs needed by `electron-builder`'s bundled `fpm`:

```bash
sudo dnf install -y rpm-build flatpak-builder libxcrypt-compat
```

## Notes

- Packaging is configured through `electron-builder` in `package.json`.
- Native module rebuild for Electron is handled by `npm run rebuild:native`.
- Run builds on Linux for Linux targets.
- Flatpak target is configured for:
    - runtime: `org.freedesktop.Platform//24.08`
    - sdk: `org.freedesktop.Sdk//24.08`
    - base app: `org.electronjs.Electron2.BaseApp//24.08`
