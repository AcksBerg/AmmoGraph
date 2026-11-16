namespace AmmoGraph.Core;

public sealed record AmmoBlock(string TemplateId, int Count);
public sealed record MagazineRecipe(AmmoBlock? Start, AmmoBlock[] Middle, AmmoBlock? End)
{
    public static MagazineRecipe Empty => new(null, [], null);
    public string[] Expand()
    {
        var middle = Middle ?? [];
        if (middle.Length is < 1 or > 30 || middle.Any(b => b is null || string.IsNullOrEmpty(b.TemplateId) || b.Count is < 1 or > 30)
            || new[] { Start, End }.Any(b => b is not null && (string.IsNullOrEmpty(b.TemplateId) || b.Count is < 1 or > 29))
            || (Start?.Count ?? 0) + (End?.Count ?? 0) > 29)
            throw new SimulationException("SimInvalidMagazine");
        var sequence = new List<string>(30);
        if (Start is { } start) sequence.AddRange(Enumerable.Repeat(start.TemplateId, start.Count));
        var stop = 30 - (End?.Count ?? 0);
        while (sequence.Count < stop)
            foreach (var block in middle)
                sequence.AddRange(Enumerable.Repeat(block.TemplateId, Math.Min(block.Count, stop - sequence.Count)));
        if (End is { } end) sequence.AddRange(Enumerable.Repeat(end.TemplateId, end.Count));
        return sequence.ToArray();
    }
}

public enum HitZone { Front, Back, Left, Right }
public sealed record SimulatorDraft(string CaliberId, MagazineRecipe Magazine, string? ArmorId,
    Dictionary<string, string?> Slots, HitZone Zone = HitZone.Front, int Seed = 12345);
public sealed class SimulatorWorkspace
{
    public Dictionary<string, SimulatorDraft> Drafts { get; } = new(StringComparer.Ordinal);
    public Dictionary<string, SimulationResult> Results { get; } = new(StringComparer.Ordinal);
    public SimulatorDraft Get(string caliber) => Drafts.TryGetValue(caliber, out var value) ? value
        : Drafts[caliber] = new(caliber, MagazineRecipe.Empty, null, new());
}
public sealed class SimulationException(string key, string? detail = null) : Exception(detail ?? key)
{
    public string Key { get; } = key;
}
public sealed record SimAmmo(string Id, string Caliber, float Damage, float Penetration, float Deviation,
    float ArmorDamage, int Projectiles, float FragmentationChance, int MinFragments, int MaxFragments, float PenetrationDamageMod);
public sealed record ArmorPart(string Id, string Name, int Class, string Material, float Maximum,
    float BluntThroughput, string[] BodyColliders, string[] PlateColliders, string[] Conflicts);
public sealed record ArmorSlot(string Id, bool Locked, bool Required, bool ReduceBlunt, string? DefaultPart,
    string[] AllowedParts, string[] BodyColliders, string[] PlateColliders);
public sealed record ArmorCarrier(string Id, string Name, ArmorSlot[] Slots, string? OwnPart);
public sealed record BodyBallistics(float Level, float Chance, float DamageMod);
public sealed record ProtectionLayer(string Id, string TemplateId, string Slot, bool Locked, float Maximum,
    float Resistance, float Destructibility, float BluntThroughput, bool ReduceBlunt,
    string[] BodyColliders, string[] PlateColliders);
public sealed record SimulationRequest(SimulatorDraft Draft, int Runs = 2000);
public sealed record ExampleShot(bool Penetrated, float Damage, float BluntDamage, string? BlockedBy,
    float[] Before, float[] After, int Fragments);
public sealed record ShotStatistics(int Shot, string AmmoId, double PenetrationPercent, double Damage,
    double BluntDamage, double[] Durability, ExampleShot Example);
public sealed record SimulationResult(SimulatorDraft Draft, int Runs, ProtectionLayer[] Layers,
    ShotStatistics[] Shots, string[] Assumptions)
{
    public double TotalDamage => Shots.Sum(s => s.Damage);
}
