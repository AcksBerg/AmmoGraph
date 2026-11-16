namespace AmmoGraph.Core;

public sealed record AmmoBlock(string TemplateId, int Count);
public sealed record MagazineRecipe(AmmoBlock? Start, AmmoBlock[] Middle, AmmoBlock? End, int Capacity = 30)
{
    public static MagazineRecipe Empty => new(null, [], null);
    public MagazineRecipe WithCapacity(int capacity)
    {
        capacity = Math.Clamp(capacity, 1, 100);
        var start = Start is { } first && capacity > 1 ? first with { Count = Math.Clamp(first.Count, 1, capacity - 1) } : null;
        var endSpace = capacity - 1 - (start?.Count ?? 0);
        var end = End is { } last && endSpace > 0 ? last with { Count = Math.Clamp(last.Count, 1, endSpace) } : null;
        return this with { Capacity = capacity, Start = start, End = end };
    }
    public string[] Expand()
    {
        var middle = Middle ?? [];
        if (Capacity is < 1 or > 100 || middle.Length is < 1 or > 100 || middle.Any(b => b is null || string.IsNullOrEmpty(b.TemplateId) || b.Count is < 1 or > 100)
            || new[] { Start, End }.Any(b => b is not null && (string.IsNullOrEmpty(b.TemplateId) || b.Count < 1 || b.Count >= Capacity))
            || (Start?.Count ?? 0) + (End?.Count ?? 0) >= Capacity)
            throw new SimulationException("SimInvalidMagazine");
        var sequence = new List<string>(Capacity);
        if (Start is { } start) sequence.AddRange(Enumerable.Repeat(start.TemplateId, start.Count));
        var stop = Capacity - (End?.Count ?? 0);
        while (sequence.Count < stop)
            foreach (var block in middle)
                sequence.AddRange(Enumerable.Repeat(block.TemplateId, Math.Min(block.Count, stop - sequence.Count)));
        if (End is { } end) sequence.AddRange(Enumerable.Repeat(end.TemplateId, end.Count));
        return sequence.ToArray();
    }
}

public enum HitZone { Front, Back, Left, Right }
public sealed record SimulatorDraft(string CaliberId, MagazineRecipe Magazine, string? ArmorId,
    Dictionary<string, string?> Slots, HitZone Zone = HitZone.Front, int Seed = 12345, double PelletHitPercent = 100);
public sealed class SimulatorWorkspace
{
    public Dictionary<string, SimulatorDraft> Drafts { get; } = new(StringComparer.Ordinal);
    public Dictionary<string, SimulationResult> Results { get; } = new(StringComparer.Ordinal);
    private SimulatorDraft? _equipment;
    public SimulatorDraft Get(string caliber)
    {
        var draft = Drafts.TryGetValue(caliber, out var value) ? value : new(caliber, MagazineRecipe.Empty, null, new());
        // Equipment, capacity, and pellet accuracy are shared; ammunition patterns remain independent.
        if (_equipment is { } equipment)
            draft = draft with { ArmorId = equipment.ArmorId, Slots = new(equipment.Slots), Zone = equipment.Zone,
                Magazine = draft.Magazine.Capacity == equipment.Magazine.Capacity ? draft.Magazine : draft.Magazine.WithCapacity(equipment.Magazine.Capacity),
                PelletHitPercent = equipment.PelletHitPercent };
        return Drafts[caliber] = draft;
    }
    public void Update(SimulatorDraft draft)
    {
        _equipment = draft with { Slots = new(draft.Slots) };
        Drafts[draft.CaliberId] = draft;
    }
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
public sealed record ArmorCarrier(string Id, string Name, ArmorSlot[] Slots, string? OwnPart)
{
    public bool OnlyFixedInsert => Slots.All(s => s.Locked);
}
public sealed record BodyBallistics(float Level, float Chance, float DamageMod);
public sealed record ProtectionLayer(string Id, string TemplateId, string Slot, bool Locked, float Maximum,
    float Resistance, float Destructibility, float BluntThroughput, bool ReduceBlunt,
    string[] BodyColliders, string[] PlateColliders);
public sealed record SimulationRequest(SimulatorDraft Draft, int Runs = 2000);
public sealed record ExampleShot(bool Penetrated, float Damage, float BluntDamage, string? BlockedBy,
    float[] Before, float[] After, int Fragments, int PelletHits = 1);
public sealed record ShotStatistics(int Shot, string AmmoId, double PenetrationPercent, double Damage,
    double BluntDamage, double[] Durability, ExampleShot Example, double MeanPelletHits = 1);
public sealed record SimulationResult(SimulatorDraft Draft, int Runs, ProtectionLayer[] Layers,
    ShotStatistics[] Shots, string[] Assumptions)
{
    public double TotalDamage => Shots.Sum(s => s.Damage);
    public const double ChestHealth = 85;
    public int? MeanDeathShot
    {
        get
        {
            var cumulative = 0d;
            foreach (var shot in Shots)
            {
                cumulative += shot.Damage;
                if (cumulative >= ChestHealth) return shot.Shot;
            }
            return null;
        }
    }
}
