# ANAN G2 / Orion MkII vs HermesLite2 — Parameter Differences

Analysis supporting issue #19 (Protocol 2 / ANAN G2 BPF stuck at 10 MHz).

## Data Sources

This document is derived from:
- Zeus main-branch codebase (fully examined; see file references below)
- KB2UKA's issue #19 description and comments (confirmed test results from real G2 hardware)
- `docs/lessons/wdsp-init-gotchas.md` (references `clsHardwareSpecific.cs:428` in Thetis)

Items marked **[NEEDS THETIS VERIFICATION]** require access to the ramdor/Thetis source to confirm exact values, particularly `clsHardwareSpecific.cs` and `console.cs`.

---

## Executive Summary

KB2UKA hit a **BPF stuck at 10 MHz** symptom on the ANAN G2 in Protocol 2: only WWV (~10 MHz) produces real spectrum; all other HF bands (80m, 40m, 20m, 15m, 10m) show only noise.

Two root-cause candidates emerge from the local code analysis:

1. **Primary (most likely):** The ALEX relay word in the Protocol 2 `CmdHighPriority` packet contains `ANT_1` select (bit 24) and ALEX-enable (byte 59 in CmdGeneral = 0x03), but the **BPF band-select relay bits inside the Alex0 word are not being updated per frequency**. The G2's ALEX hardware powers up in a default relay state covering ~9–11 MHz, which is why 10 MHz works. Any VFO move off that range finds the RF already filtered out before the ADC.

2. **Secondary (existing Protocol 1 gap):** Zeus Protocol 1 never sends any ALEX relay control words for Orion/G2. The `CcRegister` enum covers only Config/TxFreq/RxFreq/DriveFilter/Attenuator; the ALEX relay CC registers (C0=0x08, 0x0A, 0x0C) are absent. A G2 connected via Protocol 1 to the current Zeus mainline would display the same stuck-BPF symptom as a Protocol 2 connection without correct relay words.

---

## HL2 vs G2 — Parameter Table

### 1. RX Filter / BPF Control

| Parameter | HermesLite2 | G2 / Orion MkII |
|-----------|-------------|-----------------|
| Filter hardware | N2ADR 6-relay external board | Built-in ALEX relay assembly |
| Control mechanism | Protocol 1 C2 byte OC pins [7:1] | ALEX relay word (P2: `CmdHighPriority` Alex0; P1: CC regs 0x08/0x0A) |
| Per-band update method | `N2adrBands.RxOcMask(vfoHz)` called every CC Config frame | Per-frequency lookup table [NEEDS THETIS] |
| Implemented in Zeus (main) | ✅ Yes — `ControlFrame.cs:130-131` | ❌ No — P1 ALEX regs missing; P2 relay-word BPF bits absent |
| Default state (no command) | No filter selected (broadband) | ~9–11 MHz BPF (hardware power-on default, per KB2UKA observation) |

From `ControlFrame.cs:130-131` (P1, N2ADR only):

```csharp
if (s.Board == HpsdrBoardKind.HermesLite2 && s.HasN2adr)
{
    c2 |= (byte)(N2adrBands.RxOcMask(s.VfoAHz) << 1);
}
```

For G2, `c2` stays 0. No ALEX CC registers are present in the Zeus P1 `CcRegister` enum at all.

N2ADR band-to-OC-pin mapping (from `N2adrBands.cs`, based on Thetis `setup.cs:14655-14699`):

| Band | VFO range | OC pin mask (bits [6:0]) |
|------|-----------|--------------------------|
| 160m | 1.8–3.5 MHz | 0x01 (pin 1 only) |
| 80m  | 3.5–5.3 MHz | 0x42 (pins 2+7) |
| 60m/40m | 5.3–10.1 MHz | 0x44 (pins 3+7) |
| 30m/20m | 10.1–18.1 MHz | 0x48 (pins 4+7) |
| 17m/15m | 18.1–24.9 MHz | 0x50 (pins 5+7) |
| 12m/10m | 24.9–29.7 MHz | 0x60 (pins 6+7) |

