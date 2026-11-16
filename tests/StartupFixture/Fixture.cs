using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.DI;
using SPTarkov.Server.Core.Models.Common;
using SPTarkov.Server.Core.Models.Spt.Mod;
using SPTarkov.Server.Core.Models.Spt.Tables;
using Version = SemanticVersioning.Version;
using Range = SemanticVersioning.Range;

namespace AmmoGraph.StartupFixture;

// Only install temporarily in a disposable test run. Never ship this assembly with the mod.
public record Metadata : IModMetadata
{
    public string ModGuid { get; init; } = "com.acksberg.ammograph.startup-test";
    public string Name { get; init; } = "AmmoGraph startup TEST fixture";
    public string Author { get; init; } = "AcksBerg";
    public List<string>? Contributors { get; init; }
    public Version Version { get; init; } = new("0.1.0");
    public Range SptVersion { get; init; } = new(">=4.1.6 <4.2.0");
    public bool HasPrepatcher { get; init; }
    public List<string>? Incompatibilities { get; init; }
    public Dictionary<string, Range>? ModDependencies { get; init; }
    public string? Url { get; init; }
    public string License { get; init; } = "MIT";
}

[Injectable(InjectionType.Singleton, OnLoadOrder.GameCallbacks + 1)]
public sealed class AddTestCaliber(TemplateTable templates) : IOnLoad
{
    public static readonly MongoId Id = new("a77aa77aa77aa77aa77aa77a");
    public Task OnLoadAsync(CancellationToken cancellationToken)
    {
        var original = templates.Items.Values.First(i => i.Properties?.AmmoType == "bullet" && i.Properties.Caliber == "Caliber545x39");
        templates.Items.Add(Id, original with { Id = Id, Name = "AmmoGraph startup fixture", Properties = original.Properties! with { Name = "AmmoGraph startup fixture", Caliber = "CaliberTest777x42", Damage = 111, ProjectileCount = 1 } });
        return Task.CompletedTask;
    }
}

[Injectable(InjectionType.Singleton, OnLoadOrder.PostLoad + 1)]
public sealed class ModifyAmmoLate(TemplateTable templates) : IOnLoad
{
    public Task OnLoadAsync(CancellationToken cancellationToken)
    {
        templates.Items[AddTestCaliber.Id].Properties!.Damage = 777;
        return Task.CompletedTask;
    }
}
