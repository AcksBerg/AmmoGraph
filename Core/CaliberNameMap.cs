using System.Collections.Frozen;
using System.Text.Json;

namespace AmmoGraph.Core;

public static class CaliberNameMap
{
    public static IReadOnlyDictionary<string, string> Defaults { get; } = ReadDefaults();
    public static string Normalize(string key) => (key.StartsWith("Caliber", StringComparison.OrdinalIgnoreCase) ? key[7..] : key).Replace('×', 'x');

    public static IReadOnlyDictionary<string, string> Parse(string json)
    {
        var result = new Dictionary<string, string>(Defaults, StringComparer.OrdinalIgnoreCase);
        AddJson(result, json);
        return result.ToFrozenDictionary(StringComparer.OrdinalIgnoreCase);
    }

    public static IReadOnlyDictionary<string,string> WithOverrides(IReadOnlyDictionary<string,string> configured, IReadOnlyDictionary<string,string?> personal)
    {
        var result = new Dictionary<string,string>(configured,StringComparer.OrdinalIgnoreCase);
        foreach (var (id,name) in personal)
        {
            var key = Normalize(id.Trim());
            if (key.Length is 0 or >128 || key.Contains(':')) continue;
            if (name is null) result.Remove(key);
            else if (!string.IsNullOrWhiteSpace(name) && name.Trim().Length <=128) result[key]=name.Trim().Replace('×','x');
        }
        return result.ToFrozenDictionary(StringComparer.OrdinalIgnoreCase);
    }

    public static IReadOnlyDictionary<string, string> Load(string path, Action<string> warning)
    {
        try { return File.Exists(path) ? Parse(File.ReadAllText(path)) : Defaults; }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        {
            warning($"[AmmoGraph] Cannot read caliber name map '{path}': {ex.Message}. Using default names.");
            return Defaults;
        }
    }

    private static IReadOnlyDictionary<string, string> ReadDefaults()
    {
        using var stream = typeof(CaliberNameMap).Assembly.GetManifestResourceStream("AmmoGraph.Resources.caliber-names.json")!;
        using var reader = new StreamReader(stream);
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        AddJson(result, reader.ReadToEnd());
        return result.ToFrozenDictionary(StringComparer.OrdinalIgnoreCase);
    }

    private static void AddJson(Dictionary<string, string> result, string json)
    {
        using var document = JsonDocument.Parse(json, new() { CommentHandling = JsonCommentHandling.Skip, AllowTrailingCommas = true });
        if (document.RootElement.ValueKind != JsonValueKind.Object) throw new JsonException("Expected an object mapping caliber IDs to names.");
        foreach (var entry in document.RootElement.EnumerateObject())
        {
            var key = Normalize(entry.Name.Trim());
            if (key.Length == 0 || entry.Value.ValueKind != JsonValueKind.String || string.IsNullOrWhiteSpace(entry.Value.GetString())) continue;
            result[key] = entry.Value.GetString()!.Trim();
        }
    }
}
