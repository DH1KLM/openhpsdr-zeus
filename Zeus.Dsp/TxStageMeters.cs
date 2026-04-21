namespace Zeus.Dsp;

/// <summary>
/// Per-block peak readings from the WDSP TXA metering ring. Values are in
/// dBFS for the level meters and dB for the gain-reduction meters. When TXA
/// is not processing (MOX off, or engine lacks TXA), all fields are
/// <see cref="float.NegativeInfinity"/> except the gain fields which are 0.
///
/// Chosen as peak (not average) readings — the diagnostic we care about is
/// clipping-induced distortion, which hides inside the average window's
/// ~100 ms smoothing. Indices tracked per <c>native/wdsp/TXA.h</c> txaMeterType.
///
/// Signal chain order: MicPk (post-panel-gain, txaMeterType 0) →
/// EqPk (post-EQ, 2) → LvlrPk (post-Leveler, 4) →
/// AlcPk (post-ALC, 12) / AlcGr (ALC gain reduction, 14) →
/// OutPk (final TX output, 15).
/// </summary>
public readonly record struct TxStageMeters(
    float MicPk,
    float EqPk,
    float LvlrPk,
    float AlcPk,
    float AlcGr,
    float OutPk)
{
    public static readonly TxStageMeters Silent = new(
        MicPk: float.NegativeInfinity,
        EqPk: float.NegativeInfinity,
        LvlrPk: float.NegativeInfinity,
        AlcPk: float.NegativeInfinity,
        AlcGr: 0f,
        OutPk: float.NegativeInfinity);
}
