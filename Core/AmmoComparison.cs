namespace AmmoGraph.Core;

public sealed record AmmoComparison(double Delta, string Arrow, string Tone, bool HasNumericDelta = true)
{
    public static AmmoComparison? Create(AmmoEntry baseline, AmmoEntry candidate, string key)
    {
        if (ShotsToKillEvaluation.IsMetric(key))
        {
            var left = ShotsToKillEvaluation.Result(baseline, key);
            var right = ShotsToKillEvaluation.Result(candidate, key);
            if (left is null || right is null || left.State == ShotsToKillState.Failed || right.State == ShotsToKillState.Failed) return null;
            var order = ShotsToKillEvaluation.Comparer(key).Compare(candidate, baseline);
            var numeric = left.State == ShotsToKillState.Success && right.State == ShotsToKillState.Success;
            return new(numeric ? right.Shots!.Value - left.Shots!.Value : 0,
                order > 0 ? "↑" : order < 0 ? "↓" : "=", order < 0 ? "better" : order > 0 ? "worse" : "neutral", numeric);
        }
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
