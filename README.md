# Outline

**Version 1.3.1** · [Live demo](https://martinshaw.github.io/outline/) · [Repository](https://github.com/martinshaw/outline)

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
   - [Notes, tasks, subtasks, headings & status](#notes-tasks-subtasks-headings--status)
   - [Outliner behavior](#outliner-behavior)
   - [Links](#links)
   - [Block selection](#block-selection)
   - [Command palette](#command-palette)
   - [Tasks across notes](#tasks-across-notes)
   - [Search notes](#search-notes)
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
| **Tasks & subtasks** | Promote blocks; subtasks nest under tasks |
| **Tasks table** | Filterable cross-note task dialog (`⌘⌥T`); multi-select, bulk status, jump to an item |
| **Search** | Full-text search across all notes (`⌘⌥F`) with an inverted index |
| **Get started hints** | Tips on empty days (local-first note); dismiss or auto-hide; restore from the command palette |
| **Status chips** | Inline coloured chips on tasks/subtasks; configurable statuses |
| **Deadlines & entities** | Tagline on tasks/subtasks; link workspace entities; `⌘⌥A` |
| **Kind labels** | Quiet gutter labels for tasks, subtasks, and heading levels |
| **Headings** | Markdown `#` … `######` + space → heading blocks (levels 1–6) |
| **Sidebar** | Navigate days → tasks → subtasks; collapse state persisted |
| **Rich text** | Bold, italic, underline |
| **Links** | Paste/type URLs; click to open; unlink / whole-link delete |
| **Attachments** | Drag-drop or paste images, audio, video, or files into `attachments/`; image size, caption, fullscreen |
| **Block selection** | Gutter select, multi-select, drag to relocate at any level |
| **Exports** | Day or selection as JSON, YAML, Markdown, text, or HTML |
| **Backups** | Snapshot notes edited yesterday when you first write today |
| **Settings** | Stored as `settings.json` in your workspace folder |
| **Developer panel** | Optional bottom-right panel: Overview, Nodes, Files (off by default) |
| **Themes** | System / Light / Dark / High contrast plus Nord, Forest, Ocean, Sunset, Espresso, Terminal, Neon, Miami Vice |
| **Fonts** | Built-in + searchable system fonts (Local Font Access); exploration grid in Settings |
| **Confetti** | Optional celebration when every subtask under a task is done/archived |
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
- On an **empty day**, gentle **Get started** tips appear above the editor (local-first privacy note, shortcuts, attachments). Dismiss with ×, or they hide about a minute after you start typing. Restore anytime via the command palette (**Show get started hints**).

### Sidebar

- Lists non-empty days (newest first), with tasks and their subtasks nested underneath.
- Click a day, task, or subtask to jump there.
- Toggle via **Show / Hide notes sidebar** in the command palette or Settings (collapsed by default).

### Notes, tasks, subtasks, headings & status

| Kind | How you get it | Marker |
|------|----------------|--------|
| **Note** | Default | Hollow circle |
| **Heading** | Type `#` … `######` then space at the start of a block | Hollow circle + larger type + `H1`…`H6` gutter label |
| **Task** | `⌘Enter` / `Ctrl+Enter` on a note/heading (not under a task) | Circle + **status chip** + `TASK` gutter label |
| **Subtask** | `⌘Enter` / `Ctrl+Enter` on a note/heading **under** a task | Circle + **status chip** + `SUBTASK` gutter label |

On a **task** or **subtask**, `⌘Enter` / `Ctrl+Enter` **cycles status**; after the last status it **demotes to a note**. Backspace at the start of a **heading**, **task**, or **subtask** demotes it to a note.

Tasks and subtasks can also carry a **deadline** and linked **entities**. When set, they appear as muted text after the title (`Due Fri 11 · Ada, Acme`). Hover a task/subtask with no attributes to reveal **Deadline · Entities** at the end of the title, then click to edit. Shortcut: **`⌘⌥A` / `Ctrl+Alt+A`** (also in the command palette).

**Entities** live in workspace `entities.json`. Attribute editing starts with deadline only; use **+ Add entity type** to show a multiselect for People, Company, Project, or other types from Settings → Entities (keyboard: ↑↓ / Enter / Esc). Type to pick an existing name, or press Enter when nothing matches to create a new entity of that type. Day items store **entity ids**, so the same objects can be reused across days and used to relate tasks/subtasks by shared factors.

Default statuses (editable in Settings → Statuses):

1. Backlog  
2. To do  
3. In progress  
4. Done  
5. Archived  

Click a status chip to open a dropdown and pick a status. The chosen status is stored on the item in the day JSON. Subtasks keep their kind when moved outside a task.

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
| Click left gutter | Select block (nested children look selected and move with it) |
| Second gutter click on parent | Select parent only — moves leave children in place |
| Drag gutter | Multi-select contiguous range |
| `Shift`+click gutter | Extend selection |
| `Alt`+drag on items | Multi-select without the gutter |
| Drag selection (handle) | Move blocks between items; adopts that nesting level |
| Drag across text | Starts a text selection, then switches to block selection as you drag |
| Triple-click | Select block |
| `Esc` | Clear selection |

By default, selecting a parent includes its nested children for move/indent. A **second gutter click** on that parent toggles **self-only** mode (subtle outline; children no longer highlighted) so you can relocate the parent alone; click again to restore subtree moves. Selection is used for **Export selection**. UI chrome (sidebar, menus, chips) is non-selectable so `⌘A` / `Ctrl+A` targets the outline.

### Command palette

Open with **`⌘P` / `Ctrl+P`**. Type to filter; `↑` `↓` and `Enter` to run.

| Command | Purpose |
|---------|---------|
| **Show / Hide notes sidebar** | Toggle the day list |
| **Change folder** | Pick a different notes directory |
| **Insert test hierarchy** | Sample nested outline (only when developer mode is on) |
| **Manage tasks** | Filterable table of tasks/subtasks across notes (`⌘⌥T`) |
| **Search notes** | Full-text search across every day (`⌘⌥F`) |
| **Show get started hints** | Restore empty-day tips above the editor |
| **Keyboard shortcuts** | Same as `?` or `⌘/` / `Ctrl+/` |
| **Settings** | Font, theme, statuses, backups, autosave |
| **Edit deadline & entities** | Attributes on the current task/subtask (`⌘⌥A`) |
| **Show / Hide developer panel** | Toggle the bottom-right debug UI |
| **Export day / selection** | JSON, YAML, Markdown, Text, or HTML |

Errors (save failures, empty selection export, etc.) show as toasts.

### Tasks across notes

Open with **`⌘⌥T` / `Ctrl+Alt+T`**, the command palette (**Manage tasks**), or the top-right hint.

The dialog indexes every task and subtask in the loaded notes cache and shows them in a filterable table:

- Search by title, note date, status, parent task, or entity
- Filter by kind, deadline (overdue / today / upcoming / none), and status chips
- Filter by **common entities** (frequency-ranked chips; expand for all used entities by type)
- Hide completed (done / archived) by default
- Sort by note, title, kind, status, or deadline
- Change status inline (saves the day file)
- Finder-style multi-select and **bulk status** updates for the selection
- Click a row (or `Enter`) to jump to that item in the editor

### Search notes

Open with **`⌘⌥F` / `Ctrl+Alt+F`**, the command palette (**Search notes**), or the top-right hint.

Outline builds an **inverted full-text index** over every outline item in the loaded notes cache:

- Chunked rebuild when you open a workspace (keeps the UI responsive with many days)
- Incremental reindex of a day as you edit or save
- Token AND matching with prefix completion on the last word
- Snippets with highlighted matches; `Enter` / click jumps to the item

### Settings

Open **Settings** with **`⌘⌥,` / `Ctrl+Alt+,`** or from the command palette. Preferences are saved as **`settings.json`** in the root of your workspace folder (next to `notes/`), so they travel with your files — not in the browser.

| Section | Options |
|---------|---------|
| **Editor → Font** | Exploration grid: built-in presets, loaded system fonts, **Add system fonts…** (Local Font Access); type to search |
| **Editor → Size** | Slider 0.7–1.4rem (default **1.05rem** in the middle) |
| **Appearance → Theme** | Exploration grid: System, Light, Dark, High contrast, Nord, Forest, Ocean, Sunset, Espresso, Terminal, Neon, Miami Vice |
| **Appearance → Collapse sidebar** | Also toggled from the command palette |
| **Appearance → Confetti** | Celebrate when every subtask under a task becomes done/archived (on by default) |
| **Statuses** | Labels and colours for task/subtask chips; add / remove / reset list |
| **Entities** | Types for attribute multiselects (default People, Company, Project); catalog in `entities.json` |
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
| `⌘Enter` / `Ctrl+Enter` | Promote note/heading → task/subtask; cycle status, then demote to note |
| `Backspace` (at start) | Demote heading/task/subtask → note; else merge or outdent |
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
| `⌘P` / `Ctrl+P` | Command palette (settings, exports, folder…) |
| `⌘⌥F` / `Ctrl+Alt+F` | Search all notes |
| `⌘⌥T` / `Ctrl+Alt+T` | Manage tasks across notes |
| `⌘⌥,` / `Ctrl+Alt+,` | Open settings |
| `⌘⌥A` / `Ctrl+Alt+A` | Edit deadline & entities (task/subtask) |
| `?` | Open keyboard shortcuts |
| `⌘/` / `Ctrl+/` | Open keyboard shortcuts |
| `Esc` | Close dialog / clear selection |

---

## Storage layout

Everything stays inside the folder you grant:

```text
your-folder/
  settings.json           # app preferences (font, theme, statuses, backups, …)
  entities.json           # workspace entities (people, companies, …)
  attachments/            # dropped/pasted files (images, audio, video, …)
    <uuid>.png
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
  "version": 2,
  "date": "2026-10-08",
  "items": [
    {
      "id": "…",
      "kind": "task",
      "status": "in-progress",
      "deadline": "2026-10-15",
      "entities": ["«entity-id-ada»", "«entity-id-acme»"],
      "content": [
        { "type": "text", "text": "Ship outline", "format": { "bold": true } },
        { "type": "link", "url": "https://example.com", "text": "spec" }
      ],
      "children": [
        {
          "id": "…",
          "kind": "subtask",
          "status": "todo",
          "deadline": null,
          "entities": [],
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
| `version` | Schema version (`2`; `1` with `project`/`task` kinds is migrated on load) |
| `date` | `YYYY-MM-DD` (local calendar) |
| `items` | Top-level outline nodes |
| `kind` | `"note"` \| `"task"` \| `"subtask"` \| `"heading"` \| `"attachment"` |
| `headingLevel` | `1`–`6` when `kind` is `"heading"`; otherwise omitted/`null` |
| `status` | Status id for task/subtask (from `settings.json` statuses); omitted/`null` for notes/headings |
| `deadline` | ISO date `YYYY-MM-DD` for task/subtask; omitted/`null` otherwise |
| `entities` | Workspace **entity ids** from `entities.json`; `[]` / omitted otherwise |
| `people` | Legacy; migrated into `entities` on load |
| `attachment` | `{ path, mime, name, size, displaySize? }` when `kind` is `"attachment"` (`path` like `attachments/<uuid>.ext`) |
| `content` | Inline segments: plain/formatted text or links (caption on attachments) |
| `children` | Nested outline items |

Drag or paste a file onto the editor to create an **attachment** block. The binary is written under `attachments/`; the day JSON only stores the relative path and metadata. For **images**, use the ⋯ menu for **Small / Medium / Large / Full width**, **Add caption**, or **View full screen** (clicking the image also opens the lightbox). `displaySize` defaults to `"medium"`.

`manifest.json` lists known day keys and is regenerated whenever days are saved or removed.

### Workspace entities (`entities.json`)

Enumerable objects shared across the workspace. Types are configured in Settings → Entities (`entityTypes` in `settings.json`; defaults `person` / People, `company` / Company, and `project` / Project).

```json
{
  "version": 1,
  "entities": [
    { "id": "…", "type": "person", "label": "Ada" },
    { "id": "…", "type": "company", "label": "Acme" },
    { "id": "…", "type": "project", "label": "Apollo" }
  ]
}
```

| Field | Description |
|-------|-------------|
| `id` | Stable id referenced by day items (`entities`) |
| `type` | Entity kind id from settings (`person`, `company`, `project`, …) |
| `label` | Display name (unique per type, case-insensitive) |

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
  "entityTypes": [
    { "id": "person", "label": "People" },
    { "id": "company", "label": "Company" },
    { "id": "project", "label": "Project" }
  ],
  "backupMode": "on-next-day-write",
  "backupDirectory": "backups",
  "saveDebounceMs": 400,
  "developerMode": false,
  "taskCompleteConfetti": true
}
```

`theme` may also be a named palette id such as `"nord"`, `"miami-vice"`, or `"terminal"` (see Appearance → Theme in Settings).

Until a folder is opened, the app uses in-memory defaults. Opening a folder loads (or creates) this file.

---

## Exports

From the **command palette**, export the **whole day** or the **current block selection**:

| Format | Extension | Notes |
|--------|-----------|--------|
| JSON | `.json` | Same shape as day documents |
| YAML | `.yml` | Same data as JSON |
| Markdown | `.md` | Nested list; kinds/statuses as prefixes |
| Text | `.txt` | Plain indented outline |
| HTML | `.html` | Minimal standalone page |

When the export includes attachments, the download is a **`.zip`** named like the note (`outline-YYYY-MM-DD-day.zip`) containing a folder with `notes.{ext}` and an `attachments/` directory of the referenced files. Paths in the note stay workspace-relative (`attachments/…`) so they resolve inside the unzipped folder. Exports without attachments stay a single file.

Selection export requires at least one block selected.

---

## Offline & PWA

- After a production visit, the service worker caches the app shell so the UI can load offline.
- **Notes still require** access to your chosen folder. Offline editing works once permission is granted and the handle is available.
- Returning later, Chrome may ask you to re-confirm folder access — use the gate screen or **Change folder**.
- When a new deploy is ready, an **Update available** banner appears. Outline **auto-reloads after ~2s idle** (save finished, no typing, no dialogs open). **Reload now** applies as soon as the current save finishes; **Later** defers until the next update. Focus/visibility also re-checks for updates on long-lived tabs.

### Install on phone or desktop

1. Open the deployed site (or a local HTTPS/`localhost` build) in **Chrome**.
2. Use **Install app** / **Add to Home screen** (Chrome menu or the install icon in the address bar).
3. Outline opens standalone (no browser chrome), with notch-safe layout on phones.
4. On **Android Chrome**, pick your notes folder as usual. On **iPhone/iPad**, install works for the shell only — folder access is not available in Safari/WebKit.

### Small screens

- Notes list becomes a **slide-over drawer** (open via the command palette or Settings); choosing a day/item closes it.
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
| `src/storage/` | Folder I/O, saves, backups, `settings.json`, `entities.json`, change log, debug store |
| `src/entities/` | Workspace entity catalog (people) + occurrence queries |
| `src/settings/` | Preferences model, normalisation, Local Font Access |
| `src/sidebar/` | Day / task / subtask navigation |
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
| `npm test` | Vitest suite (also runs in CI before Pages deploy) |
| `npm run build` | Typecheck + production build (`base: /`) |
| `npm run build:pages` | Typecheck + build for GitHub Pages (`base: /outline/`) |
| `npm run preview` | Preview the production build locally |

---

## Deploy (GitHub Pages)

CI installs dependencies, runs **`npm test`**, then builds and deploys on pushes to `main` / `master`, on version tags (`v*`), and via **workflow_dispatch**. Failed tests block the deploy.

Pushing a **`v*`** tag also creates a [GitHub Release](https://github.com/martinshaw/outline/releases) whose notes are taken from that version’s section in `CHANGELOG.md`.

- Workflows: [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml), [`.github/workflows/release.yml`](.github/workflows/release.yml)
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

[GNU General Public License v3.0](./LICENSE) (or later).
