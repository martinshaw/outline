import { useEffect } from 'react';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { $getRoot } from 'lexical';
import {
  ATTACHMENT_DISPLAY_SIZES,
  getCachedAttachmentUrl,
  normalizeDisplaySize,
  type AttachmentDisplaySize,
  type AttachmentMeta,
} from '../../storage/attachments';
import { notesClient } from '../../storage/notesClient';
import {
  $isOutlineItemNode,
  type OutlineItemNode,
} from '../nodes/OutlineItemNode';

const MENU_CLASS = 'outline-attachment-menu';
const LIGHTBOX_CLASS = 'outline-attachment-lightbox';

function closeMenus(): void {
  document.querySelectorAll(`.${MENU_CLASS}`).forEach((el) => el.remove());
  document
    .querySelectorAll('.outline-attachment__menu-btn[aria-expanded="true"]')
    .forEach((el) => el.setAttribute('aria-expanded', 'false'));
}

function closeLightbox(): void {
  document.querySelectorAll(`.${LIGHTBOX_CLASS}`).forEach((el) => el.remove());
}

function $findAttachmentItem(outlineId: string): OutlineItemNode | null {
  const walk = (node: OutlineItemNode): OutlineItemNode | null => {
    if (node.getId() === outlineId) return node;
    for (const child of node.getChildren()) {
      if (!$isOutlineItemNode(child)) continue;
      const found = walk(child);
      if (found) return found;
    }
    return null;
  };
  for (const child of $getRoot().getChildren()) {
    if (!$isOutlineItemNode(child)) continue;
    const found = walk(child);
    if (found) return found;
  }
  return null;
}

async function openLightbox(path: string, name: string): Promise<void> {
  closeLightbox();
  closeMenus();
  let url = getCachedAttachmentUrl(path) ?? null;
  if (!url) url = await notesClient.getAttachmentObjectUrl(path);
  if (!url) return;

  const overlay = document.createElement('div');
  overlay.className = LIGHTBOX_CLASS;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', name);

  const img = document.createElement('img');
  img.className = `${LIGHTBOX_CLASS}__image`;
  img.src = url;
  img.alt = name;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = `${LIGHTBOX_CLASS}__close`;
  closeBtn.setAttribute('aria-label', 'Close');
  closeBtn.textContent = '×';

  const caption = document.createElement('p');
  caption.className = `${LIGHTBOX_CLASS}__caption`;
  caption.textContent = name;

  overlay.append(closeBtn, img, caption);
  document.body.appendChild(overlay);
  closeBtn.focus();

  const dismiss = () => {
    overlay.removeEventListener('click', onOverlayClick);
    closeBtn.removeEventListener('click', dismiss);
    window.removeEventListener('keydown', onKey, true);
    closeLightbox();
  };
  const onOverlayClick = (event: MouseEvent) => {
    if (event.target === overlay || event.target === closeBtn) dismiss();
  };
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dismiss();
    }
  };
  overlay.addEventListener('click', onOverlayClick);
  closeBtn.addEventListener('click', dismiss);
  window.addEventListener('keydown', onKey, true);
}

/**
 * Image attachment controls: size menu, add caption, click-to-fullscreen.
 */
