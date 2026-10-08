# Outline

**Version 0.7.0** · [Live demo](https://martinshaw.github.io/outline/) · [Repository](https://github.com/martinshaw/outline)

Local-first chronological outline editor inspired by [LogSeq](https://logseq.com). Notes live in a folder on your computer via Chrome’s File System Access API — no account, no server, no sync backend.

Built with [React](https://react.dev), [Lexical](https://lexical.dev), [Vite](https://vitejs.dev), and a Progressive Web App shell for offline use.

---

## Table of contents

1. [Features](#features)
2. [Requirements](#requirements)
3. [Quick start](#quick-start)
4. [Using the app](#using-the-app)
   - [Daily notes](#daily-notes)
   - [Sidebar](#sidebar)
   - [Notes, projects, tasks, headings & status](#notes-projects-tasks-headings--status)
   - [Outliner behavior](#outliner-behavior)
   - [Links](#links)
   - [Block selection](#block-selection)
   - [Menu](#menu)
   - [Settings](#settings)
5. [Keyboard shortcuts](#keyboard-shortcuts)
6. [Storage layout](#storage-layout)
7. [Day document format](#day-document-format)
8. [Settings file format](#settings-file-format)
9. [Exports](#exports)
10. [Offline & PWA](#offline--pwa)
11. [Troubleshooting](#troubleshooting)
12. [Tech stack](#tech-stack)
13. [Scripts](#scripts)
14. [Deploy (GitHub Pages)](#deploy-github-pages)
15. [Contributing](#contributing)
16. [License](#license)

---

## Features

| Area | What you get |
|------|----------------|
| **Daily notes** | One outline document per calendar day (`YYYY-MM-DD`) |
| **Nested outliner** | Indent, outdent, and reorder with LogSeq-style tree moves |
| **Projects & tasks** | Promote blocks; tasks nest under projects |
| **Status chips** | Inline coloured chips on projects/tasks; configurable statuses |
| **Kind labels** | Quiet gutter labels for projects, tasks, and heading levels |
| **Headings** | Markdown `#` … `######` + space → heading blocks (levels 1–6) |
| **Sidebar** | Navigate days → projects → tasks; collapse state persisted |
| **Rich text** | Bold, italic, underline |
| **Links** | Paste/type URLs; click to open; unlink / whole-link delete |
| **Block selection** | Gutter select, multi-select, drag to relocate at any level |
| **Exports** | Day or selection as JSON, YAML, Markdown, text, or HTML |
| **Backups** | Snapshot notes edited yesterday when you first write today |
| **Settings** | Stored as `settings.json` in your workspace folder |
| **Developer panel** | Optional bottom-right panel: Overview, Nodes, Files (off by default) |
| **Theme** | System, light, or dark (flat dark; no decorative page glow) |
| **Fonts** | Built-in + searchable system fonts (Local Font Access) |
| **Offline PWA** | Installable app shell; works offline after first visit; data stays on disk |
| **Phone-friendly** | Drawer navigation, safe areas, touch targets; install from Chrome on Android |

---

## Requirements

| Requirement | Notes |
|-------------|--------|
| **Google Chrome** (desktop or recent Android) | File System Access API; other Chromium browsers may work |
| **Secure context** | `http://localhost` or `https://` (required for folder access and install) |
| **Folder permission** | Read/write access to a directory you choose |

Safari and Firefox are **not** supported for folder persistence. iOS can install the PWA shell, but **cannot** pick a notes folder yet (no File System Access API).

**Embedded / IDE browsers are not supported** — including Cursor’s Simple Browser / integrated browser preview. Those environments typically lack a working File System Access API (and sometimes a proper secure context), so folder pick and persistence will fail. Open the Vite URL in desktop Chrome instead (e.g. `http://localhost:5173`).

---

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints in **desktop Chrome** (typically `http://localhost:5173`). Do not use Cursor’s integrated browser — see [Requirements](#requirements).

1. On the setup screen, click **Open notes folder** (repo link is at the bottom of that screen)
2. Choose an existing directory or create a new one
3. Grant read/write permission when Chrome prompts — prefer **Allow on every visit** so you are not asked every reload
4. Start typing in today’s outline

The folder handle is remembered in IndexedDB. On later visits you may still need one click to re-grant permission if you did not allow every visit.

### Production build

```bash
npm run build
npm run preview
```

For GitHub Pages asset paths:

```bash
npm run build:pages
```

Serve `dist/` over HTTPS (or localhost) if you host it yourself.

---

## Using the app

### Daily notes

- The editor opens on **today’s** date.
- Each day is a separate JSON file under `notes/`.
- Empty days are removed from disk automatically (today can stay open in the UI even if empty).
- Switch days from the sidebar or keep editing older notes; saves still go to that day’s file.

### Sidebar

- Lists non-empty days (newest first), with projects and their tasks nested underneath.
- Click a day, project, or task to jump there.
- Toggle with ☰ in the top bar (collapsed by default; preference is saved in settings).

### Notes, projects, tasks, headings & status

| Kind | How you get it | Marker |
|------|----------------|--------|
| **Note** | Default | Hollow circle |
| **Heading** | Type `#` … `######` then space at the start of a block | Hollow circle + larger type + `H1`…`H6` gutter label |
| **Project** | `⌘Enter` / `Ctrl+Enter` on a note/heading (not under a project) | Circle + **status chip** + `PROJECT` gutter label |
| **Task** | `⌘Enter` / `Ctrl+Enter` on a note/heading **under** a project | Circle + **status chip** + `TASK` gutter label |

On a **project** or **task**, `⌘Enter` / `Ctrl+Enter` **cycles status** (does not demote to a note). Backspace at the start of a **heading** demotes it to a note.

Default statuses (editable in Settings → Statuses):

1. Backlog  
2. To do  
3. In progress  
4. Done  
5. Archived  

Click a status chip to open a dropdown and pick a status. The chosen status is stored on the item in the day JSON. Tasks keep their kind when moved outside a project.

### Outliner behavior

Matches LogSeq’s mental model:

- **Enter** — new sibling; at the end of a parent with children → first child; on an empty indented block → outdent
- **Tab / Shift+Tab** — indent under previous sibling / outdent (following siblings become children of the outdented block)
- **Move up/down** — tree walk, not only same-level swaps (e.g. first child moving up becomes last child of the previous uncle)
- **Backspace** at the start of a block — merge with previous or outdent when appropriate
- Caret position is preserved across indent/outdent

With a **block selection**, Tab, Shift+Tab, and move shortcuts apply to the whole contiguous group (same parent).

### Links

- **Paste** a URL → insert a link (selected text becomes the label if any)
- **Type** a URL → auto-linked when recognized (including `localhost`)
- **Click** a link → opens in a new tab
- **Right-click** a link → confirm to remove the hyperlink (text kept)
- **Backspace** or **Delete** on/adjacent to a link → removes the entire link in one step

### Block selection

| Action | Result |
|--------|--------|
| Click left gutter | Select block |
| Drag gutter | Multi-select contiguous range |
| `Shift`+click gutter | Extend selection |
| `Alt`+drag on items | Multi-select without the gutter |
| Drag selection (gutter) | Move blocks between items; adopts that nesting level |
| Drag across text | Starts a text selection, then switches to block selection as you drag |
| Triple-click | Select block |
| `Esc` | Clear selection |

Selected blocks include nested children for move/indent where applicable. Selection is used for **Export selection**. UI chrome (sidebar, menus, chips) is non-selectable so `⌘A` / `Ctrl+A` targets the outline.

### Menu

Open **Menu** in the top bar:

| Item | Purpose |
|------|---------|
| **Change folder** | Pick a different notes directory |
| **Insert test hierarchy** | Sample nested outline for the active day |
| **Keyboard shortcuts** | Same as `?` or `⌘/` / `Ctrl+/` |
| **Settings…** | Font, theme, statuses, backups, autosave |
| **Export day / selection** | JSON, YAML, Markdown, Text, or HTML |

Errors (save failures, empty selection export, etc.) show as toasts.

### Settings

Open **Menu → Settings…**. Preferences are saved as **`settings.json`** in the root of your workspace folder (next to `notes/`), so they travel with your files — not in the browser.

| Section | Options |
|---------|---------|
| **Editor → Font** | Built-in presets, loaded system fonts, **Add system fonts…** (Local Font Access); type to search |
| **Editor → Size** | Slider 0.7–1.4rem (default **1.05rem** in the middle) |
| **Appearance → Theme** | System, Light, Dark |
| **Appearance → Collapse sidebar** | Also toggled with ☰ |
| **Statuses** | Labels and colours for project/task chips; add / remove / reset list |
| **Backups → When to backup** | On next day’s first write (default), or Off |
| **Backups → Folder name** | Sibling of `notes/` (default `backups`) |
| **Saving → Autosave delay** | 250 ms – 1.5 s |
| **Developer → Show developer panel** | Bottom-right debug UI (off by default; no logging or I/O until enabled) |

When the developer panel is on, tabs are:

| Tab | Contents |
|-----|----------|
| **Overview** | Session / day / save / settings snapshot + live event log |
| **Nodes** | Live outline tree for the active day (kind, id, title; focus & block selection highlighted) |
| **Files** | Lazy workspace directory tree (notes, settings, backups, …) |

Changing a setting (including dropdowns) keeps you on the current settings section. Closing the panel (×) or unchecking the setting turns developer mode off.

**Reset to defaults** (sidebar of the settings dialog) restores built-in values.

---

## Keyboard shortcuts

Press `?` or `⌘/` / `Ctrl+/` in the app for the same list.

### Blocks

| Shortcut | Action |
|----------|--------|
| `Enter` | Create sibling block |
| `Enter` (empty indented) | Outdent to parent level |
| `Enter` (end of block with children) | Create first child |
| `Tab` | Indent under previous sibling |
| `Shift+Tab` | Outdent (following siblings become children) |
| `⌘⇧↑` / `⌘⇧↓` (macOS) | Move block or selection up / down |
| `Alt+Shift+↑` / `Alt+Shift+↓` (Windows/Linux) | Move block or selection up / down |
| `⌘Enter` / `Ctrl+Enter` | Promote note/heading → project/task; cycle status on project/task |
| `Backspace` (at start) | Merge with previous or outdent; demote heading → note |
| `Esc` | Clear block selection |

### Selection

| Shortcut | Action |
|----------|--------|
| Click gutter | Select block |
| Drag gutter | Multi-select contiguous blocks |
| `Shift`+click gutter | Extend selection |
| `Alt`+drag | Multi-select without gutter |
| Drag selection | Move selection between items (adopts that level) |
| Triple-click | Select block |

### Formatting

| Shortcut | Action |
|----------|--------|
| `⌘B` / `Ctrl+B` | Bold |
| `⌘I` / `Ctrl+I` | Italic |
| `⌘U` / `Ctrl+U` | Underline |
| `#` … `######` then Space | Heading levels 1–6 |
| Paste URL | Insert link |
| Right-click link | Remove link |

### App

| Shortcut | Action |
|----------|--------|
| `?` | Open keyboard shortcuts |
| `⌘/` / `Ctrl+/` | Open keyboard shortcuts |
| Menu | Settings, exports, folder… |
| `Esc` | Close dialog / clear selection |

---

## Storage layout

Everything stays inside the folder you grant:

```text
your-folder/
  settings.json           # app preferences (font, theme, statuses, backups, …)
  notes/
    2026-10-08.json       # one file per day with content
    manifest.json         # index of day keys (rebuilt on save)
  backups/                # never loaded by the app UI
    change-log.json       # which note dates were edited on which calendar day
    2026-10-07/           # snapshot taken when you next write on a later day
      2026-10-05.json
      2026-10-07.json
```

### Saves

- Edits debounce to disk as you work (delay configurable).
- Saving an empty day **deletes** that day’s JSON file and updates the manifest.
- The directory handle is stored in the browser (IndexedDB via `idb-keyval`); note content and settings live only in your folder.

### Backups

1. Every successful save (or delete) records that **note date** under **today’s calendar date** in `backups/change-log.json` (when backups are enabled).
2. The first time you write on a **new day’s** note, the app copies every note that was changed on earlier calendar days into `backups/<change-day>/`.
3. Those change-log entries are then cleared. Skipped days still flush when you eventually write today’s note.
4. Backup files are plain copies for recovery; the sidebar and editor **only** read `notes/`.

---

## Day document format

Each `notes/YYYY-MM-DD.json` file looks like:

```json
{
  "version": 1,
  "date": "2026-10-08",
  "items": [
    {
      "id": "…",
      "kind": "project",
      "status": "in-progress",
      "content": [
        { "type": "text", "text": "Ship outline", "format": { "bold": true } },
        { "type": "link", "url": "https://example.com", "text": "spec" }
      ],
      "children": [
        {
          "id": "…",
          "kind": "task",
          "status": "todo",
          "content": [{ "type": "text", "text": "Write README" }],
          "children": []
        }
      ]
    }
  ]
}
```

| Field | Description |
|-------|-------------|
| `version` | Schema version (`1`) |
| `date` | `YYYY-MM-DD` (local calendar) |
| `items` | Top-level outline nodes |
| `kind` | `"note"` \| `"project"` \| `"task"` \| `"heading"` |
| `headingLevel` | `1`–`6` when `kind` is `"heading"`; otherwise omitted/`null` |
| `status` | Status id for project/task (from `settings.json` statuses); omitted/`null` for notes/headings |
| `content` | Inline segments: plain/formatted text or links |
| `children` | Nested outline items |

`manifest.json` lists known day keys and is regenerated whenever days are saved or removed.

---

## Settings file format

`settings.json` at the workspace root (created when you open a folder):

```json
{
  "version": 1,
  "font": "source-serif",
  "systemFontFamily": null,
  "fontSize": 1.05,
  "theme": "system",
  "sidebarCollapsed": true,
  "statuses": [
    { "id": "backlog", "label": "Backlog", "color": "#6b7280" },
    { "id": "todo", "label": "To do", "color": "#3b82f6" },
    { "id": "in-progress", "label": "In progress", "color": "#d97706" },
    { "id": "done", "label": "Done", "color": "#16a34a" },
    { "id": "archived", "label": "Archived", "color": "#9ca3af" }
  ],
  "backupMode": "on-next-day-write",
  "backupDirectory": "backups",
  "saveDebounceMs": 400,
  "developerMode": false
}
```

Until a folder is opened, the app uses in-memory defaults. Opening a folder loads (or creates) this file.

---

## Exports

From **Menu**, export the **whole day** or the **current block selection**:

| Format | Extension | Notes |
|--------|-----------|--------|
| JSON | `.json` | Same shape as day documents |
| YAML | `.yml` | Same data as JSON |
| Markdown | `.md` | Nested list; kinds/statuses as prefixes |
| Text | `.txt` | Plain indented outline |
| HTML | `.html` | Minimal standalone page |

Selection export requires at least one block selected.

---

## Offline & PWA

- After a production visit, the service worker caches the app shell so the UI can load offline.
- **Notes still require** access to your chosen folder. Offline editing works once permission is granted and the handle is available.
- Returning later, Chrome may ask you to re-confirm folder access — use the gate screen or **Change folder**.

### Install on phone or desktop

1. Open the deployed site (or a local HTTPS/`localhost` build) in **Chrome**.
2. Use **Install app** / **Add to Home screen** (Chrome menu or the install icon in the address bar).
3. Outline opens standalone (no browser chrome), with notch-safe layout on phones.
4. On **Android Chrome**, pick your notes folder as usual. On **iPhone/iPad**, install works for the shell only — folder access is not available in Safari/WebKit.

### Small screens

- Notes list becomes a **slide-over drawer** (☰); choosing a day/item closes it.
- Editor gutters tighten so more of each line is visible.
- Dialogs and the developer panel adapt to narrow viewports and home-indicator insets.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| **Open notes folder** does nothing | Use desktop Chrome on `localhost` or HTTPS — not Cursor’s integrated browser / IDE Simple Browser |
| Stuck on permission screen | Click the prompt; check the site isn’t blocked from file access |
| Works in Chrome but blank/broken in Cursor preview | Expected — open the app in Chrome; File System Access isn’t available in that embedded browser |
| Changes not on disk | Watch for error toasts; confirm the folder still exists and is writable |
| Settings reset after reopening | Confirm `settings.json` exists in the workspace root and is writable |
| Old day missing from sidebar | Empty days are deleted; check `backups/` for a prior snapshot |
| System fonts missing | Desktop Chrome/Edge only; choose **Add system fonts…** and allow permission |
| Links / shortcuts feel wrong | Open **Keyboard shortcuts** (`?`) for the current platform bindings |
| Offline shell but no notes | Re-grant folder permission after reconnecting |
| GitHub Pages 404 on assets | Site must be built with `build:pages` (`base: /outline/`) |

---

## Tech stack

| Piece | Choice |
|-------|--------|
| UI | React 19 |
| Editor | Lexical (+ link / rich-text helpers) |
| Bundler | Vite 7 |
| Offline | `vite-plugin-pwa` / Workbox |
| Folder handle | File System Access API + `idb-keyval` |
| Language | TypeScript |

### Source map

| Path | Role |
|------|------|
| `src/editor/` | Lexical editor, outline nodes, plugins (indent, selection, status chips, links, headings) |
| `src/storage/` | Folder I/O, saves, backups, `settings.json`, change log, debug store |
| `src/settings/` | Preferences model, normalisation, Local Font Access |
| `src/sidebar/` | Day / project / task navigation |
| `src/components/` | Gate, menu, settings/shortcuts dialogs, developer panel, toasts, font picker |
| `src/assets/patterns/` | Setup-page background tile |
| `src/utils/export.ts` | Export serializers |
| `src/types.ts` | Shared document types |
| `.github/workflows/` | GitHub Pages deploy |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck + production build (`base: /`) |
| `npm run build:pages` | Typecheck + build for GitHub Pages (`base: /outline/`) |
| `npm run preview` | Preview the production build locally |

---

## Deploy (GitHub Pages)

CI builds and deploys on pushes to `main` / `master`, on version tags (`v*`), and via **workflow_dispatch**:

- Workflow: [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
- Site: https://martinshaw.github.io/outline/

Enable **Settings → Pages → GitHub Actions** as the source. The `github-pages` environment should allow the `master` (or `main`) branch and optionally `v*` tags.

---

## Contributing

1. Fork or clone https://github.com/martinshaw/outline  
2. `npm install` && `npm run dev`  
3. Prefer small PRs against `master`  
4. Run `npm run build` (or `build:pages` if touching deploy/base paths) before opening a PR  

---

## License

MIT — see the repository for license details.
