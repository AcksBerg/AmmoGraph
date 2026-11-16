namespace AmmoGraph.Core;

/// <summary>
/// Server model of the supplied EFT 4.1 client dump. No client assembly is loaded.
/// Sources: E340.RealResistance, E33F.GetPenetrationChance, ArmorComponent.ApplyDamage,
/// Inventory.GetPutOnArmorsNonAlloc, Player.SetShotStatus/ProceedDamageThroughArmor,
/// BodyPartCollider.IsPenetrated and F16A.E00D/E01C/E01E.
/// Geometry is deliberately idealized: a plate has no extra prefab material loss.
/// </summary>
public static class BallisticsEngine
{
    public static float Resistance(float durability, float maximum, float classResistance)
        => (121f - 5000f / (45f + durability / maximum * 200f)) * classResistance * .01f;

    public static float PenetrationChance(float penetration, float resistance)
    {
        if (resistance >= penetration + 15f) return 0f;
        if (resistance >= penetration) return .4f * MathF.Pow(resistance - penetration - 15f, 2f);
        if (resistance <= penetration - 15f) return 100f;
        return 100f + penetration / (.9f * resistance - penetration);
    }
    public static float DamageFactor(float penetration, float resistance) => Math.Clamp(penetration / (resistance + 12f), .6f, 1f);
    public static float DurabilityLoss(float penetration, float armorDamage, ProtectionLayer layer, float resistance, bool blocked)
        => MathF.Max(1f, penetration * (blocked ? 1f : DamageFactor(penetration, resistance)) * armorDamage
            * Math.Clamp(penetration / layer.Resistance, blocked ? .6f : .5f, blocked ? 1.1f : .9f) * layer.Destructibility);

    // Fixed algorithm, independent of .NET Random changes. Uniforms are shared by
    // every armor check in one collision, as in shot.Randoms.GetRandomFloat(seed).
    public sealed class RandomStream(int seed)
    {
        private ulong _state = unchecked((uint)seed) + 0x9E3779B97F4A7C15UL;
        public float Next()
        {
            _state += 0x9E3779B97F4A7C15UL;
            var z = _state;
            z = (z ^ (z >> 30)) * 0xBF58476D1CE4E5B9UL;
            z = (z ^ (z >> 27)) * 0x94D049BB133111EBUL;
            return ((z ^ (z >> 31)) >> 40) / 16777216f;
        }
        // F161 uses six equal-width bins between -1 and 1 with these masses.
        // This emulates its bounded distribution, not Unity's exact RNG table.
        public float PenetrationDeviation()
        {
            var u = Next();
            var bin = u <= .021f ? 0 : u <= .157f ? 1 : u <= .498f ? 2 : u <= .839f ? 3 : u <= .975f ? 4 : 5;
            return -1f + (bin + Next()) / 3f;
        }
    }

