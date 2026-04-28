// SPDX-License-Identifier: GPL-2.0-or-later
//
// Flex-layout wrapper for the PureSignal "live" widget. The configuration
// (calibration mode, timing, hardware, two-tone tuning) lives in the
// Settings menu (PsSettingsPanel) — this panel is the at-a-glance
// monitor: lock state, signal flow, feedback spectrum, key metrics.

import { PsAnimationPanel } from '../../components/PsAnimationPanel';

export function PsAnimationFlexPanel() {
  return (
    <div style={{ flex: 1, height: '100%', overflow: 'auto' }}>
      <PsAnimationPanel />
    </div>
  );
}
