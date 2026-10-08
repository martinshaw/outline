import { useEffect, useState } from 'react';
import {
  applyPwaUpdateWhenReady,
  checkPwaUpdate,
  dismissPwaUpdateBanner,
  isPwaUpdateApplying,
  isPwaUpdateBannerVisible,
  isPwaUpdateWaitingForCalm,
  subscribePwaUpdate,
} from '../pwa/updateStore';

export function UpdateBanner() {
  const [visible, setVisible] = useState(() => isPwaUpdateBannerVisible());
  const [applying, setApplying] = useState(() => isPwaUpdateApplying());
  const [waitingCalm, setWaitingCalm] = useState(() =>
    isPwaUpdateWaitingForCalm(),
  );

  useEffect(() => {
    return subscribePwaUpdate(() => {
      setVisible(isPwaUpdateBannerVisible());
      setApplying(isPwaUpdateApplying());
      setWaitingCalm(isPwaUpdateWaitingForCalm());
    });
  }, []);

  // Long-lived tabs: re-check when the window is focused again.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkPwaUpdate();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="update-banner" role="status">
      <p className="update-banner__message">
        {applying
          ? 'Updating Outline…'
          : waitingCalm
            ? 'A new version is available — reloading when you are idle.'
            : 'A new version of Outline is available.'}
      </p>
      <div className="update-banner__actions">
        <button
          type="button"
          className="btn btn--primary btn--sm"
          disabled={applying}
          onClick={() => {
            void applyPwaUpdateWhenReady();
          }}
        >
          {applying ? 'Updating…' : 'Reload now'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          disabled={applying}
          onClick={() => dismissPwaUpdateBanner()}
        >
          Later
        </button>
      </div>
    </div>
  );
}
