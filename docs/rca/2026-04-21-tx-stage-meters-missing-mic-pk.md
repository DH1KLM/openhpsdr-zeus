# RCA — TX Stage Meters: WDSP MicPk not surfaced in UI

**Status:** resolved. Fix in PR for issue #2.

## Symptom

TX Stage Meters panel showed dashes (`—`) for all rows when connecting to the UI while transmitting, even with WDSP fully active. The EQ / LVLR / ALC / OUT rows eventually animated, but there was no MIC row to show the signal *entering* the WDSP TXA chain.

## Root Cause

`WdspDspEngine.ProcessTxBlock()` reads six WDSP meter values per block:

```csharp
double micPk  = NativeMethods.GetTXAMeter(txa, 0);  // MIC_PK
double eqPk   = NativeMethods.GetTXAMeter(txa, 2);  // EQ_PK
double lvlrPk = NativeMethods.GetTXAMeter(txa, 4);  // LVLR_PK
double alcPk  = NativeMethods.GetTXAMeter(txa, 12); // ALC_PK
double alcGain= NativeMethods.GetTXAMeter(txa, 14); // ALC_GAIN
double outPk  = NativeMethods.GetTXAMeter(txa, 15); // OUT_PK
```

`micPk` (txaMeterType `MIC_PK = 0`) is the post-panel-gain, pre-EQ level —
the most diagnostic value for "is mic audio actually entering the WDSP chain?".
It was read but **never included in the `TxStageMeters` snapshot**:

```csharp
// before fix — micPk silently dropped
var snap = new TxStageMeters(EqPk: ..., LvlrPk: ..., ...);
```

`TxMetersService` therefore could not use the value and sent `-100f` as a
placeholder in the `TxMetersFrame.MicDbfs` wire slot. The frontend explicitly
skipped the `micDbfs` field in `setMeters` (to avoid clobbering the
browser-worklet-driven `MicMeter`), so the WDSP value was discarded end-to-end.

## Signal chain gap

Before fix:

```
Browser worklet → TxAudioIngest → WDSP: MIC_PK → EQ_PK → LVLR_PK → ALC_PK → OUT_PK
                                         ↑ read but dropped
UI showed:                               EQ  LVLR  ALC   ALC-GR  OUT
```

After fix:

```
UI shows: MIC → EQ → LVLR → ALC → ALC-GR → OUT
```

## Resolution

1. **`Zeus.Dsp/TxStageMeters.cs`** — added `MicPk` field; updated `Silent` constant.
2. **`Zeus.Dsp/Wdsp/WdspDspEngine.cs`** — included `MicPk: (float)micPk` in snapshot.
3. **`Zeus.Server/TxMetersService.cs`** — replaced `-100f` placeholder with
   `stage.MicPk` for the `MicDbfs` wire slot; removed dead constant.
4. **`zeus-web/src/state/tx-store.ts`** — added `wdspMicPk` store field;
   `setMeters` now maps `m.micDbfs` → `wdspMicPk` (separate from worklet `micDbfs`).
5. **`zeus-web/src/components/TxStageMeters.tsx`** — added MIC row at the top of the
   stage chain.

## Units

| Row   | Field     | Unit | Source                     | Notes                              |
|-------|-----------|------|----------------------------|------------------------------------|
| MIC   | wdspMicPk | dBFS | WDSP MIC_PK (index 0)      | Post-panel-gain, pre-EQ            |
| EQ    | eqPk      | dBFS | WDSP EQ_PK (index 2)       |                                    |
| LVLR  | lvlrPk    | dBFS | WDSP LVLR_PK (index 4)     | == EQ when Leveler disabled        |
| ALC   | alcPk     | dBFS | WDSP ALC_PK (index 12)     | Key clipping indicator             |
| ALC GR| alcGr     | dB   | WDSP ALC_GAIN (index 14)   | >12 dB sustained = over-driving    |
| OUT   | outPk     | dBFS | WDSP OUT_PK (index 15)     | Final TX peak before EP2 packer    |

## What was NOT broken

The EQ / LVLR / ALC / ALC-GR / OUT rows were correctly wired from the start.
The plumbing (WS broadcast → frame parser → store → component) was intact;
only `MicPk` was missing, creating an incomplete signal chain view.
