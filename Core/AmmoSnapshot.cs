using System.Collections.Frozen;
using SPTarkov.Server.Core.Models.Eft.Common.Tables;

namespace AmmoGraph.Core;

public sealed record AmmoEntry(string Id, string Name, string CaliberId, string Caliber, bool IsBuckshot, FrozenDictionary<string, double?> Values, bool IsPellet = false, string? DefaultHiddenReason = null)
{
    public string TemplateId => Id.Split(':')[0];
}
public sealed record AmmoMetric(string Key, string Label, string Unit = "")
{
    public string DisplayLabel => Label + (Unit.Length == 0 ? "" : $" ({Unit})");
}
public sealed record AmmoSnapshot(string Language, IReadOnlyList<AmmoEntry> Items, IReadOnlyList<AmmoMetric> Metrics);

public static class SnapshotBuilder
{
    public static readonly IReadOnlySet<string> FractionalPercentages = new HashSet<string>
    {
        "RicochetChance", "FragmentationChance", "MisfireChance", "MalfMisfireChance", "MalfFeedChance", "HeavyBleedingDelta", "LightBleedingDelta"
    };
    private static readonly Dictionary<string, string> CaliberNames = new()
    {
        ["Caliber1143x23ACP"] = ".45 ACP", ["Caliber127x33"] = ".50 AE", ["Caliber12g"] = "12/70",
        ["Caliber20g"] = "20/70", ["Caliber23x75"] = "23×75", ["Caliber366TKM"] = ".366 TKM",
        ["Caliber556x45NATO"] = "5.56×45", ["Caliber762x35"] = ".300 BLK", ["Caliber86x70"] = ".338 Lapua",
        ["Caliber9x19PARA"] = "9×19", ["Caliber9x18PM"] = "9×18", ["Caliber762x25TT"] = "7.62×25",
        ["Caliber9x33R"] = ".357 Magnum", ["Caliber127x108"] = "12.7×108", ["Caliber127x55"] = "12.7×55",
        ["Caliber127x99"] = "12.7×99", ["Caliber40x46"] = "40×46", ["Caliber46x30"] = "4.6×30",
        ["Caliber545x39"] = "5.45×39", ["Caliber57x28"] = "5.7×28", ["Caliber68x51"] = "6.8×51",
        ["Caliber762x39"] = "7.62×39", ["Caliber762x51"] = "7.62×51", ["Caliber762x54R"] = "7.62×54R"
    };

    // Server locale codes and Tarkov's older game-database locale codes differ.
    public static string GameLocale(string language) => language.ToLowerInvariant() switch
    {
        "de" => "ge", "cs" => "cz", "zh-cn" => "ch", "es-es" => "es",
        "pt-br" or "pt-pt" => "po", "ja" => "jp", "ko" => "kr", "ro-ro" => "ro", "tr" => "tu",
        _ => language.ToLowerInvariant()
    };

    public static string Translate(IReadOnlyDictionary<string, string> localized, IReadOnlyDictionary<string, string> english, string key, string fallback)
        => localized.TryGetValue(key, out var text) && !string.IsNullOrWhiteSpace(text) ? text
            : english.TryGetValue(key, out text) && !string.IsNullOrWhiteSpace(text) ? text : fallback;

