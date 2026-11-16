namespace AmmoGraph.Core;

public sealed record AmmoComparison(double Delta, string Arrow, string Tone)
{
    public static AmmoComparison? Create(AmmoEntry baseline, AmmoEntry candidate, string key)
    {
        var before = SnapshotBuilder.Value(baseline, key);
        var after = SnapshotBuilder.Value(candidate, key);
        if (!before.HasValue || !after.HasValue) return null;
        var delta = after.Value - before.Value;
        var direction = Math.Sign(delta);
        // Mass, velocity, projectile count, sound and ballistic coefficients depend on the intended use.
        var betterDirection = key switch
        {
            "Damage" or "PenetrationPower" or "ArmorDamage" or "AmmoAccr" or "HeavyBleedingDelta" or "LightBleedingDelta" => 1,
            "AmmoRec" or "MisfireChance" or "MalfMisfireChance" or "MalfFeedChance" or "DurabilityBurnModificator" or "HeatFactor" or "RicochetChance" => -1,
            _ => 0
        };
        return new(delta, direction > 0 ? "↑" : direction < 0 ? "↓" : "=",
            direction == 0 || betterDirection == 0 ? "neutral" : direction == betterDirection ? "better" : "worse");
    }
}
