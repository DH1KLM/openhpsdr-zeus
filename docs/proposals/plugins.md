# Proposal: Zeus Plugin System Architecture

**Status:** Draft — awaiting maintainer review
**Author:** AI agent survey, for Brian (EI6LF) review
**Related issues:** #185 (this proposal), #106 (VST host — first concrete plugin target)
**Scope:** Cross-cutting. Spans `Zeus.Server` (plugin host, lifecycle), a new `Zeus.Plugin.Contracts` assembly (API surface), and `zeus-web` (dynamic widget loading, plugin settings UI). Red-light per `CLAUDE.md` — architecture changes require maintainer sign-off before any implementation proceeds.

---

## 1. What we are solving

Every new optional feature today must ship inside Zeus core. That couples the release cycle, inflates the binary, and makes it impossible for third parties (amp vendors, DSP researchers, external developers) to contribute capabilities without forking. The three concrete drivers right now:

| Driver | What it needs |
|---|---|
| VST host (KB2UKA, issue #106) | DSP-stage plugin that loads native VST2/VST3 DLLs and inserts them into the audio pipeline |
| Modular amp support (EI6LF) | A first-class amp-vendor model: vendors (not Zeus core) register their amp profiles and controls |
| Flex layout widgets | Community-contributed panels that appear in the "Add Panel" modal without a Zeus core PR |

A secondary goal is keeping Zeus core lean: **even the plugin host itself should ship as an optional addon**, not a mandatory component.

---

## 2. Scope

Two distinct plugin surfaces are needed:

| Surface | What it enables | Runs where |
|---|---|---|
| **Server plugins** | DSP stages, radio/amp adapters, new CAT/CI-V bridges, protocol adapters | .NET process (`Zeus.Server`) |
| **UI widget plugins** | Panels that drop into the flex layout | Browser (`zeus-web`) |

These two surfaces are coordinated by a single plugin manifest — one plugin package can ship both a server component and a web component.

---

## 3. Art of the possible: how comparable tools handle this

Surveying products the user called out plus close analogues:

| Product | Mechanism | Isolation | DX | Notes |
|---|---|---|---|---|
| **VS Code extensions** | Out-of-process Node.js extension host | High (separate process) | Excellent | ~150 MB overhead per host process; too heavy for Zeus |
| **OBS Studio** | Native DLLs (`.dll`/`.so`/`.dylib`), C ABI with a fixed `obs_module_*` entry-point table | None (in-process) | Good | Fast, widely adopted; crash in plugin crashes OBS |
| **SDR++** | Shared libraries with a `ModuleEntry` C ABI; loaded via `dlopen`/`LoadLibrary`; module manager UI built-in | None (in-process) | Good | Very close to what Zeus needs; modules can include UI (ImGui) |
| **GQRX / GNU Radio** | `gr_block` subclasses compiled into shared libraries; discovery via `.pc` metadata | None (in-process) | Moderate | Requires GNU Radio SDK; compile-time, not dynamic |
| **Winamp** | DLL with exported `winampGetHeader2` returning a fixed struct of function pointers | None (in-process) | Simple | Enormously successful; hundreds of plug-ins from the era |
| **GIMP** | Script-Fu, Python-Fu, compiled `.so` plug-ins, plug-in registry | Process-per-plugin for old arch; in-process for GIMP 3 | Complex | Multi-language support adds real complexity |
| **VST2/VST3 itself** | Native DLLs discovered in well-known paths, loaded via `dlopen`; structured C++ ABI | None (in-process) | Good | Zeus's VST host plugin must implement exactly this to load VST plug-ins |

**Pattern that fits Zeus:** The SDR++ / Winamp / OBS model — shared libraries (managed .NET assemblies in Zeus's case) loaded at runtime, in-process, with a thin typed entry-point interface. Out-of-process isolation is overkill for real-time DSP and adds latency/complexity that would cripple the VST use case.

For Zeus specifically, .NET's `AssemblyLoadContext` (ALC) gives us the equivalent of `dlopen` with dependency isolation and unload support — without needing a C ABI.

---

## 4. Technology choice: .NET AssemblyLoadContext

### What it is

`AssemblyLoadContext` is the .NET runtime's unit of assembly isolation, available since .NET Core 3.0 / .NET 5+. Each ALC has its own dependency resolution graph and can be collected (unloaded) when no live references remain.

### Why it fits

- **Cross-platform**: Works identically on Windows, Linux, and macOS — same API, no P/Invoke.
- **Managed isolation**: Each plugin's NuGet deps resolve inside its ALC; version conflicts between plugins (or between a plugin and Zeus core) don't crash the host.
- **Unload support**: `AssemblyLoadContext(isCollectible: true)` allows removing a plugin without restarting Zeus.
- **Native passthrough**: Plugins can P/Invoke into native DLLs (VST, proprietary SDKs) — just as Zeus itself does with WDSP.
- **Typed interface, no C ABI**: Plugin entry points are .NET interfaces, not function-pointer structs. Compile-time checked on both sides.
- **In-process speed**: No IPC round-trip. VST-style block processing (every 64–1024 samples) is feasible.

### The crash risk

A crash inside a native DLL loaded by a plugin (e.g., a buggy VST) **will still crash `Zeus.Server`**. This is the same trade-off OBS, SDR++, and Winamp all make. The mitigation is documentation, not architecture: plugin authors are told their native code is in-process and must be stable. The VST host plugin itself can run a per-VST crash guard at the P/Invoke seam (structured exception handling on Windows, `sigsetjmp`/`siglongjmp` on Linux/macOS) — but this is the plugin author's job, not Zeus core's.

For pure managed plugins, an unhandled exception at the plugin boundary is catchable in the host and results in the plugin being disabled with a logged error, not a process crash.

---

## 5. Frontend plugin loading

Plugin UI widgets are React components. The requirement is that they can be loaded at runtime without recompiling Zeus.

### Recommended approach: dynamic ES module import

Zeus.Server serves plugin web assets from `/api/plugins/{id}/assets/*`. At startup, the frontend fetches the plugin manifest list, then for each plugin with a `webBundle` entry it does:

```ts
const mod = await import(/* @vite-ignore */ `/api/plugins/${id}/assets/index.js`);
mod.register(panelRegistry);
```

The plugin's `index.js` exports a `register(registry)` function that adds entries to the `PANELS` map (see `zeus-web/src/layout/panels.ts`). The panel component can be a standard React functional component; it receives a `useZeus()` hook for SignalR access.

This is the simplest dynamic loading path available in modern browsers:
- No build-time config changes (unlike Vite Module Federation).
- Works with the existing `flexlayout-react` panel system.
- Sandbox boundary: the plugin component runs in the same origin and JS scope as Zeus. It can call any SignalR hub method Zeus exposes. There is no JS-level sandbox — the security model is the same as OBS/Winamp: trust is placed at install time, not runtime.

For content-security-policy hardening (future), the `/api/plugins/` origin can be isolated via `script-src` nonces or a separate subpath, but this is not required for v1.

---

## 6. Plugin manifest format

Each installed plugin has a `manifest.json` at its root:

```json
{
  "id": "com.acme.vst-host",
  "name": "VST Host",
  "version": "1.2.0",
  "author": "KB2UKA",
  "description": "Host VST2/VST3 effects as DSP stages inside Zeus",
  "license": "GPL-2.0-or-later",
  "minZeusVersion": "1.0.0",
  "platforms": ["windows", "linux", "macos"],
  "serverAssembly": "Zeus.Plugins.VstHost.dll",
  "serverEntryPoint": "Zeus.Plugins.VstHost.VstHostPlugin",
  "webBundle": "index.js",
  "apiPermissions": ["dsp.stage", "hub.subscribe", "settings.read"]
}
```

Fields:

| Field | Purpose |
|---|---|
| `id` | Reverse-domain unique ID. Used as the folder name under the plugin directory. |
| `serverAssembly` | DLL to load into an ALC. Omit if this is a UI-only plugin. |
| `serverEntryPoint` | Fully-qualified class implementing `IZeusPlugin`. |
| `webBundle` | Path inside the plugin directory to the ES module entry. Omit if server-only. |
| `apiPermissions` | Declarative list of capabilities the plugin requires. Not yet enforced in v1 — advisory only. Used by the registry to display what a plugin needs. |

---

## 7. Server-side plugin API contracts

These live in a new, **minimal** assembly: `Zeus.Plugin.Contracts`. It has zero NuGet dependencies and references only `Zeus.Contracts` (for DTOs already on the wire). This keeps the API surface stable independently of Zeus core churn.

### 7.1 Base interface — every plugin implements this

```csharp
public interface IZeusPlugin
{
    string Id { get; }                          // must match manifest "id"
    string Name { get; }
    string Version { get; }

    /// Called once by the host after the ALC loads the assembly.
    /// <paramref name="host"/> is the only legal way for a plugin to
    /// call back into Zeus — it must not use reflection to reach internals.
    void Initialize(IZeusPluginHost host);

    /// Called before unload. Plugin must release all references it holds
    /// to <see cref="IZeusPluginHost"/> and any Zeus-owned resources.
    void Shutdown();
}
```

### 7.2 Plugin host (what Zeus provides to plugins)

```csharp
public interface IZeusPluginHost
{
    // Logging
    ILogger CreateLogger(string category);

    // Settings — scoped to the plugin's own namespace
    T? GetSetting<T>(string key);
    void SaveSetting<T>(string key, T value);

    // SignalR hub — allows plugin to push frames to the frontend
    // Plugin may only push frames whose type is declared in its manifest.
    // (v1: advisory; v2: enforced.)
    void PushFrame(object frame);

    // DSP insertion — only available if plugin has "dsp.stage" permission
    IDspStageRegistration? RegisterDspStage(IDspStagePlugin stage);

    // Radio state — read-only snapshot; no direct mutation
    IRadioStateSnapshot RadioState { get; }

    // Sub-plugin extension point — allows plugins to expose their own
    // IPluginExtensionPoint so other plugins can contribute to them
    void RegisterExtensionPoint<T>(T point) where T : IPluginExtensionPoint;
    T? GetExtensionPoint<T>() where T : IPluginExtensionPoint;
}
```

### 7.3 DSP stage plugin

```csharp
public interface IDspStagePlugin : IZeusPlugin
{
    string StageName { get; }

    /// Called on the DSP thread for each RX block. <paramref name="channelId"/>
    /// matches the IDspEngine channel. Return value: true if samples were
    /// modified, false if pass-through (allows bypass short-circuit).
    bool ProcessRxBlock(int channelId, Span<float> iqInterleaved);

    /// Called on the TX thread per mic block (same cadence as IDspEngine.ProcessTxBlock).
    bool ProcessTxBlock(Span<float> micSamples);
}

public interface IDspStageRegistration : IDisposable
{
    void SetEnabled(bool enabled);
    void SetBypass(bool bypass);
}
```

### 7.4 Amp vendor plugin (the nested model)

The amp manager itself is an optional plugin (`Zeus.Plugins.AmpManager`). It exposes an extension point that amp vendor plugins contribute to. This is the "plugin for a plugin" model:

```csharp
// IZeusPluginHost.GetExtensionPoint<IAmpManagerExtensionPoint>() returns this
// when the AmpManager plugin is loaded.
public interface IAmpManagerExtensionPoint : IPluginExtensionPoint
{
    void RegisterAmpProfile(IAmpProfile profile);
    void UnregisterAmpProfile(string ampId);
}

public interface IAmpProfile
{
    string AmpId { get; }               // e.g., "com.elecraft.kxpa100"
    string DisplayName { get; }         // "Elecraft KXPA100"
    int MaxWatts { get; }
    IEnumerable<IBandGainEntry> BandGains { get; }
    // Optional: vendor-specific control surface (React component id)
    string? ControlWidgetId { get; }
}
```

An amp vendor ships a tiny plugin that calls `host.GetExtensionPoint<IAmpManagerExtensionPoint>()?.RegisterAmpProfile(...)` in `Initialize`. If the AmpManager plugin is not loaded, the `GetExtensionPoint` call returns null and the vendor plugin gracefully no-ops.

### 7.5 Widget plugin (server-side registration)

A plugin that serves frontend UI doesn't need a separate server interface beyond `IZeusPlugin`. The server-side job is simply asset serving — `Zeus.PluginHost` maps `/api/plugins/{id}/assets/` to the plugin's local directory automatically.

If the plugin also needs to push SignalR frames to its widget, it calls `host.PushFrame(...)` with a frame type that its own frontend code subscribes to.

---

## 8. Plugin host as an optional addon

### The requirement

> "we wish to keep the system requirements to an absolute minimum so ideally even the host would be an addon to Zeus not something that ships by default"

### How to achieve this

Zeus core needs exactly one seam — a null-safe provider that the plugin host fills in when present:

```csharp
// In Zeus.Server/Program.cs (or a new IHostingStartup extension)
// Zero-cost when no plugin host assembly is loaded:
builder.Services.AddSingleton<IPluginHostProvider, NullPluginHostProvider>();
```

`NullPluginHostProvider` does nothing. `Zeus.PluginHost.dll` ships its own `IHostingStartup` that replaces this registration:

```csharp
[assembly: HostingStartup(typeof(Zeus.PluginHost.PluginHostStartup))]

public class PluginHostStartup : IHostingStartup
{
    public void Configure(IWebHostBuilder builder)
    {
        builder.ConfigureServices(services =>
            services.Replace(ServiceDescriptor.Singleton<IPluginHostProvider,
                                               AlcPluginHostProvider>()));
    }
}
```

`IHostingStartup` is a .NET built-in mechanism where an assembly in the startup path can inject itself into the host without any reference in `Zeus.Server.csproj`. The user places `Zeus.PluginHost.dll` next to `Zeus.Server` and sets the `ASPNETCORE_HOSTINGSTARTUPASSEMBLIES` environment variable (or the installer does this). If the DLL is absent, Zeus starts normally with no plugin support.

This means:
- `Zeus.Server.csproj` has **no project reference** to `Zeus.PluginHost`.
- The plugin host is a drop-in DLL. Users who don't want plugins simply don't install it.
- CI and minimal deployments have zero plugin overhead.

---

## 9. Plugin discovery and installation

### Directory layout

```
~/.zeus/plugins/
  com.kb2uka.vst-host/
    manifest.json
    Zeus.Plugins.VstHost.dll
    libasio.dll           (native dep, Windows)
    index.js              (web bundle)
  com.brianbruff.amp-manager/
    manifest.json
    Zeus.Plugins.AmpManager.dll
    index.js
  com.elecraft.kxpa100/  (sub-plugin: amp vendor)
    manifest.json
    Zeus.Plugins.Elecraft.dll
```

### Registry

A GitHub-hosted `registry.json` in the `brianbruff/openhpsdr-zeus-plugins` repository (or a dedicated repo). Format:

```json
{
  "schemaVersion": 1,
  "plugins": [
    {
      "id": "com.kb2uka.vst-host",
      "name": "VST Host",
      "description": "Host VST2 and VST3 effects as DSP stages",
      "author": "KB2UKA",
      "license": "GPL-2.0-or-later",
      "github": "KB2UKA/zeus-vst-host",
      "category": "dsp",
      "tags": ["vst", "dsp", "audio"],
      "versions": [
        {
          "version": "1.0.0",
          "minZeusVersion": "1.0.0",
          "assets": {
            "windows-x64":  { "url": "https://...", "sha256": "abc123" },
            "linux-x64":    { "url": "https://...", "sha256": "def456" },
            "osx-arm64":    { "url": "https://...", "sha256": "ghi789" }
          }
        }
      ]
    }
  ]
}
```

### Security model

Per the maintainer's decision:
- Zeus runs a SHA-256 checksum against the registry-listed hash on every install and update.
- Hosting in the official registry is voluntary; the registry maintainer (project team) may remove entries that are reported as malicious.
- **Manual sideload**: users can place any `manifest.json`-compliant plugin folder in `~/.zeus/plugins/` without registry involvement. This is not blocked.
- There is no code-signing requirement in v1. This is documented explicitly: "plugins are community-contributed software; run only plugins you trust."
- The `apiPermissions` field in the manifest is advisory in v1; v2 may enforce it via a permission gate at the `IZeusPluginHost` call site.

---

## 10. Resource governance

Given the requirement for minimal overhead and the in-process model:

| Concern | v1 approach |
|---|---|
| **CPU abuse** | Not actively governed. DSP-stage plugins run on the same real-time thread as WDSP; a slow plugin causes audio dropouts — the operator will notice and disable it. |
| **Memory abuse** | Not capped. An ALC can be collected when unloaded, reclaiming its managed heap. Native leaks are the plugin author's problem. |
| **Crash (managed)** | The host wraps each plugin lifecycle call and DSP stage dispatch in `try/catch`. A managed exception disables the plugin and logs a structured error; Zeus continues. |
| **Crash (native)** | A native crash in a plugin DLL crashes `Zeus.Server`. This is the stated risk of native plugins (same as WDSP today). The VST host plugin can implement per-VST crash guards internally. |
| **Safe mode** | `--no-plugins` CLI flag (or `ZEUS_NO_PLUGINS=1` env var) skips all ALC loads. The plugin host DLL itself checks this flag before registering. |
| **Startup time** | Plugins load in parallel after the core services are live; they do not block radio connect. |

---

## 11. Cross-platform notes

| Platform | ALC loading | Native deps (VST etc.) | ES module serving |
|---|---|---|---|
| Windows x64 | Works; NativeLibraryResolver maps `.dll` | Standard `LoadLibrary` path | Standard |
| Linux x64 | Works; `libdl` via `dlopen` under the hood | `.so` resolved by the ALC's native resolver | Standard |
| macOS arm64 / x64 | Works | `.dylib` resolved normally | Standard |

Plugin packages ship per-platform native binaries under `assets/{rid}/`. The host ALC picks the right folder using `RuntimeInformation.RuntimeIdentifier`. Purely managed plugins ship once for all platforms.

---

## 12. VST host plugin — specific notes (issue #106)

This is the most complex first plugin because it combines:
1. A server-side .NET plugin that dynamically loads VST2/VST3 native DLLs.
2. DSP stage insertion into the WDSP pipeline between RXA/TXA stages.
3. A frontend widget for parameter control (VST editor window, or a Zeus-native parameter panel).

Key implementation constraints:

- **VST2 on Windows**: `LoadLibrary` → `VSTPlugMain` → `AudioMasterCallback`. Straightforward P/Invoke; Zeus already has a WDSP P/Invoke pattern to copy.
- **VST2 on Linux/macOS**: Standard `dlopen`; same ABI as Windows but calling convention is cdecl not stdcall.
- **VST3**: Component model (IComponent, IAudioProcessor interfaces). More complex; may be a Phase 2 target.
- **Audio thread safety**: VST2's `processReplacing` must be called on the audio thread, not a background thread. The `IDspStagePlugin.ProcessRxBlock` callback already arrives on the DSP thread — this is correct.
- **GUI editor**: VST editor windows (`effEditOpen`) are native HWND/NSView handles. In Zeus's headless server model the radio backend has no window handle. The recommended path is parameter-scrape only (bypass native editor, expose parameters as a React panel). Native editor support would require embedding a window handle from the Electron wrapper or a separate native UI host — this is red-light scope for v1.

---

## 13. Phased delivery plan

### Phase 0 — Core seam (minimal, required) — ~3 days

- New `Zeus.Plugin.Contracts` project: `IZeusPlugin`, `IZeusPluginHost`, `IDspStagePlugin`, `IPluginExtensionPoint`, `PluginManifest`.
- `IPluginHostProvider` / `NullPluginHostProvider` registered in `Zeus.Server`. No behavior change.
- `docs/proposals/plugins.md` (this document).
- **No new NuGet packages. Zero user-visible change.**

### Phase 1 — Plugin host addon — ~1 week

- New `Zeus.PluginHost` project (not referenced by `Zeus.Server.csproj`).
- `IHostingStartup` wiring, `AlcPluginHostProvider`, plugin directory scanning, manifest parsing.
- `--no-plugins` flag.
- Plugin settings page stub in `zeus-web` (installed list, enable/disable toggle).
- Ship as a separately installable DLL + install script.

### Phase 2 — Amp Manager plugin — ~1 week

- `Zeus.Plugins.AmpManager` as the first reference plugin.
- Replaces/extends the static `PaDefaults.cs` table with a dynamic registration model.
- Exposes `IAmpManagerExtensionPoint` for vendor sub-plugins.
- Demonstrates the nested plugin model end-to-end.

### Phase 3 — UI widget loading — ~3 days

- Frontend plugin loader: fetch plugin list from `/api/plugins`, dynamic `import()` of each `webBundle`.
- `useZeus()` context hook available to plugin components.
- Plugin panels appear in the "Add Panel" modal (they integrate into the existing `PANELS` registry).

### Phase 4 — Registry — ~3 days

- GitHub-hosted `registry.json` in a dedicated repo.
- Plugin browser page in Zeus settings (list, search, install, update, remove).
- SHA-256 checksum verification on install.

### Phase 5 — VST host plugin — ~2–4 weeks (KB2UKA lead)

- `Zeus.Plugins.VstHost` as a separate repository.
- VST2 in-process loading, DSP stage insertion.
- Parameter panel React widget.
- Windows x64 first; Linux/macOS follow-up.

---

## 14. Items requiring maintainer decision (red-light per `CLAUDE.md`)

1. **New assembly `Zeus.Plugin.Contracts`** — adds a new project to the solution. OK to proceed with Phase 0?
2. **`IHostingStartup` mechanism vs. explicit config** — `ASPNETCORE_HOSTINGSTARTUPASSEMBLIES` is set per-deployment (installer or user). Alternative: a `Zeus.Server` appsettings key pointing at plugin host paths. Which is preferred?
3. **Plugin directory location** — `~/.zeus/plugins/` (user-level) vs. next to the `Zeus.Server` binary (system-level) vs. both. Maintainer call.
4. **Registry governance** — who approves PRs to the registry? Should the registry be in this repo (subpath `plugins/registry.json`) or a separate `openhpsdr-zeus-plugins` repo?
5. **`apiPermissions` enforcement** — advisory (v1, document-only) or should even v1 prompt the user at install time when a plugin requests elevated permissions (e.g., `dsp.stage`, `native.load`)?
6. **VST editor window** — parameter-scrape only (no native window), or is there a Electron/Tauri wrapper planned that would provide a window handle? This determines VST3 GUI feasibility.
7. **AmpManager timeline** — should Phase 2 (AmpManager) land before or after Phase 1 (plugin host)? It could also be bundled as the first demo plugin in the Phase 1 PR.

---

## 15. What we explicitly are NOT doing

- **Out-of-process plugin host** (VS Code model): eliminates the latency budget for DSP-path plugins.
- **WASM sandbox**: immature .NET WASM story for native DLL interop; VST host is impossible.
- **Compile-time-only integration**: the current state, explicitly what we're moving away from.
- **Plugin marketplace with code signing**: too much infrastructure for the community size. SHA-256 checksum + registry PR review is sufficient.
- **CPU/RAM hard limits per plugin** (cgroups, job objects): too much OS-level plumbing; let audio dropouts and OOM be the natural governor.
