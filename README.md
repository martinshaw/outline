# Outline

**Version 0.5.0**

Local-first chronological outline editor inspired by [LogSeq](https://logseq.com). Notes live in a folder on your computer via Chrome’s File System Access API — no account, no server, no sync backend.

Built with [React](https://react.dev), [Lexical](https://lexical.dev), [Vite](https://vitejs.dev), and a Progressive Web App shell for offline use.

**Live demo (GitHub Pages):** https://martinshaw.github.io/outline/

---

## Features

- **Daily notes** — one outline document per calendar day (`YYYY-MM-DD`)
- **Nested outliner** — indent, outdent, and reorder blocks with LogSeq-style tree moves
- **Projects & tasks** — mark blocks as projects; children under a project can be tasks
- **Sidebar** — navigate days → projects → tasks; collapsible
- **Rich text** — bold, italic, underline
- **Links** — paste or type URLs; click to open; right-click to unlink; Backspace deletes the whole link
- **Block selection** — gutter click/drag, Shift-extend, Alt-drag; bulk indent/move/export
- **Exports** — day or selection as JSON, YAML, Markdown, plain text, or HTML
- **Automatic backups** — notes touched on a given calendar day are snapshotted the next time you write today’s note
- **Settings** — stored as `settings.json` in your notes folder (font, size, theme, backups, autosave)
- **Dark mode** — system, light, or dark (configurable)
- **Offline PWA** — app shell caches after first visit; notes stay on disk

---

## Requirements

| Requirement | Notes |
|-------------|--------|
| **Google Chrome** (desktop) | File System Access API; other Chromium browsers may work |
| **Secure context** | `http://localhost` or `https://` |
| **Folder permission** | Read/write access to a directory you choose |

Safari and Firefox are not supported for folder persistence.

---

## Quick start

```bash
npm install
npm run dev
```

Open the URL Vite prints (typically `http://localhost:5173`).

1. Click **Open notes folder**
2. Choose an existing directory or create a new one
3. Grant read/write permission when Chrome prompts
4. Start typing in today’s outline

The folder handle is remembered in IndexedDB. On later visits you may need to click once to re-grant permission.

### Production build

```bash
npm run build
npm run preview
```

Serve the `dist/` output over HTTPS (or localhost) if you host it yourself.

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
- Toggle the sidebar with the ☰ button in the top bar (collapsed by default).

### Projects and tasks

| Kind | How you get it | Appearance |
|------|----------------|------------|
| **Note** | Default | Plain bullet |
| **Project** | `⌘Enter` / `Ctrl+Enter` on a note | Distinct project styling |
| **Task** | `⌘Enter` / `Ctrl+Enter` on a block **under** a project | Task styling |

Toggling again cycles back. Moving a task out from under any project demotes it to a note.

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
| Triple-click | Select block |
| `Esc` | Clear selection |

Tasks keep their kind when moved outside a project (they no longer demote to notes).

Selected blocks include their nested children for move/indent semantics where applicable. Selection is used for **Export selection**.

### Menu

Open **Menu** in the top bar:

- **Change folder** — pick a different notes directory
- **Insert test hierarchy** — sample nested outline for the active day (handy for trying moves)
- **Keyboard shortcuts** — same as `?` or `⌘/` / `Ctrl+/`
- **Settings…** — font, size, theme, backups, autosave
- **Export day** / **Export selection** — JSON, YAML, Markdown, Text, or HTML download

Errors (save failures, export with nothing selected, etc.) show as toasts.

### Settings

Open **Menu → Settings…**. Preferences are saved as **`settings.json`** in the root of your chosen workspace folder (next to `notes/`), so they travel with your files — not in the browser.

| Setting | Options |
|---------|---------|
| **Font** | One dropdown: built-in presets, loaded system fonts, and **Add system fonts…** (Local Font Access) |
| **Size** | Slider from 0.7–1.4rem (default 1.05rem in the middle) |
| **Theme** | System, Light, Dark |
| **Collapse sidebar** | Persisted; also toggled with ☰ in the top bar |
| **When to backup** | On next day’s first write (default), or Off |
| **Backup folder name** | Sibling of `notes/` (default `backups`) |
| **Autosave delay** | 250 ms – 1.5 s |

Use **Reset to defaults** to restore the built-in values.

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
| `⌘Enter` / `Ctrl+Enter` | Toggle project (or task under a project) |
| `Backspace` (at start) | Merge with previous or outdent |
| `Esc` | Clear block selection |

### Selection

| Shortcut | Action |
|----------|--------|
| Click gutter | Select block |
| Drag gutter | Multi-select contiguous blocks |
| `Shift`+click gutter | Extend selection |
| `Alt`+drag | Multi-select without gutter |
| Triple-click | Select block |

### Formatting

| Shortcut | Action |
|----------|--------|
| `⌘B` / `Ctrl+B` | Bold |
| `⌘I` / `Ctrl+I` | Italic |
| `⌘U` / `Ctrl+U` | Underline |
| Paste URL | Insert link |
| Right-click link | Remove link |

### App

| Shortcut | Action |
|----------|--------|
| `?` | Open keyboard shortcuts |
| `⌘/` / `Ctrl+/` | Open keyboard shortcuts |
| `Esc` | Close dialog / clear selection |

---

## Storage layout

Everything stays inside the folder you grant:

```text
your-folder/
  settings.json           # app preferences (font, theme, backups, …)
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

- Edits debounce to disk as you work.
- Saving an empty day **deletes** that day’s JSON file and updates the manifest.
- The directory handle is stored in the browser (IndexedDB via `idb-keyval`); note content and settings live only in your folder.

### Backups

1. Every successful save (or delete) records that **note date** under **today’s calendar date** in `backups/change-log.json`.
2. The first time you write on a **new day’s** note (`today`’s file), the app copies every note that was changed on earlier calendar days into `backups/<change-day>/`.
3. Those change-log entries are then cleared. Skipped days still flush when you eventually write today’s note.
4. Backup files are plain copies for your own recovery; the sidebar and editor **only** read `notes/`.

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
      "content": [
        { "type": "text", "text": "Ship outline", "format": { "bold": true } },
        { "type": "link", "url": "https://example.com", "text": "spec" }
      ],
      "children": [
        {
          "id": "…",
          "kind": "task",
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
| `kind` | `"note"` \| `"project"` \| `"task"` |
| `content` | Inline segments: plain/formatted text or links |
| `children` | Nested outline items |

`manifest.json` lists known day keys and is regenerated whenever days are saved or removed.

---

## Offline & PWA

- After a production visit, the service worker caches the app shell so the UI can load offline.
- **Notes still require** access to your chosen folder. Offline editing works once permission is granted and the handle is available.
- Returning later, Chrome may ask you to re-confirm folder access — use the gate screen or **Change folder**.

PWA install (optional): Chrome → install icon / “Install Outline” for a standalone window.

---

## Troubleshooting

| Problem | What to try |
|---------|-------------|
| **Open notes folder** does nothing | Use Chrome on desktop; ensure `localhost` or HTTPS |
| Stuck on permission screen | Click the prompt; check the site isn’t blocked from file access |
| Changes not on disk | Watch for error toasts; confirm the folder still exists and is writable |
| Old day missing from sidebar | Empty days are deleted; check `backups/` if you need a prior snapshot |
| Links / shortcuts feel wrong | Open **Keyboard shortcuts** (`?`) for the current platform bindings |
| Offline shell but no notes | Re-grant folder permission after reconnecting |

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

Notable source areas:

| Path | Role |
|------|------|
| `src/editor/` | Lexical editor, outline nodes, plugins |
| `src/storage/` | Folder I/O, saves, backups, settings.json, change log |
| `src/settings/` | Preferences model + Local Font Access |
| `src/sidebar/` | Day / project / task navigation |
| `src/utils/export.ts` | Export serializers (JSON, YAML, Markdown, text, HTML) |
| `src/types.ts` | Shared document types |

---

## Deploy (GitHub Pages)

CI builds and deploys on pushes to `main` and on version tags (`v*`):

- Workflow: [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
- Site: https://martinshaw.github.io/outline/

Enable **Settings → Pages → GitHub Actions** as the source after the first successful workflow run.

---

## License

MIT — see repository settings / add a `LICENSE` file if desired.
