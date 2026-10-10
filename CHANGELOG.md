# Changelog

Notes for each tagged release, drawn from merged pull-request summaries.

## 1.3.0 — 2026-10-10

- Empty-day get-started hints (local-first note, numbered tips, dismiss via × or 1 minute after typing starts); command palette **Show get started hints**
- Focus the first outline line when hints appear
- Shared SVG close icon across dialogs, settings remove buttons, and meta popover clears
- Keyboard navigation for the meta popover **Add entity type** menu
- Relicense to GPL-3.0-or-later
- Production Workbox minify; lazy-load dialogs/debug/confetti; faster Vitest (`vmThreads`)
- Search copy uses “item(s)” instead of “block(s)”; status select and close-button alignment fixes
- Tests for empty hints, command palette scoring, and focus-first-line

## 1.2.0 — 2026-10-10

- Theme system: keep light/dark/system; add High contrast, Neon, Miami Vice, Nord, Forest, Ocean, Sunset, Espresso, Terminal
- Theme picker exploration grid (search + live palette previews), matching the font picker
- Font picker: full-panel exploration grid instead of a small dropdown
- Confetti when every subtask under a task is done/archived; toggle in Appearance settings
- Tasks dialog: denser filters, larger dialog, Finder-style multi-select and bulk status updates
- Match Search, Settings, Command palette, and Shortcuts dialogs to the larger Tasks size
- Fix status chip dropdown (Lexical `editor.read` for DOM→node lookup); restore chip vertical alignment
- Export zip includes only attachments referenced by exported items
- Paste/outline id remap, format commands, select-all and empty-paragraph fixes; folder switch remounts editor

## 1.1.1 — 2026-10-10

- Add `CHANGELOG.md` seeded from merged release PR summaries
- Cursor rule: keep the changelog updated from PR descriptions on every version tag
- Track `.cursor/rules/` in git (still ignore other `.cursor/` paths)

## 1.1.0 — 2026-10-10

- File attachments (drag/drop/paste) with image size, caption, and fullscreen controls (#8)
- Second gutter click selects parent-only for moves; drop into former descendants supported (#8)
- Meta popover: add entity types on demand instead of listing every type upfront (#8)
- Vitest suite for outline ops, serialize, selection, export, and task index (#8)
- Gutter plus cursor and grab cursor on drag handles (#8)

## 1.0.0 — 2026-10-09

- Bump to 1.0.0 (#7)
- Tasks/subtasks with status chips, deadlines, and workspace entities (`entities.json`) (#7)
- Filterable Manage tasks dialog across notes (`⌘⌥T`) (#7)
- Full-text Search notes with inverted index (`⌘⌥F`) (#7)
- Meta attributes editing (`⌘⌥A`), settings via `⌘⌥,`, and top-right keymap hints (#7)

## 0.8.1 — 2026-10-08

- ⌘P command palette for workspace actions, exports, and developer panel toggle (replaces top menu) (#6)
- Calm PWA update banner with idle auto-reload (#6)
- Fix palette keyboard navigation: correct Enter target, scroll only on ↑/↓, keep active rows fully in view (#6)

## 0.8.0 — 2026-10-08

- Hierarchical block selection with high-contrast drag handles (click anywhere to clear) (#5)
- Format shortcuts fixed; selection chrome, full-width editor, and layout polish (#5)
- Mobile/PWA UX from 0.7.x follow-ups; performance tweaks for selection paint (#5)

## 0.7.0 — 2026-10-08

- Developer panel: Overview / Nodes / Files explorers (gated on developer mode) (#4)
- Shared button chrome; setup gate pattern + GitHub link (#4)
- Editor layout fixes (empty caret, nest indent, kind/chip alignment) (#4)
- Settings UX: keep section on change; dialog contrast; README updates (#4)

## 0.6.0 — 2026-10-08

- Status chips on projects/tasks, markdown `#`–`######` headings, and empty-item click/caret fixes (#3)
- Optional developer panel (Settings → Developer) with gated logging; last-folder restore improvements (#3)
- Performance: rAF-throttled serialize, skip full workspace reload on save, leaner React updates (#3)

## 0.5.0 — 2026-10-08

- Local-first Lexical outliner with daily notes, projects/tasks, block selection, and LogSeq-style moves (#1)
- YAML export; settings persisted as `settings.json` in the workspace folder (#1)
- Searchable system fonts via Local Font Access; GitHub Pages deploy workflow (#1)
