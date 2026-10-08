type Props = {
  supportsFs: boolean;
  folderName: string | null;
  needsPermission: boolean;
  offline: boolean;
  busy: boolean;
  onOpenFolder: () => void;
  onGrantPermission: () => void;
};

export function FolderGate({
  supportsFs,
  folderName,
  needsPermission,
  offline,
  busy,
  onOpenFolder,
  onGrantPermission,
}: Props) {
  const insecureHost =
    typeof window !== 'undefined' &&
    !window.isSecureContext &&
    supportsFs === false;

  return (
    <div className="gate">
      <div className="gate__panel">
        <p className="gate__brand">Outline</p>
        <h1 className="gate__title">Your notes, on your disk</h1>
        <p className="gate__copy">
          Pick a folder. Daily outlines save there as JSON and work offline in
          Chrome — no server.
        </p>

        {!supportsFs && (
          <p className="gate__error">
            {insecureHost ||
            (typeof window !== 'undefined' && !window.isSecureContext) ? (
              <>
                This page is not a secure context, so Chrome blocks folder
                access. Open the app at{' '}
                <code>http://localhost:5173</code> (HTTPS is not required on
                localhost). Avoid using a LAN IP like{' '}
                <code>http://192.168.…</code>.
              </>
            ) : (
              <>
                This browser does not support the File System Access API. Use
                Google Chrome on desktop, or Chrome on Android with a recent
                version. Installable as a PWA, but folder access still requires
                a supporting Chromium browser.
              </>
            )}
          </p>
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
