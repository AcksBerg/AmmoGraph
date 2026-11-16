namespace AmmoGraph.Core;

public sealed record ChartAxis(double Min, double Max, IReadOnlyList<double> Ticks)
{
    public static ChartAxis Create(IEnumerable<double> input)
    {
        var values = input.Where(double.IsFinite).ToArray();
        if (values.Length == 0) return new(0, 1, [0, 0.2, 0.4, 0.6, 0.8, 1]);
        var min = values.Min();
        var max = values.Max();
        var lower = min - Math.Min(Math.Abs(min) * 0.1, 10);
        if (min >= 0) lower = Math.Max(0, lower);
        var upper = max + Math.Min(Math.Abs(max) * 0.1, 10);
        // Only a zero-valued axis has no range after applying the exact padding rule.
        if (upper <= lower) upper = lower + 1;
        var rawStep = (upper - lower) / 5;
        var magnitude = Math.Pow(10, Math.Floor(Math.Log10(rawStep)));
        var fraction = rawStep / magnitude;
        var step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * magnitude;
        var ticks = new List<double>();
        var first = Math.Ceiling(lower / step) * step;
        for (var i = 0; i < 10; i++)
        {
            var tick = first + i * step;
            if (tick > upper + step * 1e-9) break;
            ticks.Add(Math.Abs(tick) < step * 1e-9 ? 0 : tick);
        }
        if (ticks.Count == 0 || ticks[0] - lower > step * 0.55) ticks.Insert(0, lower);
        if (upper - ticks[^1] > step * 0.55) ticks.Add(upper);
        return new(lower, upper, ticks);
    }
}
