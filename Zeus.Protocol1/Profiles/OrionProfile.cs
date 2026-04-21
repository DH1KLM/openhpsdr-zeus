using Zeus.Protocol1.Discovery;

namespace Zeus.Protocol1.Profiles;

/// <summary>
/// Protocol-1 encoding for Orion / OrionMkII boards (ANAN G2 class).
/// Both board kinds share the standard HPSDR hardware-attenuator convention
/// and do not accept TX IQ in the EP2 payload.
///
/// This profile is the intended home for G2-specific extensions as the
/// implementation matures — dual-ADC configuration, extended OC outputs
/// (10 vs 7 on Hermes), ALEX relay control, and TX predistortion hooks
/// all belong here rather than in <see cref="GenericHpsdrProfile"/>.
/// </summary>
internal sealed class OrionProfile : IBoardProfile
{
    public HpsdrBoardKind Kind => HpsdrBoardKind.Orion;

    /// <summary>Standard bare-HPSDR hardware attenuator encoding: C4 = 0x20 | (dB &amp; 0x1F).</summary>
    public byte EncodeAttenuator(int dB) => (byte)(0x20 | (dB & 0x1F));

    public void ApplyMoxBits(Span<byte> cc, bool mox) { }

    public void ApplyFilterPins(ref byte c2, long vfoHz, bool hasFilterBoard) { }

    public bool SupportsTxIq => false;
}
