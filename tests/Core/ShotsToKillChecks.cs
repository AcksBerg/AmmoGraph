using AmmoGraph.Core;
using System.Collections.Frozen;
using System.Globalization;

static class ShotsToKillChecks
{
    private static void Check(bool value, string message)
    { if (!value) throw new Exception(message); Console.WriteLine("PASS " + message); }
    private static ShotsToKillResult Aggregate(int successes, int shots = 2)
        => ShotsToKillResult.Aggregate(Enumerable.Range(0, 10).Select(i => i < successes ? (int?)shots : null).ToArray());

    public static void Run(SimulationCatalog loaded)
    {
        var capped = Aggregate(7);
        Check(capped.State == ShotsToKillState.Capped && capped.Shots is null && capped.SuccessfulRuns == 7,
            "Exactly 7 successful runs is capped without a numeric mean");
        foreach (var count in new[] { 8, 9, 10 })
        {
            var result = Aggregate(count);
            Check(result.State == ShotsToKillState.Success && result.Shots == 2 && result.SuccessfulRuns == count,
                $"Exactly {count} successful runs produces a positive integer");
        }
        Check(ShotsToKillResult.Aggregate([1, 1, 1, 1, 1, 1, 1, 2, null, null]).Shots == 2,
            "Unsuccessful runs are excluded and fractional successful averages round upward");
        Check(Aggregate(8, 100).Shots == 100 && Aggregate(0).State == ShotsToKillState.Capped,
            "Kills on shot 100 succeed while ten unfinished runs have no numeric metric");

        var profileCatalog = new SimulationCatalog
        {
            Parts = new[]
            {
                new ArmorPart("a", "a", 2, "a", 30, .1f, ["RibcageUp"], [], []),
                new ArmorPart("b", "b", 2, "b", 90, .3f, [], ["Plate_Granit_SAPI_chest"], []),
                new ArmorPart("class10", "class10", 10, "a", 500, .5f, [], ["Plate_Granit_SAPI_chest"], []),
                new ArmorPart("invalid", "invalid", 2, "missing", 999, .9f, [], [], [])
            }.ToFrozenDictionary(p => p.Id),
            Materials = new Dictionary<string, float> { ["a"] = .2f, ["b"] = .8f }.ToFrozenDictionary(),
            Resistances = [0, 10, 27, 30, 40, 50, 60, 70, 80, 90, 100]
        };
        var referenceProfiles = ShotsToKillEvaluation.BuildProfiles(profileCatalog);
        Check(referenceProfiles.All(p => p.Class != 10), "Armor class 10 is excluded even with valid protection data and configured resistance");
        var synthetic = referenceProfiles.Single();
        Check(synthetic.Class == 2 && synthetic.ComponentCount == 2 && synthetic.Layer.Maximum == 60
            && Math.Abs(synthetic.Layer.Destructibility - .5) < .00001 && Math.Abs(synthetic.Layer.BluntThroughput - .2) < .00001
            && synthetic.Layer.Resistance == 27 && !synthetic.Layer.ReduceBlunt && synthetic.Layer.BodyColliders.Length == 0
            && synthetic.Layer.PlateColliders.SequenceEqual(new[] { "Plate_Granit_SAPI_chest" }),
            "Reference armor averages valid components and resolved materials, retains class resistance, and has one frontal layer");

        var layer = synthetic.Layer with { Maximum = 1_000_000, Resistance = 100, Destructibility = 0, BluntThroughput = 1 };
        var testAmmo = new SimAmmo("test", "test", 4.25f, 0, 0, 0, 1, 0, 0, 0, 0, false);
        var minimal = new SimulationCatalog { Bodies = new Dictionary<string, BodyBallistics> { ["RibcageUp"] = new(0, 0, 0) }.ToFrozenDictionary() };
        var hundred = BallisticsEngine.EvaluateShotsToKill(minimal, testAmmo, layer);
        var unfinished = BallisticsEngine.EvaluateShotsToKill(minimal, testAmmo with { Damage = 4.24f }, layer);
        Check(hundred.Shots == 100 && hundred.SuccessfulRuns == 10, "Batch evaluation counts exact shot-100 kills");
        Check(unfinished.State == ShotsToKillState.Capped && unfinished.SuccessfulRuns == 0 && unfinished.Shots is null,
            "Batch evaluation never fires shot 101 or treats survival after shot 100 as a kill");
        Check(BallisticsEngine.EvaluateShotsToKill(minimal, testAmmo with { Damage = 500, Projectiles = 8 }, layer).Shots == 1,
            "Batch evaluation immediately stops when immediate chest damage reaches 85 HP");
        Check(BallisticsEngine.EvaluateShotsToKill(minimal, testAmmo with { Projectiles = 8 }, layer) == hundred,
            "Single-projectile ammunition always has one hit per shot");

        var buckshotProbe = testAmmo with { Damage = 5, Projectiles = 8, IsBuckshot = true };
        var sampled = BallisticsEngine.EvaluateShotsToKill(minimal, buckshotProbe, layer);
        Check(sampled == FullSimulationKills(minimal, buckshotProbe, layer, 75)
            && sampled.Shots != FullSimulationKills(minimal, buckshotProbe, layer, 100).Shots,
            "Buckshot batch uses the existing 75% PelletHits sampler rather than all pellets or scaled damage");

        var evaluation = ShotsToKillEvaluation.Compute(loaded);
        Check(evaluation.Profiles.Count > 0 && evaluation.Results.Count == loaded.Ammo.Count,
            "Batch evaluates each loaded ammunition template and every eligible armor class");
        foreach (var armor in evaluation.Profiles)
        {
            var buckshot = loaded.Ammo.Values.First(a => a.IsBuckshot && a.Projectiles > 1 && a.Damage > 0);
            var bullet = loaded.Ammo.Values.First(a => !a.IsBuckshot && a.Damage > 0 && a.Penetration > 20);
            foreach (var ammo in new[] { bullet, buckshot })
            {
                var full = FullSimulationKills(loaded, ammo, armor.Layer, 75);
                var actual = evaluation.Results[ammo.Id][ShotsToKillEvaluation.Prefix + armor.Class];
                Check(actual == full, $"Optimized class-{armor.Class} { (ammo.IsBuckshot ? "buckshot at 75% sampled pellet hits" : "bullet") } matches ten independent full simulator runs");
                Check(BallisticsEngine.EvaluateShotsToKill(loaded, ammo, armor.Layer) == actual,
                    "Batch results are deterministic on repeated evaluation");
            }
        }

        var sample = new AmmoSnapshot("en", [new("sample", "sample", "c", "c", false, FrozenDictionary<string, double?>.Empty)], []);
        var template = loaded.Ammo.Keys.First();
        sample = sample with { Items = [sample.Items[0] with { Id = template }, sample.Items[0] with { Id = template + ":pellet", IsPellet = true }] };
        var en = evaluation.Attach(sample);
        var de = evaluation.Attach(sample with { Language = "de" });
        Check(ReferenceEquals(en.Items[0].ShotsToKill, de.Items[0].ShotsToKill)
            && ReferenceEquals(en.Items[0].ShotsToKill, en.Items[1].ShotsToKill),
            "Visitors, languages and pellet display variants share template-level results");

        foreach (var metric in en.Metrics)
        {
            AmmoEntry Entry(ShotsToKillResult? result) => sample.Items[0] with
            { ShotsToKill = result is null ? null : new Dictionary<string, ShotsToKillResult> { [metric.Key] = result } };
            var low = Entry(Aggregate(10, 1)); var high = Entry(Aggregate(10, 100));
            var cap = Entry(capped); var failed = Entry(ShotsToKillResult.Failed); var missing = Entry(null);
            var comparer = ShotsToKillEvaluation.Comparer(metric.Key);
            Check(comparer.Compare(low, high) < 0 && comparer.Compare(high, cap) < 0 && comparer.Compare(cap, cap) == 0,
                "Numeric sorting ranks lower kills first, successful 100 before capped, capped equal");
            Check(new[] { cap, high, low }.OrderBy(a => a, comparer).SequenceEqual(new[] { low, high, cap })
                && new[] { low, cap, high }.OrderByDescending(a => a, comparer).SequenceEqual(new[] { cap, high, low }),
                "Both sort directions preserve distinct successful and capped rankings");
            Check(AmmoComparison.Create(high, low, metric.Key) is { Tone: "better", Delta: -99, Arrow: "↓" }
                && AmmoComparison.Create(low, high, metric.Key) is { Tone: "worse", Delta: 99, Arrow: "↑" }
                && AmmoComparison.Create(cap, high, metric.Key) is { Tone: "better", HasNumericDelta: false }
                && AmmoComparison.Create(high, cap, metric.Key) is { Tone: "worse", HasNumericDelta: false }
                && AmmoComparison.Create(cap, cap, metric.Key) is { Tone: "neutral", Arrow: "=" },
                "All comparison directions implement lower-is-better including capped transitions and equality");
            Check(AmmoComparison.Create(cap, failed, metric.Key) is null && AmmoComparison.Create(low, missing, metric.Key) is null
                && SnapshotBuilder.Value(cap, metric.Key) is null && SnapshotBuilder.Value(high, metric.Key) == 100
                && ShotsToKillEvaluation.Display(cap, metric.Key, CultureInfo.InvariantCulture) == "100+"
                && ShotsToKillEvaluation.Display(failed, metric.Key, CultureInfo.InvariantCulture) == "—"
                && ShotsToKillEvaluation.Display(low, metric.Key, CultureInfo.InvariantCulture) == "1",
                "Graph coordinates and displays distinguish numeric, capped, failed and missing states");
        }
    }

