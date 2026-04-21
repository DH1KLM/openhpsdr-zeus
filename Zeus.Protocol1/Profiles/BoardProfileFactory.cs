using Zeus.Protocol1.Discovery;

namespace Zeus.Protocol1.Profiles;

/// <summary>
/// Returns the <see cref="IBoardProfile"/> for a given <see cref="HpsdrBoardKind"/>.
/// Instances are pre-allocated singletons; profiles are stateless so callers must not
/// mutate them. Unknown board kinds fall back to <see cref="GenericHpsdrProfile"/>.
/// </summary>
public static class BoardProfileFactory
{
    private static readonly IBoardProfile Generic = new GenericHpsdrProfile();
    private static readonly IBoardProfile Hl2 = new HermesLite2Profile();
    private static readonly IBoardProfile Orion = new OrionProfile();

    public static IBoardProfile Get(HpsdrBoardKind kind) => kind switch
    {
        HpsdrBoardKind.HermesLite2 => Hl2,
        HpsdrBoardKind.Orion       => Orion,
        HpsdrBoardKind.OrionMkII   => Orion,
        _                          => Generic,
    };
}
