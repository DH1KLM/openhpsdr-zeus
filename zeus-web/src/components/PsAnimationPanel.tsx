// SPDX-License-Identifier: GPL-2.0-or-later
//
// Zeus — OpenHPSDR Protocol-1 / Protocol-2 client.
// Copyright (C) 2025-2026 Brian Keating (EI6LF) and contributors.
//
// PureSignal "live" widget — uses Zeus's standard panel chrome
// (.panel / .panel-head / .panel-body / .btn / .chip / .dot) so it
// matches the rest of the surface. Two nested sub-panels (signal flow
// + feedback spectrum) and a four-up metric row in the footer.
//
// Data sources today:
//  • LOCKED         — txStore.psCorrecting (calcc info[14]==1).
//  • DPD ON         — txStore.psEnabled (master arm; SetPSRunCal path).
//  • 2-TONE / VOICE — txStore.twoToneOn (TXA PostGen). VOICE = !twoTone.
//  • OUTPUT         — txStore.fwdWatts → dBm.
//  • ACPR / Gain Err / Phase Err — not exposed by WDSP as scalars; shown
//    as "—" until we synthesise them from GetPSDisp poly coefficients
//    (cm/cs/cc) and the feedback FFT respectively.

import { useCallback, useMemo } from 'react';
import { setPs, setTwoTone } from '../api/client';
import { useConnectionStore } from '../state/connection-store';
import { useTxStore } from '../state/tx-store';

const PANA_W = 560;
const PANA_H = 200;
const PANA_PAD_L = 28;
const PANA_PAD_R = 38;
const PANA_PAD_T = 14;
const PANA_PAD_B = 22;

