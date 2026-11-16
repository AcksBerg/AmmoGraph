using System.Text.Json;
using SPTarkov.Server.Core.Models.Eft.Common.Tables;

namespace AmmoGraph.Core;

public sealed class ExclusionRules
{
    public string[] Calibers { get; init; } = [];
    public string[] Ammo { get; init; } = [];
    public string[] NameContains { get; init; } = [];
}

public static class DefaultExclusions
{
    public const string AirsoftAmmoId = "6241c316234b593b5676b637";
    public static ExclusionRules Defaults { get; } = ReadDefaults();
    public static ExclusionRules Parse(string json)
    {
        var rules = JsonSerializer.Deserialize<ExclusionRules>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true, ReadCommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
        if (rules is null || new[] { rules.Calibers, rules.Ammo, rules.NameContains }.Any(a => a is null || a.Any(string.IsNullOrWhiteSpace)))
            throw new JsonException("Expected calibers, ammo and nameContains arrays with non-empty strings.");
        if (rules.Ammo.Any(id => id.Trim().Length != 24 || !id.Trim().All(Uri.IsHexDigit)))
            throw new JsonException("ammo entries must be 24-character hexadecimal template IDs.");
        return rules;
    }
    public static ExclusionRules Load(string path, Action<string> warning)
    {
        try { return File.Exists(path) ? Parse(File.ReadAllText(path)) : Defaults; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        { warning($"[AmmoGraph] Cannot read default exclusions '{path}': {ex.Message}. Using defaults."); return Defaults; }
    }
    private static ExclusionRules ReadDefaults()
    {
        using var stream = typeof(DefaultExclusions).Assembly.GetManifestResourceStream("AmmoGraph.Resources.default-exclusions.json")!;
        using var reader = new StreamReader(stream); return Parse(reader.ReadToEnd());
    }
    private static string CaliberKey(string id) => CaliberNameMap.Normalize(id.Split(':')[0].Trim());
    public static bool IsDefaultCaliber(string caliberId, ExclusionRules? rules = null)
        => (rules ?? Defaults).Calibers.Any(c => CaliberKey(c).Equals(CaliberKey(caliberId), StringComparison.OrdinalIgnoreCase));

    // Reversible display defaults; no database entries are removed.
    public static string? Reason(TemplateItem item, IReadOnlyDictionary<string, string> english, ExclusionRules? rules = null)
    {
        rules ??= Defaults;
        var englishName = english.GetValueOrDefault(item.Id + " Name") ?? item.Properties?.Name ?? item.Name ?? "";
        if (new[] { item.Name, item.Properties?.Name, englishName }.Any(name => name is not null && rules.NameContains.Any(marker => name.Contains(marker, StringComparison.OrdinalIgnoreCase)))) return "Unused";
        if (rules.Ammo.Any(id => id.Trim().Equals(item.Id.ToString(), StringComparison.OrdinalIgnoreCase)))
            return item.Id.ToString() == AirsoftAmmoId ? "Airsoft" : "Configured";
        return null;
    }
}