    public static AmmoSnapshot Build(IEnumerable<TemplateItem> templates, string language, IReadOnlyDictionary<string, string> localized, IReadOnlyDictionary<string, string> english, IReadOnlyDictionary<string, string>? caliberNames = null, ExclusionRules? exclusionRules = null)
    {
        caliberNames ??= CaliberNameMap.Defaults;
        var ui = new UiText(language);
        string Label(string key) => ui.Attribute(key);
        var metrics = new[]
        {
            new AmmoMetric("Damage", Label("Damage")),
            new AmmoMetric("PenetrationPower", Label("PenetrationPower")),
            new AmmoMetric("ArmorDamage", ui["ArmorDamage"], "%"),
            new AmmoMetric("InitialSpeed", Label("InitialSpeed"), "m/s"),
            new AmmoMetric("ProjectileCount", Label("ProjectileCount")),
            new AmmoMetric("BallisticCoeficient", ui["BallisticCoeficient"]),
            new AmmoMetric("BulletMassGram", ui["BulletMassGram"], "g"),
            new AmmoMetric("RicochetChance", Label("RicochetChance"), "%"),
            new AmmoMetric("FragmentationChance", ui["FragmentationChance"], "%"),
            new AmmoMetric("HeavyBleedingDelta", Label("HeavyBleedingDelta"), "%"),
            new AmmoMetric("LightBleedingDelta", Label("LightBleedingDelta"), "%"),
            new AmmoMetric("AmmoAccr", Label("AmmoAccr"), "%"),
            new AmmoMetric("AmmoRec", Label("AmmoRec"), "%"),
            new AmmoMetric("AmmoHear", ui["AmmoHear"]), new AmmoMetric("MisfireChance", ui["MisfireChance"], "%"),
            new AmmoMetric("MalfMisfireChance", Label("MalfMisfireChance"), "%"),
            new AmmoMetric("MalfFeedChance", ui["MalfFeedChance"], "%"),
            new AmmoMetric("DurabilityBurnModificator", ui["DurabilityBurnModificator"]), new AmmoMetric("HeatFactor", ui["HeatFactor"])
        }.Select(m => m with { Label = ui.Attribute(m.Key) }).ToArray();
        var getters = metrics.ToDictionary(m => m.Key, m => typeof(TemplateItemProperties).GetProperty(m.Key)!);
        var items = new List<AmmoEntry>();
        foreach (var item in templates)
        {
            var p = item.Properties;
            if (p?.AmmoType is not ("bullet" or "buckshot") || string.IsNullOrWhiteSpace(p.Caliber)) continue;
            var id = item.Id.ToString();
            var name = Translate(localized, english, id + " Name", p.Name ?? item.Name ?? id);
            var hiddenReason = DefaultExclusions.Reason(item, english, exclusionRules);
            var values = getters.ToFrozenDictionary(kv => kv.Key, kv =>
            {
                var raw = kv.Value.GetValue(p);
                var number = raw is null ? (double?)null : Convert.ToDouble(raw) * (FractionalPercentages.Contains(kv.Key) ? 100 : 1);
                return number.HasValue && double.IsFinite(number.Value) ? number : null;
            });
            var caliber = caliberNames.GetValueOrDefault(CaliberNameMap.Normalize(p.Caliber)) ?? CaliberNames.GetValueOrDefault(p.Caliber)
                ?? Translate(localized, english, p.Caliber, p.Caliber.StartsWith("Caliber") ? p.Caliber[7..].Replace("x", "×") : p.Caliber);
            caliber = caliber.Replace('×', 'x');
            if (p.AmmoType == "buckshot")
            {
                var loadValues = values.ToDictionary(kv => kv.Key, kv => kv.Value);
                loadValues["Damage"] = values["Damage"] * (values["ProjectileCount"] ?? 1);
                if (loadValues["Damage"] is { } total && !double.IsFinite(total)) loadValues["Damage"] = null;
                items.Add(new(id, name, p.Caliber + ":shot", $"{caliber} · {ui["Buckshot"]} · {ui["Load"]}", true, loadValues.ToFrozenDictionary(), false, hiddenReason));
                items.Add(new(id + ":pellet", name + " · " + ui["Pellet"], p.Caliber + ":pellet", $"{caliber} · {ui["Buckshot"]} · {ui["Pellet"]}", true, values, true, hiddenReason));
            }
            else items.Add(new(id, name, p.Caliber, caliber, false, values, false, hiddenReason));
        }
        return new(language, items.OrderBy(a => a.Caliber, StringComparer.OrdinalIgnoreCase).ThenBy(a => a.Name, StringComparer.OrdinalIgnoreCase).ToArray(), metrics);
    }

    public static double? Value(AmmoEntry ammo, string key) => ammo.Values.GetValueOrDefault(key);
    public static AmmoSnapshot RenameCalibers(AmmoSnapshot source, IReadOnlyDictionary<string,string> names)
    {
        var items = source.Items.Select(item =>
        {
            if (!names.TryGetValue(CaliberNameMap.Normalize(item.CaliberId.Split(':')[0]), out var name)) return item;
            var suffix = item.IsBuckshot && item.Caliber.IndexOf(" · ", StringComparison.Ordinal) is var index && index >= 0 ? item.Caliber[index..] : "";
            return item with { Caliber = name.Replace('×','x') + suffix };
        }).OrderBy(a => a.Caliber, StringComparer.OrdinalIgnoreCase).ThenBy(a => a.Name, StringComparer.OrdinalIgnoreCase).ToArray();
        return source with { Items = items };
    }
}