export function PsAnimationPanel() {
  const protocol = useConnectionStore((s) => s.connectedProtocol);
  const connected = useConnectionStore((s) => s.status === 'Connected');
  const p1Disabled = protocol === 'P1';

  const psEnabled = useTxStore((s) => s.psEnabled);
  const psAuto = useTxStore((s) => s.psAuto);
  const psSingle = useTxStore((s) => s.psSingle);
  const psCorrecting = useTxStore((s) => s.psCorrecting);
  const setPsEnabledLocal = useTxStore((s) => s.setPsEnabled);

  const twoToneOn = useTxStore((s) => s.twoToneOn);
  const twoToneFreq1 = useTxStore((s) => s.twoToneFreq1);
  const twoToneFreq2 = useTxStore((s) => s.twoToneFreq2);
  const twoToneMag = useTxStore((s) => s.twoToneMag);
  const setTwoToneOnLocal = useTxStore((s) => s.setTwoToneOn);

  const fwdWatts = useTxStore((s) => s.fwdWatts);
  const moxOn = useTxStore((s) => s.moxOn);

  const dpdDisabled = !connected || p1Disabled;

  // ---- Mode buttons ----
  const onTwoTone = useCallback(() => {
    if (!connected) return;
    const next = !twoToneOn;
    setTwoToneOnLocal(next);
    setTwoTone({
      enabled: next,
      freq1: twoToneFreq1,
      freq2: twoToneFreq2,
      mag: twoToneMag,
    }).catch(() => setTwoToneOnLocal(!next));
  }, [
    connected,
    twoToneOn,
    twoToneFreq1,
    twoToneFreq2,
    twoToneMag,
    setTwoToneOnLocal,
  ]);

  const onVoice = useCallback(() => {
    if (!connected || !twoToneOn) return;
    setTwoToneOnLocal(false);
    setTwoTone({
      enabled: false,
      freq1: twoToneFreq1,
      freq2: twoToneFreq2,
      mag: twoToneMag,
    }).catch(() => setTwoToneOnLocal(true));
  }, [
    connected,
    twoToneOn,
    twoToneFreq1,
    twoToneFreq2,
    twoToneMag,
    setTwoToneOnLocal,
  ]);

  const onDpd = useCallback(() => {
    if (dpdDisabled) return;
    const next = !psEnabled;
    setPsEnabledLocal(next);
    setPs({ enabled: next, auto: psAuto, single: psSingle }).catch(() =>
      setPsEnabledLocal(!next),
    );
  }, [dpdDisabled, psEnabled, psAuto, psSingle, setPsEnabledLocal]);

  // ---- Metrics ----
  const outputLabel = useMemo(() => {
    if (!moxOn || fwdWatts <= 0.001) return null;
    const dbm = 10 * Math.log10(fwdWatts * 1000);
    return `${dbm >= 0 ? '+' : ''}${dbm.toFixed(1)} dBm`;
  }, [moxOn, fwdWatts]);

  const tracePath = useMemo(
    () => buildPanaPath(twoToneOn, moxOn && psEnabled),
    [twoToneOn, moxOn, psEnabled],
  );

  const lockState = psCorrecting ? 'LOCKED' : psEnabled ? 'ARMED' : 'IDLE';
  const lockTitle = psCorrecting
    ? 'Loop locked — predistortion converged'
    : psEnabled
      ? 'Armed — waiting for convergence'
      : 'Not armed';

  return (
    <div className="psanim-root panel">
      {/* Outer panel head — same chrome as every other Zeus panel */}
      <div className="panel-head">
        <span className={`dot ${psCorrecting ? 'on' : moxOn ? 'tx' : ''}`} />
        <span className="title">PureSignal DPD</span>
        <span className="spacer" style={{ flex: 1 }} />
        <span
          className={`chip mono psanim-locked-chip${psCorrecting ? ' is-locked' : ''}`}
          title={lockTitle}
        >
          <span className="k">PS</span>
          <span className="v">{lockState}</span>
        </span>
        <span className="psanim-mode-row">
          <button
            type="button"
            className={`btn sm${twoToneOn ? ' active' : ''}`}
            onClick={onTwoTone}
            disabled={!connected}
            title="Two-tone test signal — standard PS calibration excitation"
          >
            2-TONE
          </button>
          <button
            type="button"
            className={`btn sm${!twoToneOn ? ' active' : ''}`}
            onClick={onVoice}
            disabled={!connected}
            title="Voice / mic input (disarms the two-tone generator)"
          >
            VOICE
          </button>
          <button
            type="button"
            className={`btn sm${psEnabled ? ' active' : ''}`}
            onClick={onDpd}
            disabled={dpdDisabled}
            title={
              p1Disabled
                ? 'PureSignal for Hermes coming in a follow-up'
                : psEnabled
                  ? 'PureSignal armed — disarm'
                  : 'Arm PureSignal predistortion'
            }
          >
            {psEnabled ? 'DPD ON' : 'DPD OFF'}
          </button>
        </span>
      </div>

      <div className="panel-body">
        {/* Signal flow */}
        <div className="panel psanim-sub">
          <div className="panel-head">
            <span className="title">Signal flow</span>
            <span className="hint">
              TX → PA → COUPLER → RX → CORRECTION
            </span>
          </div>
          <div className="panel-body">
            <SignalFlow dpdActive={psEnabled} fitActive={psCorrecting} />
          </div>
        </div>

        {/* Mini panadapter */}
        <div className="panel psanim-sub">
          <div className="panel-head">
            <span className="title">Panadapter — feedback</span>
            <span className="hint">SPAN 8 kHz · RBW 36 Hz</span>
          </div>
          <div className="panel-body" style={{ padding: 6 }}>
            <div className="psanim-pana">
              <svg
                className="psanim-pana__svg"
                viewBox={`0 0 ${PANA_W} ${PANA_H}`}
                preserveAspectRatio="none"
                role="img"
                aria-label="PureSignal feedback spectrum"
              >
                <PanaGrid />
                <path className="psanim-pana__ref" d={tracePath.refPath} />
                <path className="psanim-pana__fill" d={tracePath.fillPath} />
                <path className="psanim-pana__trace" d={tracePath.tracePath} />
              </svg>
            </div>
          </div>
        </div>

        {/* Metrics row */}
        <div className="psanim-metrics">
          <Metric label="OUTPUT" value={outputLabel ?? '—'} empty={!outputLabel} />
          <Metric
            label="ACPR"
            value="—"
            empty
            hint="Adjacent Channel Power Ratio — derived from the feedback FFT (not yet wired)"
          />
          <Metric
            label="GAIN ERR"
            value="—"
            empty
            hint="Residual gain error — derived from GetPSDisp polynomial coefficients (not yet wired)"
          />
          <Metric
            label="PHASE ERR"
            value="—"
            empty
            hint="Residual phase error — derived from GetPSDisp sin/cos polynomial (not yet wired)"
          />
        </div>

        <div className="psanim-foot">
          PureSignal · Adaptive baseband pre-distortion
        </div>
      </div>
    </div>
  );
}

// ---------- Signal flow diagram ----------

