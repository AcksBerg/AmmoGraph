using SPTarkov.Server.Core.Models.Spt.Mod;
using SPTarkov.Server.Web;
using Version = SemanticVersioning.Version;
using Range = SemanticVersioning.Range;

namespace AmmoGraph;

public record Metadata : IModMetadata, IModBlazorMetadata
{
    public string ModGuid { get; init; } = "com.acksberg.ammograph";
    public string Name { get; init; } = "AmmoGraph";
    public string Author { get; init; } = "AcksBerg";
    public List<string>? Contributors { get; init; }
    public Version Version { get; init; } = new("0.25.1");
    public Range SptVersion { get; init; } = new(">=4.1.4");
    public bool HasPrepatcher { get; init; } = false;
    public List<string>? Incompatibilities { get; init; }
    public Dictionary<string, Range>? ModDependencies { get; init; }
    public string? Url { get; init; } = "https://github.com/AcksBerg/SPTRealismAmmoGraph";
    public string License { get; init; } = "MIT";
    public string? WWWRootUrl { get; init; } = "ammo-graph";
    public string? HomePage { get; init; } = "/AmmoGraph";
    public string? HomePageDescription { get; init; } = "Compare loaded ammunition and simulate magazine effects on armor.";
}
