using Zeus.Protocol1.Discovery;
using Zeus.Protocol1.Profiles;

namespace Zeus.Protocol1.Tests;

public class BoardProfileTests
{
    // ── Factory routing ──────────────────────────────────────────────────────

    [Theory]
    [InlineData(HpsdrBoardKind.HermesLite2, true)]
    [InlineData(HpsdrBoardKind.Orion,       false)]
    [InlineData(HpsdrBoardKind.OrionMkII,   false)]
    [InlineData(HpsdrBoardKind.Hermes,      false)]
    [InlineData(HpsdrBoardKind.Angelia,     false)]
    [InlineData(HpsdrBoardKind.Unknown,     false)]
    public void BoardProfileFactory_SupportsTxIq_MatchesBoardKind(HpsdrBoardKind kind, bool expectedTxIq)
    {
        Assert.Equal(expectedTxIq, BoardProfileFactory.Get(kind).SupportsTxIq);
    }

    [Fact]
    public void BoardProfileFactory_Orion_And_OrionMkII_ReturnSameInstance()
    {
        Assert.Same(BoardProfileFactory.Get(HpsdrBoardKind.Orion),
                    BoardProfileFactory.Get(HpsdrBoardKind.OrionMkII));
    }

    // ── Orion attenuator encoding (same as bare HPSDR) ──────────────────────

    [Theory]
    [InlineData(HpsdrBoardKind.Orion,     0,  0x20)]
    [InlineData(HpsdrBoardKind.Orion,     10, 0x2A)]
    [InlineData(HpsdrBoardKind.Orion,     31, 0x3F)]
    [InlineData(HpsdrBoardKind.OrionMkII, 0,  0x20)]
    [InlineData(HpsdrBoardKind.OrionMkII, 20, 0x34)]
    public void ControlFrame_Attenuator_Orion_UsesHardwareStepEncoding(
        HpsdrBoardKind kind, int db, byte expectedC4)
    {
        Span<byte> cc = stackalloc byte[5];
        var s = new ControlFrame.CcState(
            VfoAHz: 14_200_000,
            Rate: HpsdrSampleRate.Rate48k,
            PreampOn: false,
            Atten: new HpsdrAtten(db),
            RxAntenna: HpsdrAntenna.Ant1,
            Mox: false,
            EnableHl2Dither: false,
            Board: kind);

        ControlFrame.WriteCcBytes(cc, ControlFrame.CcRegister.Attenuator, s);

        Assert.Equal(0x14, cc[0]);   // register wire byte
        Assert.Equal(expectedC4, cc[4]);
    }

    // ── Orion does NOT set PA-enable bit during MOX ──────────────────────────

    [Theory]
    [InlineData(HpsdrBoardKind.Orion)]
    [InlineData(HpsdrBoardKind.OrionMkII)]
    public void DriveFilter_Orion_MoxOn_LeavesC2Zero(HpsdrBoardKind kind)
    {
        Span<byte> cc = stackalloc byte[5];
        var s = new ControlFrame.CcState(
            VfoAHz: 14_200_000,
            Rate: HpsdrSampleRate.Rate48k,
            PreampOn: false,
            Atten: HpsdrAtten.Zero,
            RxAntenna: HpsdrAntenna.Ant1,
            Mox: true,
            EnableHl2Dither: false,
            Board: kind);

        ControlFrame.WriteCcBytes(cc, ControlFrame.CcRegister.DriveFilter, s);
        Assert.Equal(0, cc[2]);
    }

    // ── Profile ApplyMoxBits contract: full 5-byte span, index 2 is C2 ──────

    [Fact]
    public void HermesLite2Profile_ApplyMoxBits_SetsC2Bit3()
    {
        var profile = BoardProfileFactory.Get(HpsdrBoardKind.HermesLite2);
        Span<byte> cc = stackalloc byte[5];
        profile.ApplyMoxBits(cc, mox: true);
        Assert.Equal(0x08, cc[2]);
    }

    [Fact]
    public void HermesLite2Profile_ApplyMoxBits_MoxOff_LeavesC2Zero()
    {
        var profile = BoardProfileFactory.Get(HpsdrBoardKind.HermesLite2);
        Span<byte> cc = stackalloc byte[5];
        profile.ApplyMoxBits(cc, mox: false);
        Assert.Equal(0, cc[2]);
    }
}
