// SPDX-License-Identifier: GPL-2.0-or-later
//
// Zeus — OpenHPSDR Protocol-1 / Protocol-2 client.
// Copyright (C) 2025-2026 Brian Keating (EI6LF) and contributors.
//
// PureSignal master arm. Split-button:
//  • Main "PS"  — toggles psEnabled (blue accent when on).
//  • Caret "^"  — opens the PsAnimationPopover (live DPD monitor).
// Optimistic update with rollback on server refusal — same pattern as
// MoxButton. Disabled until a P2 radio is connected: Protocol-1
// PureSignal is deferred until Protocol1Client gains the SetPuresignal
// hooks.

import { useCallback, useState } from 'react';
import { setPs } from '../api/client';
import { useConnectionStore } from '../state/connection-store';
import { useTxStore } from '../state/tx-store';
import { PsAnimationPopover } from './PsAnimationPopover';

export function PsToggleButton() {
  const connected = useConnectionStore((s) => s.status === 'Connected');
  const protocol = useConnectionStore((s) => s.connectedProtocol);
  const psEnabled = useTxStore((s) => s.psEnabled);
  const psAuto = useTxStore((s) => s.psAuto);
  const psSingle = useTxStore((s) => s.psSingle);
  const setPsEnabled = useTxStore((s) => s.setPsEnabled);

  const [popoverOpen, setPopoverOpen] = useState(false);

  const p1Disabled = protocol === 'P1';
  const disabled = !connected || p1Disabled;
  const tooltip = p1Disabled
    ? 'PureSignal for Hermes coming in a follow-up'
    : psEnabled
      ? 'PureSignal armed — predistortion active'
      : 'Arm PureSignal predistortion';

  const click = useCallback(() => {
    if (disabled) return;
    const next = !psEnabled;
    setPsEnabled(next);
    setPs({ enabled: next, auto: psAuto, single: psSingle }).catch(() => {
      setPsEnabled(!next);
    });
  }, [disabled, psEnabled, psAuto, psSingle, setPsEnabled]);

  return (
    <>
      <span className="ps-toggle-group">
        <button
          type="button"
          disabled={disabled}
          onClick={click}
          className={`btn tx-btn accent${psEnabled ? ' is-on' : ''}`}
          title={tooltip}
        >
          <span
            className={`led accent${psEnabled ? ' on' : ''}`}
            style={{ marginRight: 8 }}
          />
          PS
        </button>
        <button
          type="button"
          onClick={() => setPopoverOpen(true)}
          className={`btn tx-btn accent${psEnabled ? ' is-on' : ''}`}
          aria-label="Open PureSignal monitor"
          title="Open PureSignal monitor"
        >
          ^
        </button>
      </span>
      {popoverOpen ? (
        <PsAnimationPopover onClose={() => setPopoverOpen(false)} />
      ) : null}
    </>
  );
}
