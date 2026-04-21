using Zeus.Protocol1.Discovery;

namespace Zeus.Protocol1.Profiles;

/// <summary>
/// Encapsulates the board-specific Protocol-1 C&amp;C encoding differences that
/// would otherwise be scattered if/else branches keyed on <see cref="HpsdrBoardKind"/>.
/// Implementations are stateless; obtain an instance via <see cref="BoardProfileFactory.Get"/>.
/// </summary>
public interface IBoardProfile
{
    HpsdrBoardKind Kind { get; }

    /// <summary>
    /// Encode a receive attenuator level into the C4 byte written at C0=0x14.
    /// Different boards use incompatible encodings (hardware step attenuator vs.
    /// firmware gain reduction).
    /// </summary>
    byte EncodeAttenuator(int dB);

    /// <summary>
    /// Apply any MOX/PA-enable bits into the five C&amp;C bytes for the DriveFilter
    /// register (C0=0x12). <paramref name="cc"/> is the full 5-byte span including C0.
    /// </summary>
    void ApplyMoxBits(Span<byte> cc, bool mox);

    /// <summary>
    /// Apply OC filter-board pin bits into the C2 byte for the Config register
    /// (C0=0x00). No-op for boards that have no external filter relay board.
    /// </summary>
    void ApplyFilterPins(ref byte c2, long vfoHz, bool hasFilterBoard);

    /// <summary>
    /// Whether this board accepts IQ samples in the 504-byte EP2 TX payload.
    /// When false the payload is left zeroed (drive-level byte in DriveFilter C1
    /// is the only TX control that matters).
    /// </summary>
    bool SupportsTxIq { get; }
}
