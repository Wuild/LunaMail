# Plugin/Extension System Design

## Purpose

Define a secure, maintainable extension system for LunaMail that can:

- Extend **main process** behavior (backend integrations, automation, sync helpers)
- Extend **renderer** behavior (UI panels, commands, menus, views)
- Keep strict Electron security boundaries (`contextIsolation`, preload-only bridge)

This document covers architecture, APIs, security model, lifecycle, packaging, and phased delivery.

---

## Goals

- Allow third-party features without editing core app code
- Keep plugins isolated from core internals
- Prevent direct plugin access to Node/Electron internals in renderer
- Enable deterministic startup, crash containment, and disable/fallback behavior
- Provide typed SDK surface with versioning

## Non-Goals (v1)

- Running untrusted code from remote URLs
- Full browser-like extension compatibility
- Arbitrary direct DB file access by plugins
- Arbitrary filesystem/network access without permissions

---

## Core Principles

- **Capability-based APIs**: plugin can only call APIs explicitly granted
- **Manifest-driven permissions**: every privileged action declared up front
- **Preload as the only renderer bridge**: no direct Node in renderer plugins
- **Failure isolation**: plugin failures never break app startup
- **Versioned contracts**: plugin API and events are semver’d

---

## High-Level Architecture

1. **Plugin Manager (main process)**
    - Discovers, validates, loads, enables/disables plugins
    - Maintains plugin state and permission grants
    - Hosts lifecycle and health supervision
2. **Plugin Host Runtime**
    - Main plugins run in isolated workers/processes with RPC
    - Renderer plugins run in sandboxed iframe/webview or dynamic module sandbox
3. **Plugin SDK**
    - Typed APIs for commands, menu contributions, panels, mail hooks, storage, logging
4. **Extension Registry (local first)**
    - Local install/uninstall/update metadata
    - Optional remote catalog in later phase
5. **UI Integration Layer (renderer)**
    - Renders contributed panels/pages/toolbars/commands from vetted manifests

---

## Plugin Types

### 1) Main Plugins

Used for:

- Mail processing hooks (classification, enrichment)
- Background automation tasks
- Import/export connectors

Execution model:

- Run in `Worker`/child process
- Communicate with main via typed RPC
- No direct access to LunaMail internals beyond SDK capability surface

### 2) Renderer Plugins

Used for:

- Sidebar modules
- Settings sections
- Context menu commands
- Message viewer augmentation UI

Execution model:

- Loaded through renderer plugin host
- Must communicate through preload-safe APIs
- No direct filesystem or IMAP/SMTP access

### 3) Hybrid Plugins

- Single package containing main + renderer entrypoints
- Shared manifest and version
- Main and renderer capabilities granted separately

---

## Plugin Package Format

Each plugin is a folder or archive (`.lunaplugin`) containing:

- `plugin.json` (manifest)
- `dist/main.js` (optional)
- `dist/renderer.js` (optional)
- `README.md`
- `icon.png` (optional)
- `signature.json` (phase 3+)

### Example `plugin.json`

```json
{
	"id": "com.example.mail-tags",
	"name": "Mail Tags Enhancer",
	"version": "1.0.0",
	"engine": {
		"lunamail": "^1.1.0",
		"pluginApi": "^1.0.0"
	},
	"entry": {
		"main": "dist/main.js",
		"renderer": "dist/renderer.js"
	},
	"permissions": ["mail.read.metadata", "mail.write.tags", "ui.contribute.panels", "storage.plugin"],
	"contributes": {
		"commands": [
			{
				"id": "tags.autoApply",
				"title": "Auto Apply Tags"
			}
		],
		"panels": [
			{
				"id": "tags.panel",
				"title": "Tag Rules",
				"route": "/ext/com.example.mail-tags/tags"
			}
		]
	}
}
```

---

## SDK Surface (Proposed)

## Main SDK

- `registerHook(event, handler)`
- `registerCommand(commandId, handler)`
- `storage.get/set/remove(key)`
- `mail.queryMessages(filter)`
- `mail.updateTags(messageId, tags)`
- `logger.{debug,info,warn,error}`
- `events.emit/on`

## Renderer SDK

- `ui.registerPanel(config)`
- `ui.registerMenuItem(config)`
- `ui.registerCommand(commandId, handler)`
- `ui.showToast(payload)`
- `state.getContext()` (selected account/folder/message summary only)
- `events.emit/on`
- `storage.get/set/remove(key)` (plugin-scoped)

## Cross-Plugin Rules

- No direct plugin-to-plugin calls by default
- Optional explicit public API export in later phase

---

## Lifecycle

1. Discover plugins from plugin directory
2. Parse and validate manifest
3. Check engine compatibility
4. Resolve permission grants
5. Start main runtime (if any)
6. Register renderer contributions
7. Mark plugin active