The G2 equivalent relay table **[NEEDS THETIS]** is in `clsHardwareSpecific.cs` (the G2 BPF relay
table) and `console.cs` (`mkiibpf` struct, `SetAntBits` function).

### 2. RX Attenuator Encoding

| Parameter | HermesLite2 | G2 / Orion MkII (Standard HPSDR) |
|-----------|-------------|-----------------------------------|
| Hardware type | None — firmware AD9866 RX gain | Hardware step attenuator 0–31 dB |
| C4 encoding | `0x40 \| (60 - db)` | `0x20 \| (db & 0x1F)` |
| Effective range | 0–60 dB (gain reduction) | 0–31 dB |

From `ControlFrame.cs:109-112`:

```csharp
byte c4 = s.Board == HpsdrBoardKind.HermesLite2
    ? (byte)(0x40 | Math.Clamp(60 - db, 0, 60))
    : (byte)(0x20 | (db & 0x1F));
```

This is already correct for both boards in Protocol 1 Zeus.

### 3. PA Enable / TX Path

| Parameter | HermesLite2 | G2 / Orion MkII |
|-----------|-------------|-----------------|
| P1 PA enable bit | C2 bit 3 (`0x08`) when MOX=1 | Not required in C2 |
| TX IQ payload | Written only for HL2 board | Not implemented |
| P2 TX | Not applicable (HL2 is P1-only) | **[NEEDS IMPLEMENTATION]** |

Zeus gates the EP2 IQ payload on `state.Board == HpsdrBoardKind.HermesLite2` (`ControlFrame.cs:215`). G2 TX is a future work item.

### 4. S-Meter Calibration Offset

From `docs/lessons/wdsp-init-gotchas.md:72` (references `clsHardwareSpecific.cs:428`
`RXMeterCalbrationOffsetDefaults` in Thetis):

| Board | Thetis offset | Zeus current |
|-------|--------------|--------------|
| ANAN 7000 / 8000 | +4.84 dB | +0.98 dB (wrong) |
| G2 / Orion MkII | **−4.48 dB** | +0.98 dB (wrong) |
| HL2 / everything else | +0.98 dB | +0.98 dB (correct) |

Zeus currently applies +0.98 dB for all boards. The G2 should receive −4.48 dB. This is a calibration bug independent of the BPF issue; it would make S-meter readings 5.46 dB too high on a G2.

### 5. Board Type Identification

From `HpsdrBoardKind.cs` and `ReplyParser.cs`:

| Board | Protocol 1 board ID byte | Notes |
|-------|--------------------------|-------|
| HermesLite2 | 0x06 | Identified by *code version ≥ 40* AND board ID |
| Orion MkI | 0x05 | |
| Orion MkII (G2) | 0x0A | P1 discovery byte 10; P2 discovery **[different format — NEEDS THETIS]** |
| Angelia | 0x04 | |

Protocol 2 discovery uses a different reply format than Protocol 1. KB2UKA's P2 discovery produces the correct board ID for the G2 per the issue comment (G2 shows up as "OrionMkII fw 2.7b41").

### 6. ADC Configuration

| Parameter | HermesLite2 | G2 / Orion MkII |
|-----------|-------------|-----------------|
| ADC hardware | Single AD9866 | Dual ADC (ADC0 = main, ADC1 = secondary) |
| P1 ADC selection | Implicit (no config needed) | Implicit (ALEX routes the correct ADC) |
| P2 ADC routing | N/A | CmdRx byte 17 **[NEEDS THETIS for valid values]** |
| KB2UKA test | — | Tried ADC0 and ADC1 — no change |

KB2UKA confirmed that swapping ADC source from ADC0 to ADC1 did not change the symptom. This rules out "wrong ADC" as the root cause; the RF is being cut upstream of both ADCs by the ALEX BPF relay.

---

## Protocol 1: Missing ALEX CC Registers (P1 Gap)