    public static SimulationResult Run(SimulationCatalog catalog, SimulationRequest request,
        IProgress<int>? progress = null, CancellationToken cancellation = default)
    {
        if (request.Runs is < 1 or > 10000) throw new SimulationException("SimInvalidRuns");
        var draft = request.Draft;
        if (!Enum.IsDefined(draft.Zone)) throw new SimulationException("SimUnsupportedCollider");
        var sequence = draft.Magazine.Expand();
        var ammo = sequence.Select(id => catalog.Ammo.GetValueOrDefault(id) ?? throw new SimulationException("SimMissingAmmo", id)).ToArray();
        var caliber = draft.CaliberId.Split(':')[0];
        if (ammo.Any(a => a.Caliber != caliber)) throw new SimulationException("SimMixedCalibers");
        foreach (var a in ammo)
            if (!float.IsFinite(a.Damage) || a.Damage < 0 || !float.IsFinite(a.Penetration) || a.Penetration < 0
                || !float.IsFinite(a.ArmorDamage) || a.ArmorDamage < 0 || !float.IsFinite(a.Deviation) || a.Deviation < 0
                || a.Projectiles is < 1 or > 256 || a.MinFragments < 0 || a.MaxFragments < a.MinFragments || a.MaxFragments > 128
                || !float.IsFinite(a.PenetrationDamageMod) || !float.IsFinite(a.FragmentationChance) || a.FragmentationChance is < 0 or > 1)
                throw new SimulationException("SimMissingAmmoData", a.Id);
        if (!float.IsFinite(catalog.SoftArmorBluntModifier) || catalog.SoftArmorBluntModifier is < 0 or > 1)
            throw new SimulationException("SimMissingArmorData");
        var allLayers = catalog.Resolve(draft);
        var bodyOptions = SimulationCatalog.ZoneBodies(draft.Zone);
        var bodyName = bodyOptions.FirstOrDefault(b => allLayers.Any(l => l.BodyColliders.Contains(b))) ?? bodyOptions[0];
        if (!catalog.Bodies.TryGetValue(bodyName, out var body) || !float.IsFinite(body.Level) || !float.IsFinite(body.Chance) || !float.IsFinite(body.DamageMod))
            throw new SimulationException("SimUnsupportedCollider", bodyName);
        var plateName = SimulationCatalog.KnownPlates.FirstOrDefault(p => SimulationCatalog.PlateInZone(p, draft.Zone) && allLayers.Any(l => l.PlateColliders.Contains(p)));
        var layers = allLayers.Where(l => l.BodyColliders.Contains(bodyName) || (plateName is not null && l.PlateColliders.Contains(plateName))).ToArray();
        var plateIndices = Enumerable.Range(0, layers.Length).Where(i => plateName is not null && layers[i].PlateColliders.Contains(plateName)).ToArray();
        var bodyIndices = Enumerable.Range(0, layers.Length).Where(i => layers[i].BodyColliders.Contains(bodyName)).ToArray();
        var penetrationTotals = new int[30];
        var damageTotals = new double[30];
        var bluntTotals = new double[30];
        var durabilityTotals = Enumerable.Range(0, 30).Select(_ => new double[layers.Length]).ToArray();
        var examples = new ExampleShot[30];
        var random = new RandomStream(draft.Seed);
        for (var run = 0; run < request.Runs; run++)
        {
            cancellation.ThrowIfCancellationRequested();
            var durability = layers.Select(l => l.Maximum).ToArray();
            for (var shotIndex = 0; shotIndex < 30; shotIndex++)
            {
                var round = ammo[shotIndex];
                var before = run == 0 ? durability.ToArray() : [];
                var damage = 0f; var blunt = 0f; var penetrated = false; string? blocker = null; var fragments = 0;
                for (var pellet = 0; pellet < round.Projectiles; pellet++)
                {
                    cancellation.ThrowIfCancellationRequested();
                    var p = MathF.Max(0, round.Penetration + random.PenetrationDeviation() * round.Deviation);
                    Process(round.Damage, p, round.FragmentationChance, 0, true);
                }
                if (!float.IsFinite(damage) || !float.IsFinite(blunt)) throw new SimulationException("SimMissingAmmoData", round.Id);
                penetrationTotals[shotIndex] += penetrated ? 1 : 0;
                damageTotals[shotIndex] += damage; bluntTotals[shotIndex] += blunt;
                for (var i = 0; i < layers.Length; i++) durabilityTotals[shotIndex][i] += durability[i];
                if (run == 0) examples[shotIndex] = new(penetrated, damage, blunt, blocker, before, durability.ToArray(), fragments);

                void Process(float shotDamage, float shotPen, float fragChance, int stage, bool canFragment)
                {
                    if (stage == 0 && !plateIndices.Any(i => durability[i] > 0)) stage = 1;
                    var isPlate = stage == 0;
                    var indices = isPlate ? plateIndices : bodyIndices;
                    var roll = random.Next();
                    var blocked = -1;
                    // SetShotStatus evaluates all checks before applying durability damage.
                    foreach (var i in indices)
                        if (durability[i] > 0 && PenetrationChance(shotPen, Resistance(durability[i], layers[i].Maximum, layers[i].Resistance)) < roll * 100f)
                        { blocked = i; break; }
                    var continuationResistance = indices.Length == 0 ? 0f
                        : Resistance(durability[indices[0]], layers[indices[0]].Maximum, layers[indices[0]].Resistance);
                    var continuationFactor = indices.Length == 0 ? 1f : DamageFactor(shotPen, continuationResistance);
                    var canContinue = blocked < 0 && shotPen * continuationFactor > (isPlate ? 0 : body.Level);
                    var eventDamage = shotDamage;
                    var eventPen = shotPen;
                    var stopped = false;
                    foreach (var i in indices)
                    {
                        var layer = layers[i];
                        if (stopped) { eventDamage *= layer.BluntThroughput; continue; }
                        if (durability[i] <= 0) continue;
                        var r = Resistance(durability[i], layer.Maximum, layer.Resistance);
                        var isBlocker = blocked == i;
                        var loss = DurabilityLoss(eventPen, round.ArmorDamage, layer, r, isBlocker);
                        if (isBlocker)
                        {
                            eventDamage *= layer.BluntThroughput * (layer.ReduceBlunt ? catalog.SoftArmorBluntModifier : 1f)
                                * Math.Clamp(1f - .03f * (r - eventPen), .2f, 1f);
                            stopped = true; blocker ??= layer.Id;
                        }
                        else
                        {
                            if (isPlate) eventDamage = 0;
                            var factor = DamageFactor(eventPen, r);
                            eventDamage *= factor; eventPen *= factor;
                        }
                        durability[i] = MathF.Max(0, durability[i] - loss);
                    }
                    if (!isPlate || blocked >= 0)
                    {
                        damage += eventDamage;
                        if (blocked >= 0) blunt += eventDamage;
                    }
                    if (!isPlate)
                    {
                        if (blocked < 0) penetrated = true;
                        // The modeled path ends at the first body impact. No exit-side or
                        // speculative fragment HP bonus is added after that impact.
                        return;
                    }
                    if (!canContinue) return;
                    if (canFragment && fragChance > roll)
                    {
                        var count = round.MinFragments + (int)(random.Next() * (round.MaxFragments - round.MinFragments));
                        fragments += count;
                        if (count == 0 || round.MaxFragments == 0) return;
                        // F16A.E01C: fragment damage and penetration are divided by MaxFragmentsCount.
                        for (var f = 0; f < count; f++)
                        {
                            var fp = shotPen * .5f / round.MaxFragments;
                            var fd = shotDamage * .5f / round.MaxFragments;
                            var cf = indices.Length == 0 ? 1 : DamageFactor(fp, continuationResistance);
                            Process(fd * cf, fp * cf, 0, 1, false);
                        }
                    }
                    else
                    {
                        // Ideal plate profile: the extra prefab transition multiplier is 1.
                        // F16A creates the continuation while ticking the collision,
                        // before the hit callback applies wear to its copied DamageInfo.
                        var cf = continuationFactor;
                        Process(shotDamage * cf, shotPen * cf, fragChance, 1, canFragment);
                    }
                }
            }
            if ((run + 1) % Math.Max(1, request.Runs / 100) == 0) progress?.Report((run + 1) * 100 / request.Runs);
        }
        var stats = Enumerable.Range(0, 30).Select(i => new ShotStatistics(i + 1, sequence[i], penetrationTotals[i] * 100d / request.Runs,
            damageTotals[i] / request.Runs, bluntTotals[i] / request.Runs, durabilityTotals[i].Select(d => d / request.Runs).ToArray(), examples[i])).ToArray();
        return new(draft, request.Runs, layers, stats, ["SimAssumptions"]);
    }
}
