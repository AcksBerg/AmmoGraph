namespace AmmoGraph.Core;

public static class AmmoSearch
{
    public static string Normalize(string value) => value.Replace('×', 'x').Replace(".", "").Replace("/", "").Trim();

    public static bool Matches(string query, params string[] values)
    {
        var normalized = Normalize(query);
        return values.Any(value => Normalize(value).Contains(normalized, StringComparison.OrdinalIgnoreCase));
    }
}