    private static ShotsToKillResult FullSimulationKills(SimulationCatalog catalog, SimAmmo ammo, ProtectionLayer layer, double hitRate)
    {
        var part = new ArmorPart("reference", "reference", 1, "reference", layer.Maximum, layer.BluntThroughput, [], layer.PlateColliders, []);
        var full = new SimulationCatalog
        {
            Ammo = new[] { ammo }.ToFrozenDictionary(a => a.Id),
            Parts = new[] { part }.ToFrozenDictionary(p => p.Id),
            Carriers = new[] { new ArmorCarrier("reference", "reference", [], "reference") }.ToFrozenDictionary(c => c.Id),
            Materials = new Dictionary<string, float> { ["reference"] = layer.Destructibility }.ToFrozenDictionary(),
            Resistances = [0, layer.Resistance], Bodies = catalog.Bodies, SoftArmorBluntModifier = catalog.SoftArmorBluntModifier
        };
        var kills = new int?[10];
        var completeMagazines = true;
        for (var run = 0; run < 10; run++)
        {
            var draft = new SimulatorDraft(ammo.Caliber, new(null, [new(ammo.Id, 1)], null, 100), "reference", new(),
                HitZone.Front, unchecked(12345 + run * 104729), hitRate);
            var result = BallisticsEngine.Run(full, new(draft, 1));
            kills[run] = result.MeanDeathShot;
            completeMagazines &= result.Shots.Length == 100;
        }
        Check(completeMagazines, "Interactive simulator retains every complete magazine after a kill");
        return ShotsToKillResult.Aggregate(kills);
    }
}
