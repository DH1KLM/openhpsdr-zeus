// SPDX-License-Identifier: GPL-2.0-or-later
//
// Zeus — OpenHPSDR Protocol-1 / Protocol-2 client.
// Copyright (C) 2025-2026 Brian Keating (EI6LF),
//                         Douglas J. Cerrato (KB2UKA), and contributors.
//
// This program is free software: you can redistribute it and/or modify it
// under the terms of the GNU General Public License as published by the
// Free Software Foundation, either version 2 of the License, or (at your
// option) any later version. See the LICENSE file at the root of this
// repository for the full text, or https://www.gnu.org/licenses/.

using System.Net;
using System.Net.Sockets;
using Microsoft.Extensions.Logging.Abstractions;

namespace Zeus.Protocol2.Tests;

public class Protocol2ClientConnectTests
{
    // Issue #213. ANAN G2 with internal Radxa CM5 (Ubuntu 24.04 ARM64) was
    // returning a bare 500 on /api/connect/p2 because Protocol2Client.ConnectAsync
    // surfaced a raw SocketException(AddressAlreadyInUse) when the embedded
    // host's stock client already owned UDP/1025. The endpoint catch-all wrapped
    // it as Results.Problem(...) which the frontend can't parse as { error: ... },
    // so the operator just saw "500 Internal Server Error" with no actionable
    // detail. After the fix, ConnectAsync re-throws as InvalidOperationException
    // with a clear message — endpoint maps that to 409 Conflict and the frontend
    // surfaces the message verbatim.
    [Fact]
    public async Task ConnectAsync_PortInUse_ThrowsInvalidOperationWithActionableMessage()
    {
        // Hold UDP/1025 ourselves so the SUT's bind hits AddressAlreadyInUse on
        // every loopback test platform. Skip silently when the test host can't
        // open 1025 (e.g. another HPSDR client really is running, or some
        // unrelated service grabbed it).
        using var hold = new Socket(AddressFamily.InterNetwork, SocketType.Dgram, ProtocolType.Udp);
        try
        {
            hold.Bind(new IPEndPoint(IPAddress.Any, 1025));
        }
        catch (SocketException)
        {
            // Pre-existing owner — the bug we're guarding against is already
            // exercised in the wild; nothing useful to assert here.
            return;
        }

        var client = new Protocol2Client(NullLogger<Protocol2Client>.Instance);
        var radioEp = new IPEndPoint(IPAddress.Loopback, 1024);

        var ex = await Assert.ThrowsAsync<InvalidOperationException>(
            () => client.ConnectAsync(radioEp, CancellationToken.None));
        Assert.Contains("1025", ex.Message);
        Assert.Contains("HPSDR", ex.Message);
        // Original SocketException is preserved as the inner — operators / logs
        // still get the underlying error code if they need to triage further.
        Assert.IsType<SocketException>(ex.InnerException);
    }
}
