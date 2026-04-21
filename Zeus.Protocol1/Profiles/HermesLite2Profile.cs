using Zeus.Protocol1.Discovery;

namespace Zeus.Protocol1.Profiles;

/// <summary>
/// Protocol-1 encoding overrides for HermesLite2 gateware.
/// Covers the four HL2-specific differences that otherwise require explicit
/// board checks in <see cref="ControlFrame"/>:
/// <list type="bullet">
///   <item>Extended firmware-gain attenuator (no physical step attenuator on HL2).</item>
///   <item>PA-enable bit in DriveFilter C2[3] during MOX.</item>
///   <item>N2ADR 7-relay filter board OC pin mask in Config C2[7:1].</item>
///   <item>IQ samples accepted in the 504-byte EP2 TX payload.</item>
/// </list>
/// </summary>
internal sealed class HermesLite2Profile : IBoardProfile
{
    public HpsdrBoardKind Kind => HpsdrBoardKind.HermesLite2;

    /// <summary>
    /// HL2 has no physical RX step attenuator. "Attenuate N dB" is encoded as
    /// "reduce firmware RX gain by N from the 60 dB max": C4 = 0x40 | (60 − dB).
    /// Source: deskhpsdr old_protocol.c:2922-2941; HL2 ad9866 rxgain register.
    /// </summary>
    public byte EncodeAttenuator(int dB) => (byte)(0x40 | Math.Clamp(60 - dB, 0, 60));

    /// <summary>
    /// HL2 gateware requires C2[3] (PA enable) whenever MOX is asserted.
    /// Without this bit the PA never energises regardless of drive level.
    /// Source: deskhpsdr old_protocol.c:2863-2884.
    /// </summary>
    public void ApplyMoxBits(Span<byte> cc, bool mox)
    {
        if (mox) cc[2] |= 0x08;
    }

    /// <summary>
    /// N2ADR 7-relay filter board OC pin mask shifted into C2[7:1].
    /// Source: deskhpsdr old_protocol.c:2550.
    /// </summary>
    public void ApplyFilterPins(ref byte c2, long vfoHz, bool hasFilterBoard)
    {
        if (hasFilterBoard)
            c2 |= (byte)(Zeus.Protocol1.N2adrBands.RxOcMask(vfoHz) << 1);
    }

    public bool SupportsTxIq => true;
}
