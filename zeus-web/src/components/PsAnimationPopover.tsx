// SPDX-License-Identifier: GPL-2.0-or-later
//
// Centred-modal popover that hosts PsAnimationPanel. Triggered from the
// caret half of the PS toggle button; closes on backdrop click or Esc.

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PsAnimationPanel } from './PsAnimationPanel';

export function PsAnimationPopover({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return createPortal(
    <div
      className="psanim-popover-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="PureSignal monitor"
    >
      <div className="psanim-popover" style={{ position: 'relative' }}>
        <button
          type="button"
          className="psanim-popover__close"
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
        >
          ×
        </button>
        <PsAnimationPanel />
      </div>
    </div>,
    document.body,
  );
}
