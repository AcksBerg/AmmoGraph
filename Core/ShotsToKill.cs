using System.Collections.Frozen;
using System.Globalization;

namespace AmmoGraph.Core;

public enum ShotsToKillState { Success, Capped, Failed }

public sealed record ShotsToKillResult
{
    public ShotsToKillState State { get; }
    public int? Shots { get; }
    public int SuccessfulRuns { get; }
    private ShotsToKillResult(ShotsToKillState state, int? shots, int successes)
        => (State, Shots, SuccessfulRuns) = (state, shots, successes);
    public static ShotsToKillResult Failed { get; } = new(ShotsToKillState.Failed, null, 0);
    public static ShotsToKillResult Aggregate(IReadOnlyList<int?> runs)
    {
        if (runs.Count != 10 || runs.Any(n => n is < 1 or > 100)) throw new ArgumentException("Expected ten runs with kills in shots 1-100 or null for no kill.", nameof(runs));
        var successes = runs.Count(n => n.HasValue);
        return successes >= 8
            ? new(ShotsToKillState.Success, (int)Math.Ceiling(runs.Where(n => n.HasValue).Average(n => n!.Value)), successes)
            : new(ShotsToKillState.Capped, null, successes);
    }
}

public sealed record ReferenceArmor(int Class, int ComponentCount, ProtectionLayer Layer);

public sealed class ShotsToKillEvaluation
{
    public const string Prefix = "ShotsToKillClass";
    public static bool IsMetric(string key) => key.StartsWith(Prefix, StringComparison.Ordinal);
    public IReadOnlyList<ReferenceArmor> Profiles { get; }
    public FrozenDictionary<string, FrozenDictionary<string, ShotsToKillResult>> Results { get; }
    private ShotsToKillEvaluation(IReadOnlyList<ReferenceArmor> profiles, FrozenDictionary<string, FrozenDictionary<string, ShotsToKillResult>> results)
        => (Profiles, Results) = (profiles, results);

    public static ReferenceArmor[] BuildProfiles(SimulationCatalog catalog)
        => catalog.Parts.Values.Where(p => p.Class > 0 && p.Class != 10 && p.Class < catalog.Resistances.Length
            && float.IsFinite(catalog.Resistances[p.Class]) && catalog.Resistances[p.Class] > 0
            && float.IsFinite(p.Maximum) && p.Maximum > 0
            && float.IsFinite(p.BluntThroughput) && p.BluntThroughput is >= 0 and <= 1
            && catalog.Materials.TryGetValue(p.Material, out var material) && float.IsFinite(material) && material >= 0)
        .OrderBy(p => p.Id, StringComparer.Ordinal).GroupBy(p => p.Class).OrderBy(g => g.Key)
        .Select(g => new ReferenceArmor(g.Key, g.Count(), new ProtectionLayer(Prefix + g.Key, Prefix + g.Key, "reference", false,
            (float)g.Average(p => (double)p.Maximum), catalog.Resistances[g.Key],
            (float)g.Average(p => (double)catalog.Materials[p.Material]), (float)g.Average(p => (double)p.BluntThroughput),
            false, [], ["Plate_Granit_SAPI_chest"]))).ToArray();

    public static ShotsToKillEvaluation Compute(SimulationCatalog catalog, CancellationToken cancellation = default)
    {
        var profiles = BuildProfiles(catalog);
        var results = new Dictionary<string, FrozenDictionary<string, ShotsToKillResult>>();
        foreach (var ammo in catalog.Ammo.Values.OrderBy(a => a.Id, StringComparer.Ordinal))
        {
            var metrics = new Dictionary<string, ShotsToKillResult>();
            foreach (var profile in profiles)
            {
                cancellation.ThrowIfCancellationRequested();
                try { metrics[Prefix + profile.Class] = BallisticsEngine.EvaluateShotsToKill(catalog, ammo, profile.Layer, cancellation); }
                catch (SimulationException) { metrics[Prefix + profile.Class] = ShotsToKillResult.Failed; }
            }
            results[ammo.Id] = metrics.ToFrozenDictionary();
        }
        return new(profiles, results.ToFrozenDictionary());
    }

    public AmmoSnapshot Attach(AmmoSnapshot snapshot)
    {
        var text = new UiText(snapshot.Language);
        return snapshot with
        {
            Metrics = snapshot.Metrics.Concat(Profiles.Select(p => new AmmoMetric(Prefix + p.Class,
                text["ShotsToKill"] + " · " + text["ArmorClass"] + " " + p.Class))).ToArray(),
            Items = snapshot.Items.Select(a => a with { ShotsToKill = Results.GetValueOrDefault(a.TemplateId) }).ToArray()
        };
    }

    public static ShotsToKillResult? Result(AmmoEntry ammo, string key) => ammo.ShotsToKill?.GetValueOrDefault(key);
    public static string Display(AmmoEntry ammo, string key, CultureInfo culture)
        => Result(ammo, key) is { } result ? result.State switch
        {
            ShotsToKillState.Success => result.Shots!.Value.ToString("0", culture),
            ShotsToKillState.Capped => "100+",
            _ => "—"
        } : "—";

    // Missing/failed values sort after capped outcomes in ascending order.
    public static IComparer<AmmoEntry> Comparer(string key) => System.Collections.Generic.Comparer<AmmoEntry>.Create((a, b) =>
    {
        var left = Result(a, key); var right = Result(b, key);
        static int Rank(ShotsToKillResult? r) => r?.State switch { ShotsToKillState.Success => 0, ShotsToKillState.Capped => 1, _ => 2 };
        var rank = Rank(left).CompareTo(Rank(right));
        return rank != 0 ? rank : left?.State == ShotsToKillState.Success ? left.Shots!.Value.CompareTo(right!.Shots!.Value) : 0;
    });
}