export function AttachmentImagePlugin(): null {
  const [editor] = useLexicalComposerContext();

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      if (
        target.closest('.outline-attachment__menu-btn') ||
        target.closest(`.${MENU_CLASS}`) ||
        target.closest(`.${LIGHTBOX_CLASS}`)
      ) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }

      if (
        !target.closest(`.${MENU_CLASS}`) &&
        !target.closest('.outline-attachment__menu-btn')
      ) {
        closeMenus();
      }
    };

    const focusCaption = (outlineId: string) => {
      editor.focus();
      editor.update(() => {
        const item = $findAttachmentItem(outlineId);
        if (!item) return;
        item.selectEnd();
      });
    };

    const setDisplaySize = (
      outlineId: string,
      displaySize: AttachmentDisplaySize,
    ) => {
      editor.update(() => {
        const item = $findAttachmentItem(outlineId);
        if (!item) return;
        const att = item.getAttachment();
        if (!att) return;
        const next: AttachmentMeta = { ...att, displaySize };
        item.setAttachment(next);
      });
    };

    const openMenu = (btn: HTMLButtonElement, outlineId: string) => {
      const wasOpen = btn.getAttribute('aria-expanded') === 'true';
      closeMenus();
      if (wasOpen) return;

      let currentSize: AttachmentDisplaySize = 'medium';
      editor.getEditorState().read(() => {
        const item = $findAttachmentItem(outlineId);
        const att = item?.getAttachment();
        if (att) currentSize = normalizeDisplaySize(att.displaySize);
      });

      const menu = document.createElement('div');
      menu.className = MENU_CLASS;
      menu.setAttribute('role', 'menu');

      const sizeLabel = document.createElement('div');
      sizeLabel.className = `${MENU_CLASS}__label`;
      sizeLabel.textContent = 'Size';
      menu.appendChild(sizeLabel);

      for (const size of ATTACHMENT_DISPLAY_SIZES) {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = `${MENU_CLASS}__option`;
        if (size.id === currentSize) {
          option.classList.add(`${MENU_CLASS}__option--active`);
        }
        option.setAttribute('role', 'menuitemradio');
        option.setAttribute(
          'aria-checked',
          size.id === currentSize ? 'true' : 'false',
        );
        option.dataset.action = 'size';
        option.dataset.size = size.id;
        option.dataset.outlineId = outlineId;
        option.textContent = size.label;
        menu.appendChild(option);
      }

      const divider = document.createElement('div');
      divider.className = `${MENU_CLASS}__divider`;
      menu.appendChild(divider);

      const captionBtn = document.createElement('button');
      captionBtn.type = 'button';
      captionBtn.className = `${MENU_CLASS}__option`;
      captionBtn.setAttribute('role', 'menuitem');
      captionBtn.dataset.action = 'caption';
      captionBtn.dataset.outlineId = outlineId;
      captionBtn.textContent = 'Add caption';
      menu.appendChild(captionBtn);

      const fullBtn = document.createElement('button');
      fullBtn.type = 'button';
      fullBtn.className = `${MENU_CLASS}__option`;
      fullBtn.setAttribute('role', 'menuitem');
      fullBtn.dataset.action = 'fullscreen';
      fullBtn.dataset.outlineId = outlineId;
      fullBtn.textContent = 'View full screen';
      menu.appendChild(fullBtn);

      document.body.appendChild(menu);
      btn.setAttribute('aria-expanded', 'true');

      const rect = btn.getBoundingClientRect();
      const menuRect = menu.getBoundingClientRect();
      let top = rect.bottom + 4;
      let left = rect.right - menuRect.width;
      if (left < 8) left = 8;
      if (top + menuRect.height > window.innerHeight - 8) {
        top = Math.max(8, rect.top - menuRect.height - 4);
      }
      menu.style.top = `${top}px`;
      menu.style.left = `${left}px`;
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const option = target.closest<HTMLButtonElement>(
        `.${MENU_CLASS}__option`,
      );
      if (option) {
        event.preventDefault();
        event.stopPropagation();
        const outlineId = option.dataset.outlineId;
        const action = option.dataset.action;
        if (!outlineId || !action) return;

        if (action === 'size' && option.dataset.size) {
          setDisplaySize(
            outlineId,
            normalizeDisplaySize(option.dataset.size),
          );
          closeMenus();
          return;
        }
        if (action === 'caption') {
          closeMenus();
          focusCaption(outlineId);
          return;
        }
        if (action === 'fullscreen') {
          let path = '';
          let name = '';
          editor.getEditorState().read(() => {
            const att = $findAttachmentItem(outlineId)?.getAttachment();
            if (att) {
              path = att.path;
              name = att.name;
            }
          });
          closeMenus();
          if (path) void openLightbox(path, name);
          return;
        }
        return;
      }

      const menuBtn = target.closest<HTMLButtonElement>(
        '.outline-attachment__menu-btn',
      );
      const root = editor.getRootElement();
      if (menuBtn && root?.contains(menuBtn)) {
        event.preventDefault();
        event.stopPropagation();
        const itemEl = menuBtn.closest<HTMLElement>('.outline-item');
        const outlineId = itemEl?.getAttribute('data-outline-id');
        if (!outlineId) return;
        openMenu(menuBtn, outlineId);
        return;
      }

      const img = target.closest<HTMLImageElement>(
        '.outline-attachment__image',
      );
      if (img && root?.contains(img)) {
        event.preventDefault();
        event.stopPropagation();
        const wrap = img.closest<HTMLElement>('.outline-attachment');
        const path = wrap?.dataset.path;
        const name = wrap?.dataset.name ?? img.alt ?? 'Image';
        if (path) void openLightbox(path, name);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector(`.${LIGHTBOX_CLASS}`)) return;
      if (document.querySelector(`.${MENU_CLASS}`)) {
        event.preventDefault();
        closeMenus();
      }
    };

    document.addEventListener('mousedown', onMouseDown, true);
    document.addEventListener('click', onClick, true);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('mousedown', onMouseDown, true);
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('keydown', onKeyDown, true);
      closeMenus();
      closeLightbox();
    };
  }, [editor]);

  return null;
}
