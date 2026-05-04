// SPDX-License-Identifier: GPL-2.0-or-later
//
// Zeus — OpenHPSDR Protocol-1 / Protocol-2 client.
// Copyright (C) 2025-2026 Brian Keating (EI6LF),
//                         Douglas J. Cerrato (KB2UKA), and contributors.
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the
// Free Software Foundation, either version 2 of the License, or (at your
// option) any later version. See the LICENSE file at the root of this
// repository for the full text, or https://www.gnu.org/licenses/.

import { useConnectionStore } from '../state/connection-store';
import { useRadioStore } from '../state/radio-store';
import { QrzStatusPill } from './QrzStatusPill';
import { RotatorStatusPill } from './RotatorStatusPill';
import { BOARD_LABELS } from '../api/radio';
import { bandOf } from './design/data';

export function StatusBar() {
  const status = useConnectionStore((s) => s.status);
  const vfoHz = useConnectionStore((s) => s.vfoHz);
  const mode = useConnectionStore((s) => s.mode);
  const connected = status === 'Connected';
  const radioConnected = useRadioStore((s) => s.selection.connected);

  const brandSub = radioConnected !== 'Unknown'
    ? BOARD_LABELS[radioConnected].toUpperCase()
    : 'NOT CONNECTED';

  const bandLabel = bandOf(vfoHz);
  const freqMhz = (vfoHz / 1e6).toFixed(3);

  return (
    <div className="status-bar">
      <div className="status-bar-left">
        <div className="chip">
          <span className="k">RADIO</span>
          <span className="v">{brandSub}</span>
        </div>
        <div className="chip">
          <span className="k">FREQ</span>
          <span className="v mono">{freqMhz} MHz</span>
        </div>
        <div className="chip">
          <span className="k">MODE</span>
          <span className="v">{mode}</span>
        </div>
        <div className="chip">
          <span className="k">BAND</span>
          <span className="v">{bandLabel}</span>
        </div>
      </div>
      <div className="status-bar-right">
        <RotatorStatusPill />
        <QrzStatusPill />
        <div className={`chip ${connected ? '' : 'tx'}`}>
          <span className="k">LINK</span>
          <span className="v">{connected ? 'UP' : 'DOWN'}</span>
        </div>
      </div>
    </div>
  );
}