function SignalFlow({
  dpdActive,
  fitActive,
}: {
  dpdActive: boolean;
  fitActive: boolean;
}) {
  // Coordinate system tuned so the five top boxes line up on a fixed grid
  // and the feedback row drops cleanly under DPD + COUPLER.
  const W = 600;
  const H = 200;
  const topY = 30;
  const botY = 130;
  const boxH = 44;
  const cx = [60, 165, 270, 375, 500] as const;
  const widths = [80, 90, 80, 96, 96] as const;

  const center = (i: number) => cx[i] as number;
  const right = (i: number) => (cx[i] as number) + (widths[i] as number) / 2;
  const left = (i: number) => (cx[i] as number) - (widths[i] as number) / 2;
  const midY = (y: number) => y + boxH / 2;

  const fitX = cx[1];
  const rxX = cx[3];
  const fitW = 80;
  const rxW = 80;

  return (
    <svg
      className="psanim-flow"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMin meet"
    >
      {/* Top-row links: TX → DPD → PA → COUPLER → ANTENNA */}
      {[0, 1, 2, 3].map((i) => {
        const linkActive = dpdActive && (i === 0 || i === 1);
        return (
          <g key={`top-link-${i}`}>
            <line
              className={`psanim-flow-link${linkActive ? ' psanim-flow-link--active' : ''}`}
              x1={right(i)}
              y1={midY(topY)}
              x2={left(i + 1)}
              y2={midY(topY)}
            />
            <circle
              className={`psanim-flow-dot${linkActive ? ' psanim-flow-dot--active' : ''}`}
              cx={(right(i) + left(i + 1)) / 2}
              cy={midY(topY)}
              r={2.2}
            />
          </g>
        );
      })}

      <FlowNode x={cx[0]} y={topY} w={widths[0]} h={boxH} title="TX" sub="baseband" />
      <FlowNode
        x={cx[1]}
        y={topY}
        w={widths[1]}
        h={boxH}
        title="DPD"
        sub="pre-distort"
        active={dpdActive}
      />
      <FlowNode x={cx[2]} y={topY} w={widths[2]} h={boxH} title="PA" sub="amplifier" />
      <FlowNode
        x={cx[3]}
        y={topY}
        w={widths[3]}
        h={boxH}
        title="COUPLER"
        sub="-40 dB"
      />
      <FlowNode
        x={cx[4]}
        y={topY}
        w={widths[4]}
        h={boxH}
        title="ANTENNA"
        sub="on air"
      />

      <FlowNode
        x={fitX}
        y={botY}
        w={fitW}
        h={boxH}
        title="FIT"
        sub="mem-poly"
        active={fitActive}
      />
      <FlowNode x={rxX} y={botY} w={rxW} h={boxH} title="RX" sub="feedback" />

      {/* COUPLER ↓ RX, FIT ↑ DPD */}
      <line
        className={`psanim-flow-link psanim-flow-link--dashed${fitActive ? ' psanim-flow-link--active' : ''}`}
        x1={center(3)}
        y1={topY + boxH}
        x2={center(3)}
        y2={botY}
      />
      <line
        className={`psanim-flow-link psanim-flow-link--dashed${fitActive ? ' psanim-flow-link--active' : ''}`}
        x1={fitX}
        y1={botY}
        x2={fitX}
        y2={topY + boxH}
      />
      {/* RX → FIT */}
      <line
        className={`psanim-flow-link psanim-flow-link--dashed${fitActive ? ' psanim-flow-link--active' : ''}`}
        x1={rxX - rxW / 2}
        y1={midY(botY)}
        x2={fitX + fitW / 2}
        y2={midY(botY)}
      />
      <circle
        className={`psanim-flow-dot${fitActive ? ' psanim-flow-dot--active' : ''}`}
        cx={(rxX - rxW / 2 + fitX + fitW / 2) / 2}
        cy={midY(botY)}
        r={2.2}
      />
    </svg>
  );
}

function FlowNode({
  x,
  y,
  w,
  h,
  title,
  sub,
  active,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub: string;
  active?: boolean;
}) {
  return (
    <g
      className={`psanim-flow-node${active ? ' psanim-flow-node--active' : ''}`}
    >
      <rect
        className="psanim-flow-node-bg"
        x={x - w / 2}
        y={y}
        width={w}
        height={h}
        rx={3}
        ry={3}
      />
      <rect
        className="psanim-flow-node-border"
        x={x - w / 2}
        y={y}
        width={w}
        height={h}
        rx={3}
        ry={3}
      />
      <text
        className="psanim-flow-title"
        x={x}
        y={y + 18}
        textAnchor="middle"
        fontSize="11"
      >
        {title}
      </text>
      <text
        className="psanim-flow-sub"
        x={x}
        y={y + 33}
        textAnchor="middle"
        fontSize="9"
      >
        {sub}
      </text>
    </g>
  );
}

