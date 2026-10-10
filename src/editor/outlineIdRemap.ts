/**
 * Clipboard paste goes through OutlineItemNode.importJSON. While this counter
 * is > 0, importJSON mints fresh ids so pasted trees don't share identity with
 * the source (status chips, selection, meta).
 *
 * Must NOT stay on during normal editor updates — Lexical may call importJSON
 * for other reasons, and load-from-disk uses $loadDayDocument (not importJSON).
 */
let pasteIdRemapDepth = 0;

export function beginPasteIdRemap(): void {
  pasteIdRemapDepth += 1;
}

export function endPasteIdRemap(): void {
  pasteIdRemapDepth = Math.max(0, pasteIdRemapDepth - 1);
}

export function shouldRemapOutlineIdsOnImport(): boolean {
  return pasteIdRemapDepth > 0;
}