Zeus Protocol 1 defines only 5 CC registers in its rotation:

```csharp
// Zeus.Protocol1/ControlFrame.cs:20-27
public enum CcRegister : byte
{
    Config = 0x00,
    TxFreq = 0x02,
    RxFreq = 0x04,
    DriveFilter = 0x12,
    Attenuator = 0x14,
}
```

Protocol 1 ALEX relay control requires additional CC registers not present here:

| CC register | Purpose |
|-------------|---------|
| C0 = 0x08 | Alex TX relay (antenna, LPF selection) |
| C0 = 0x0A | Alex RX relay (BPF selection, RX antenna) |
| C0 = 0x0C | Alex TX relay B (additional TX path bits) |

These are absent from `CcRegister` and from the `PhaseRegisters()` rotation
(`Protocol1Client.cs:325-344`). As a consequence:

- Any HPSDR board with ALEX hardware (Orion, Orion MkII / G2, Angelia, Hermes with ALEX) that is connected via Zeus Protocol 1 receives zero ALEX relay commands.
- ALEX hardware defaults to a fixed relay state at power-on.
- For the G2, that default covers ~9–11 MHz, which is the observed behavior.

**This means the BPF problem exists in Protocol 1 too, and would manifest identically if the G2 were flashed back to P1 firmware and connected to Zeus main.** KB2UKA's choice to pursue Protocol 2 avoids this P1 gap, but the P2 implementation must implement ALEX relay control or it hits the same wall.

---

## Protocol 2: Structure and BPF Analysis

### Command Packet Overview

KB2UKA describes three Protocol 2 command types sent by Zeus's P2 client:

| Packet | Destination | Frequency | BPF relevance |
|--------|-------------|-----------|---------------|
| CmdGeneral | radio:1024 | Once at connect | ALEX present: byte 59 = 0x03 ✅ |
| CmdHighPriority | radio:1024 | Periodic / on change | **Alex0 relay word — BPF bits** |
| CmdRx (DDC) | radio:1024 | Once at connect | ADC0/1 routing for each DDC |

### What KB2UKA Tried vs What's Needed

| Action | Tried? | Result | Analysis |
|--------|--------|--------|----------|
| Set ALEX enable (CmdGeneral byte 59 = 0x03) | ✅ | — | Correct and necessary |
| Set ANT_1 (Alex0 bit 24 in CmdHighPriority) | ✅ | No change | Routes antenna 1 — needed but not sufficient |
| Bit 12 `_Bypass` in rbpfilter struct | Tried, backed out | — | Correct to back out (PureSignal-related per KB2UKA) |
| Swap ADC0 → ADC1 (CmdRx byte 17) | ✅ | No change | Confirmed: RF cut before ADC, not routing issue |
| BPF band-select relay bits in Alex0 word | ❌ Not mentioned | — | **Most likely missing piece** |
| Frequency-driven relay update on VFO change | ❌ Not mentioned | — | Needed alongside the above |

### The Missing Relay Table

The G2's ALEX relay word must encode **which BPF is selected**, not just which antenna. The `ANT_1` bit alone routes the antenna connector to the ALEX but leaves the filter relay in its power-on state.

The required implementation is analogous to `N2adrBands.RxOcMask()` for HL2, but for G2:

```
// Pseudocode — exact Alex0 bit values NEED THETIS VERIFICATION
// (clsHardwareSpecific.cs, mkiibpf struct, console.cs SetAntBits)

uint32 G2AlexRelayWord(long vfoHz) => vfoHz switch
{
    < 2_000_000  => ANT1 | BPF_160m,
    < 4_000_000  => ANT1 | BPF_80m,
    < 7_500_000  => ANT1 | BPF_60m_40m,
    < 14_500_000 => ANT1 | BPF_30m_20m,
    < 21_500_000 => ANT1 | BPF_17m_15m,
    < 30_000_000 => ANT1 | BPF_12m_10m,
    _            => ANT1 | BPF_BYPASS,
};
```