Shutdown:

1. Call plugin `deactivate()`
2. Dispose subscriptions/resources
3. Hard-timeout and terminate runtime if hung

Error handling:

- Plugin crash increments crash counter
- Exponential backoff restart
- Auto-disable after N failures
- Emit global app error event with plugin context

---

## Security Model

- Renderer plugin code is unprivileged by default
- All privileged operations go through permission-gated SDK calls
- Manifest permissions shown to user at install time
- Optional per-plugin toggles in settings:
    - Enable/disable
    - Permission revocation
    - Clear plugin data
- CSP for renderer host must block inline/eval for plugin content unless explicitly required
- Disallow native module loading in plugin packages (v1)

---

## Data & Storage

- Plugin-scoped KV storage:
    - Namespace: `plugin:{pluginId}:*`
    - Backed by SQLite via core repository layer
- Optional file cache directory:
    - `~/.config/LunaMail/plugins-data/<pluginId>/`
    - Quota-limited in later phase

---

## IPC Contract Additions

Add preload/main IPC for plugin management:

- `plugins.list()`
- `plugins.install(pathOrPackage)`
- `plugins.uninstall(pluginId)`
- `plugins.enable(pluginId)`
- `plugins.disable(pluginId)`
- `plugins.getPermissions(pluginId)`
- `plugins.updatePermissions(pluginId, patch)`
- `plugins.getLogs(pluginId, limit?)`

Event streams:

- `plugins.onStateChanged`
- `plugins.onCrashed`
- `plugins.onLog`

---

## UI/UX Requirements

- New settings section: **Extensions**
- Show:
    - Installed plugins
    - Version, author, permissions
    - Enable/disable toggle
    - Health status/crash count
    - Update availability (phase 3+)
- Install flow:
    - Select local package
    - Validate manifest/signature
    - Show permission prompt
    - Confirm install

---

## Versioning & Compatibility

- Plugin API version separate from app version
- SDK supports compatibility windows:
    - `pluginApi: ^1.0.0`
- Breaking API changes require:
    - New major plugin API version
    - Migration notes

---

## Observability

- Plugin-specific logs with plugin id and scope
- Metrics:
    - startup time
    - memory usage (main plugin workers)
    - crash count
    - command invocation failures

---

## Phased Implementation Plan

## Phase 1: Foundation (MVP)

- Add plugin manifest schema + validator
- Add Plugin Manager in main process
- Add local install/uninstall/enable/disable
- Add minimal SDK:
    - logging
    - command registration
    - plugin-scoped storage
- Add Extensions settings page

## Phase 2: Renderer Contributions

- Add renderer plugin host + sandbox model
- Add panel/menu/command contributions
- Add context APIs (selected account/folder/message metadata)
- Add permission prompts + revocation UI

## Phase 3: Hardening

- Add signature verification
- Add crash watchdog + auto-disable policy
- Add plugin diagnostics UI/log viewer
- Add compatibility matrix checks

## Phase 4: Ecosystem

- Add plugin packaging CLI/tooling
- Add template starter repos
- Add optional plugin catalog/update service

---

## Engineering Work Breakdown Checklist

- [ ] Define `plugin.json` schema and runtime validator
- [ ] Create `src/main/plugins/` module (manager, registry, runtime, permissions)
- [ ] Add plugin state tables (installed, enabled, permissions, health, logs)
- [ ] Implement plugin-scoped storage APIs
- [ ] Add IPC routes in preload/main for plugin management
- [ ] Build renderer Extensions settings page
- [ ] Implement main plugin runtime isolation (worker/process + RPC)
- [ ] Implement renderer contribution host
- [ ] Add command contribution pipeline
- [ ] Add menu/panel contribution pipeline
- [ ] Add permission prompt + revocation UI
- [ ] Add plugin crash supervision + auto-disable
- [ ] Add plugin SDK package (`@lunamail/plugin-sdk`) and typings
- [ ] Add example plugins (one main, one renderer, one hybrid)
- [ ] Add E2E tests for install/enable/disable/uninstall and permission enforcement

---

## Open Questions

- Worker threads vs separate process for main plugins by default?
- Strict sandbox (iframe) vs dynamic import for renderer plugins?
- Signed plugins mandatory from day 1 or phased?
- Should plugin network access be globally deny-by-default and proxied via SDK?
- How much UI contribution flexibility is acceptable without harming UX consistency?

---

## Recommended First Slice

Implement only:

- Local plugin install/uninstall
- Enable/disable
- Command contribution
- Plugin storage
- Basic permissions (`ui.commands`, `storage.plugin`)

This gives immediate value with low risk and creates the scaffolding for richer extensions later.
