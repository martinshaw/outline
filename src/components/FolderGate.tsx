import type { ReactNode } from 'react';

type Props = {
  supportsFs: boolean;
  folderName: string | null;
  needsPermission: boolean;
  offline: boolean;
  busy: boolean;
  onOpenFolder: () => void;
  onGrantPermission: () => void;
};

type BrowserKind =
  | 'firefox'
  | 'safari'
  | 'chromium'
  | 'embedded'
  | 'unknown';

function detectBrowserKind(): BrowserKind {
  if (typeof navigator === 'undefined') return 'unknown';
  const ua = navigator.userAgent;
  // Embedded / IDE previews often lack a real Chromium FS Access surface.
  if (/Cursor|VSCode|Electron/i.test(ua) && !('showDirectoryPicker' in window)) {
    return 'embedded';
  }
  if (/Firefox\//i.test(ua)) return 'firefox';
  // Safari (and iOS Chrome UIWebView) — exclude Chromium Edge/Chrome.
  if (/Safari\//i.test(ua) && !/Chrome\//i.test(ua) && !/Chromium\//i.test(ua)) {
    return 'safari';
  }
  if (/Chrome\//i.test(ua) || /Chromium\//i.test(ua) || /Edg\//i.test(ua)) {
    return 'chromium';
  }
  return 'unknown';
}

function browserNoticeCopy(
  kind: BrowserKind,
  insecure: boolean,
): { title: string; body: ReactNode } {
  if (insecure) {
    return {
      title: 'Secure context required',
      body: (
        <>
          Folder access only works on <code>http://localhost</code> or{' '}
          <code>https://</code>. Open the app at{' '}
          <code>http://localhost:5173</code> — not a LAN IP like{' '}
          <code>http://192.168.…</code>.
        </>
      ),
    };
  }

  const chromiumList = (
    <>
      <strong>Google Chrome</strong>, <strong>Helium</strong>, Microsoft Edge,
      Brave, Arc, or another up-to-date Chromium browser
    </>
  );

  if (kind === 'firefox') {
    return {
      title: 'Firefox is not supported',
      body: (
        <>
          Outline needs the File System Access API to save notes in a folder on
          your disk. That API is not available in Firefox. Please use{' '}
          {chromiumList}.
        </>
      ),
    };
  }

  if (kind === 'safari') {
    return {
      title: 'Safari is not supported',
      body: (
        <>
          Outline needs the File System Access API to save notes in a folder on
          your disk. That API is not available in Safari (including iOS). Please
          use {chromiumList} on desktop, or Chrome on Android.
        </>
      ),
    };
  }

  if (kind === 'embedded') {
    return {
      title: 'Open in a real browser',
      body: (
        <>
          This embedded preview cannot access local folders. Open the app in{' '}
          {chromiumList} instead (for example <code>http://localhost:5173</code>
          ).
        </>
      ),
    };
  }

  if (kind === 'chromium') {
    return {
      title: 'Chromium folder access unavailable',
      body: (
        <>
          This Chromium build does not expose the File System Access API (it may
          be too old, restricted, or running in an unsupported context). Outline
          needs a recent <strong>Chrome</strong>, <strong>Helium</strong>, Edge,
          or similar Chromium browser with folder access enabled.
        </>
      ),
    };
  }

  return {
    title: 'Unsupported browser',
    body: (
      <>
        Outline needs the File System Access API to read and write your notes
        folder. Please use {chromiumList}. Firefox and Safari are not supported.
      </>
    ),
  };
}

export function FolderGate({
  supportsFs,
  folderName,
  needsPermission,
  offline,
  busy,
  onOpenFolder,
  onGrantPermission,
}: Props) {
  const insecure =
    typeof window !== 'undefined' && !window.isSecureContext;
  const showBrowserNotice = !supportsFs;
  const notice = showBrowserNotice
    ? browserNoticeCopy(detectBrowserKind(), insecure)
    : null;

  return (
    <div className="gate">
      <div className="gate__panel">
        <p className="gate__brand">Outline</p>
        <h1 className="gate__title">Your notes, on your disk</h1>
        <p className="gate__copy">
          Pick a folder. Daily outlines save there as JSON and work offline in
          Chrome — no server.
        </p>

        {notice && (
          <div className="gate__notice" role="status">
            <p className="gate__notice-title">{notice.title}</p>
            <p className="gate__notice-body">{notice.body}</p>
          </div>
        )}

        {offline && (
          <p className="gate__hint">
            You are offline. Folder access still works once granted.
          </p>
        )}

        {needsPermission && folderName ? (
          <>
            <p className="gate__hint">
              Chrome remembered folder <strong>{folderName}</strong>. Allow
              access to continue — choose “Allow on every visit” to skip this
              next time.
            </p>
            <button
              type="button"
              className="btn btn--primary btn--lg btn--block"
              onClick={onGrantPermission}
              disabled={busy}
            >
              {busy ? 'Opening…' : `Allow access to “${folderName}”`}
            </button>
            <button
              type="button"
              className="btn btn--secondary btn--lg btn--block"
              onClick={onOpenFolder}
              disabled={!supportsFs || busy}
            >
              Choose a different folder
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn--primary btn--lg btn--block"
            onClick={onOpenFolder}
            disabled={!supportsFs || busy}
          >
            {busy
              ? 'Opening…'
              : folderName
                ? 'Change notes folder'
                : 'Open notes folder'}
          </button>
        )}

        <a
          className="gate__github"
          href="https://github.com/martinshaw/outline"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>
    </div>
  );
}