The exact BPF bit values for G2 are in Thetis `clsHardwareSpecific.cs` (the hardware-specific relay tables) and `console.cs` (the `mkiibpf` struct). **These cannot be guessed safely** — using wrong relay bit values could set RL22 or other relays in a damaging state.

---

## What Needs Thetis Source Verification

The following items require examination of `ramdor/Thetis` source to answer correctly. All of them
live in one of two files:

**`clsHardwareSpecific.cs`** (hardware-specific tables):
1. Complete G2/Orion MkII BPF relay bit table (Alex0 word value per band)
2. Complete `RXMeterCalbrationOffsetDefaults` table (partial: G2 = −4.48 dB confirmed above)
3. Any G2-specific ALEX init sequence separate from the CmdHighPriority relay word

**`console.cs`** (radio init and band-change logic):
1. `mkiibpf` struct: what is the field layout, which bits select which BPF?
2. `rbpfilter` struct: complete field listing; specifically what `_10_dB_Atten` / RL22 (bit 14) actually controls on G2 hardware
3. `SetAntBits()` function for `Model.OrionMkII`: does it differ from `Model.Orion`?
4. Whether CmdHighPriority is re-sent on every VFO change in Thetis or only on band transitions
5. Whether a PureSignal bypass bit can remain latched from a previous client session and how to clear it

---

## Recommended Investigation Steps for KB2UKA

1. **Find the G2 BPF relay table in `clsHardwareSpecific.cs`.**
   Search for `OrionMkII`, `mkiibpf`, or `RXMeterCalbrationOffset`. The table directly adjacent to the `−4.48` meter offset entry will likely contain BPF relay values.

2. **Trace `SetAntBits` in `console.cs` for `Model.OrionMkII`.**
   This function (or the branchy `mkiibpf` logic KB2UKA mentioned) builds the Alex0 relay word. Extract the full set of bits it writes per band.

3. **Verify that CmdHighPriority is re-sent on VFO change in the Zeus P2 implementation.**
   The relay word must be recalculated and re-transmitted whenever the VFO frequency crosses a BPF band boundary. If it's only sent at connect time with a fixed value, all subsequent QSYs will be wrong.

4. **Add a log line showing the raw Alex0 word** every time CmdHighPriority is built. Compare the logged value for 14 MHz vs the Thetis-expected value for 20m from the relay table.

5. **Clarify RL22 / bit 14 in rbpfilter.**
   KB2UKA's description ("RX master in select") suggests this may be the relay that routes the RX input through the main RX path vs an alternate. If it defaults off, RF would still be cut even with the correct BPF selected. Thetis source will show whether `SetAntBits` always sets bit 14 regardless of band.

6. **Apply the G2 meter calibration offset (−4.48 dB)** when the connected board is OrionMkII.
   Separate from the BPF fix, but should be applied in `WdspDspEngine.GetRxaSignalDbm` or at the `DspPipelineService` layer, gated on the detected board type.

---

## Key Thetis Source File References

From `docs/lessons/dev-conventions.md` and `docs/lessons/wdsp-init-gotchas.md`:

| File | Location in Thetis | Relevance to G2 |
|------|--------------------|-----------------|
| `clsHardwareSpecific.cs` | `Console/` | **Primary**: G2 BPF relay table, meter offsets, hardware-specific init |
| `console.cs` | `Console/` | `mkiibpf` struct, `SetAntBits`, band-change relay update |
| `dsp.cs` | `Console/` | DSP pipeline for Protocol 2 |
| `networkprotocol2.cs` | `Console/` (likely) | Protocol 2 command packet encoding (Note: KB2UKA confirmed P2 files use "ETH" naming in Thetis's C layer, but the C# console layer may use "networkprotocol2") |

**File naming note (from KB2UKA):** In Thetis's native C layer, Protocol 1 = "USB" and Protocol 2 = "ETH". So `networkproto1.c` is Protocol 1, and the Protocol 2 native code is likely in a file with "eth" or "proto2" in the name. The C# console layer may use different naming.