// ---------- Mini panadapter ----------

function PanaGrid() {
  const top = PANA_PAD_T;
  const bot = PANA_H - PANA_PAD_B;
  const left = PANA_PAD_L;
  const right = PANA_W - PANA_PAD_R;
  const dbs = [-20, -40, -60, -80];
  const dbY = (db: number) => top + (db / -100) * (bot - top);

  return (
    <g>
      <g className="psanim-pana__grid">
        {dbs.map((db) => (
          <line key={db} x1={left} y1={dbY(db)} x2={right} y2={dbY(db)} />
        ))}
        <line x1={(left + right) / 2} y1={top} x2={(left + right) / 2} y2={bot} />
      </g>
      <g className="psanim-pana__axis">
        {dbs.map((db) => (
          <text key={db} x={right + 4} y={dbY(db) + 3}>
            {db}
          </text>
        ))}
        <text x={left} y={bot + 13}>
          -4k
        </text>
        <text x={(left + right) / 2 - 4} y={bot + 13}>
          fc
        </text>
        <text x={right - 14} y={bot + 13}>
          +4k
        </text>
      </g>
    </g>
  );
}

function buildPanaPath(twoTone: boolean, armed: boolean) {
  const left = PANA_PAD_L;
  const right = PANA_W - PANA_PAD_R;
  const top = PANA_PAD_T;
  const bot = PANA_H - PANA_PAD_B;
  const N = 240;
  const span = right - left;

  const dbToY = (db: number) => {
    const clamped = Math.max(-100, Math.min(0, db));
    return top + (clamped / -100) * (bot - top);
  };
  const inBand = (frac: number) => Math.abs(frac) < 0.25;
  const skirt = (frac: number) => Math.abs(frac) < 0.45;

  const noise = (i: number) => {
    const s = Math.sin(i * 12.9898) * 43758.5453;
    return (s - Math.floor(s)) * 2 - 1;
  };

  const sample = (i: number, ref: boolean) => {
    const frac = (i / N - 0.5) * 2;
    const x = left + (i / N) * span;
    let db = -78 + noise(i) * 1.5;

    if (inBand(frac)) {
      if (twoTone) {
        const t1 = Math.exp(-Math.pow((frac - 0.1) * 60, 2));
        const t2 = Math.exp(-Math.pow((frac + 0.1) * 60, 2));
        const wobble = Math.sin(frac * 80) * 0.6;
        db = Math.max(db, -28 + wobble + (t1 + t2) * 5);
      } else {
        const edge = 1 - Math.exp(-Math.pow((Math.abs(frac) - 0.22) * 25, 2));
        db = Math.max(db, -28 - (1 - edge) * 6);
      }
    }
    if (ref && skirt(frac) && !inBand(frac)) {
      const k = (Math.abs(frac) - 0.25) / 0.2;
      db = Math.max(db, -60 + (1 - k) * 18);
    }
    if (!ref && armed && skirt(frac) && !inBand(frac)) {
      const k = (Math.abs(frac) - 0.25) / 0.2;
      db = Math.max(db, -75 + (1 - k) * 4);
    }
    return { x, y: dbToY(db) };
  };

  const tracePts = Array.from({ length: N + 1 }, (_, i) => sample(i, false));
  const refPts = Array.from({ length: N + 1 }, (_, i) => sample(i, true));
  const trace =
    'M ' + tracePts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');
  const ref =
    'M ' + refPts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ');
  const fill =
    `M ${left} ${bot} L ` +
    tracePts.map((p) => `${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' L ') +
    ` L ${right} ${bot} Z`;
  return { tracePath: trace, refPath: ref, fillPath: fill };
}

// ---------- Metric tile ----------

function Metric({
  label,
  value,
  empty,
  accent,
  hint,
}: {
  label: string;
  value: string;
  empty?: boolean;
  accent?: boolean;
  hint?: string;
}) {
  const cls =
    'psanim-metric' + (accent ? ' accent' : '') + (empty ? ' empty' : '');
  return (
    <div className={cls} title={hint}>
      <span className="k">{label}</span>
      <span className="v">{value}</span>
    </div>
  );
}
