using Zeus.Protocol1.Discovery;

namespace Zeus.Protocol1.Profiles;

/// <summary>
/// Baseline Protocol-1 encoding for boards that follow the original HPSDR
/// hardware attenuator convention: Hermes, Angelia, Metis, Griffin, and any
/// unrecognised board kind. Does not set a PA-enable bit on MOX and does not
/// accept TX IQ in the EP2 payload.
/// </summary>
internal sealed class GenericHpsdrProfile : IBoardProfile
{
    public HpsdrBoardKind Kind => HpsdrBoardKind.Hermes;

    /// <summary>C4 = 0x20 | (dB &amp; 0x1F) — direct hardware step attenuator encoding.</summary>
    public byte EncodeAttenuator(int dB) => (byte)(0x20 | (dB & 0x1F));

    public void ApplyMoxBits(Span<byte> cc, bool mox) { }

    public void ApplyFilterPins(ref byte c2, long vfoHz, bool hasFilterBoard) { }

    public bool SupportsTxIq => false;
}
