using System.Globalization;
using System.Text.Json;

namespace AmmoGraph.Core;

public sealed class UiText(string language)
{
    private static readonly IReadOnlyDictionary<string, Dictionary<string, string>> Tables = Load();
    public bool German => LanguageCode(language) == "de";
    public bool RightToLeft => LanguageCode(language) == "ar";
    public CultureInfo Culture => GetCulture(LanguageCode(language));
    public string Attribute(string key) => Capitalize(this[key], Culture);
    private static string Capitalize(string text, CultureInfo culture) => culture.TextInfo.ToTitleCase(text.ToLower(culture));
    private static string ResourceCode(string code) => LanguageCode(code) switch { "es-mx" => "es-es", "pt-br" => "pt-pt", var other => other };
    public string this[string key] => Tables.TryGetValue(ResourceCode(language), out var table) && table.TryGetValue(key == "Chart" ? "Subtitle" : key, out var text) ? text : Tables["en"].GetValueOrDefault(key, key);
    public static string LanguageCode(string code) => code.ToLowerInvariant() switch
    {
        "ge" => "de", "cz" => "cs", "ch" or "cn" => "zh-cn", "jp" => "ja", "kr" => "ko",
        "po" or "pt" => "pt-pt", "tu" => "tr", "ro" => "ro-ro", "th" => "th-th", "es" => "es-es", "sv-se" => "sv", _ => code.ToLowerInvariant()
    };
    public static string NativeName(string code) => Capitalize(GetCulture(code).NativeName, GetCulture(code));
    private static CultureInfo GetCulture(string code)
    {
        try { return CultureInfo.GetCultureInfo(code); }
        catch (CultureNotFoundException) { return CultureInfo.GetCultureInfo("en"); }
    }
    public static bool HasTranslation(string code) => Tables.ContainsKey(ResourceCode(code));
    private static IReadOnlyDictionary<string, Dictionary<string, string>> Load()
    {
        using var stream = typeof(UiText).Assembly.GetManifestResourceStream("AmmoGraph.Resources.ui.json")!;
        using var document = JsonDocument.Parse(stream);
        var result = new Dictionary<string, Dictionary<string, string>>();
        foreach (var section in new[] { "ui", "metrics" })
        {
            var keys = document.RootElement.GetProperty(section == "ui" ? "uiKeys" : "metricKeys").EnumerateArray().Select(k => k.GetString()!).ToArray();
            foreach (var translation in document.RootElement.GetProperty(section).EnumerateObject())
            {
                var values = translation.Value.GetString()!.Split('|');
                if (values.Length != keys.Length) throw new InvalidDataException($"Invalid {section} translation for {translation.Name}: expected {keys.Length}, got {values.Length}");
                if (!result.TryGetValue(translation.Name, out var table)) result[translation.Name] = table = new();
                for (var i = 0; i < keys.Length; i++) table[keys[i]] = values[i];
            }
        }
        using var extraStream = typeof(UiText).Assembly.GetManifestResourceStream("AmmoGraph.Resources.table.json")!;
        using var extra = JsonDocument.Parse(extraStream);
        var extraKeys = extra.RootElement.GetProperty("keys").EnumerateArray().Select(k => k.GetString()!).ToArray();
        foreach (var translation in extra.RootElement.GetProperty("translations").EnumerateObject())
        {
            var values = translation.Value.GetString()!.Split('|');
            if (values.Length != extraKeys.Length) throw new InvalidDataException($"Invalid table translation for {translation.Name}");
            for (var i = 0; i < extraKeys.Length; i++) result[translation.Name][extraKeys[i]] = values[i];
        }
        using var navigationStream = typeof(UiText).Assembly.GetManifestResourceStream("AmmoGraph.Resources.navigation.json")!;
        using var navigation = JsonDocument.Parse(navigationStream);
        var navigationKeys = navigation.RootElement.GetProperty("keys").EnumerateArray().Select(k => k.GetString()!).ToArray();
        foreach (var translation in navigation.RootElement.GetProperty("translations").EnumerateObject())
        {
            var values = translation.Value.GetString()!.Split('|');
            if (values.Length != navigationKeys.Length) throw new InvalidDataException($"Invalid navigation translation for {translation.Name}");
            for (var i = 0; i < navigationKeys.Length; i++) result[translation.Name][navigationKeys[i]] = values[i];
        }
        using var filterStream = typeof(UiText).Assembly.GetManifestResourceStream("AmmoGraph.Resources.filters.json")!;
        using var filters = JsonDocument.Parse(filterStream);
        var filterKeys = filters.RootElement.GetProperty("keys").EnumerateArray().Select(k => k.GetString()!).ToArray();
        foreach (var translation in filters.RootElement.GetProperty("translations").EnumerateObject())
        {
            var values = translation.Value.GetString()!.Split('|');
            if (values.Length != filterKeys.Length) throw new InvalidDataException($"Invalid filter translation for {translation.Name}");
            for (var i = 0; i < filterKeys.Length; i++) result[translation.Name][filterKeys[i]] = values[i];
        }
        using var attributeStream = typeof(UiText).Assembly.GetManifestResourceStream("AmmoGraph.Resources.attributes.json")!;
        using var attributes = JsonDocument.Parse(attributeStream);
        var attributeKeys = attributes.RootElement.GetProperty("keys").EnumerateArray().Select(k => k.GetString()!).ToArray();
        foreach (var translation in attributes.RootElement.GetProperty("translations").EnumerateObject())
        {
            var values = translation.Value.GetString()!.Split('|');
            if (values.Length != attributeKeys.Length) throw new InvalidDataException($"Invalid attribute translation for {translation.Name}");
            for (var i = 0; i < attributeKeys.Length; i++) result[translation.Name][attributeKeys[i]] = values[i];
        }
        using var themeStream = typeof(UiText).Assembly.GetManifestResourceStream("AmmoGraph.Resources.theme.json")!;
        using var theme = JsonDocument.Parse(themeStream);
        var themeKeys = theme.RootElement.GetProperty("keys").EnumerateArray().Select(k => k.GetString()!).ToArray();
        foreach (var translation in theme.RootElement.GetProperty("translations").EnumerateObject())
        {
            var values = translation.Value.GetString()!.Split('|');
            if (values.Length != themeKeys.Length) throw new InvalidDataException($"Invalid theme translation for {translation.Name}");
            for (var i = 0; i < themeKeys.Length; i++) result[translation.Name][themeKeys[i]] = values[i];
        }
        using var actionStream = typeof(UiText).Assembly.GetManifestResourceStream("AmmoGraph.Resources.actions.json")!;
        using var actions = JsonDocument.Parse(actionStream);
        foreach (var translation in actions.RootElement.EnumerateObject()) result[translation.Name]["ApplyFilter"] = translation.Value.GetString()!;
        using var allValuesStream = typeof(UiText).Assembly.GetManifestResourceStream("AmmoGraph.Resources.all-values.json")!;
        using var allValues = JsonDocument.Parse(allValuesStream);
        foreach (var translation in allValues.RootElement.EnumerateObject()) result[translation.Name]["AllValues"] = translation.Value.GetString()!;
        using var settingsStream = typeof(UiText).Assembly.GetManifestResourceStream("AmmoGraph.Resources.settings.json")!;
        using var settings = JsonDocument.Parse(settingsStream);
        foreach (var translation in settings.RootElement.EnumerateObject()) result[translation.Name]["Settings"] = translation.Value.GetString()!;
        using var transferStream = typeof(UiText).Assembly.GetManifestResourceStream("AmmoGraph.Resources.transfer.json")!;
        using var transfer = JsonDocument.Parse(transferStream);
        var transferKeys = transfer.RootElement.GetProperty("keys").EnumerateArray().Select(k => k.GetString()!).ToArray();
        foreach (var translation in transfer.RootElement.GetProperty("translations").EnumerateObject())
        {
            var values = translation.Value.GetString()!.Split('|');
            if (values.Length != transferKeys.Length) throw new InvalidDataException($"Invalid transfer translation for {translation.Name}");
            for (var i = 0; i < transferKeys.Length; i++) result[translation.Name][transferKeys[i]] = values[i];
        }
        using var editorStream = typeof(UiText).Assembly.GetManifestResourceStream("AmmoGraph.Resources.caliber-editor.json")!;
        using var editor = JsonDocument.Parse(editorStream);
        var editorKeys = editor.RootElement.GetProperty("keys").EnumerateArray().Select(k => k.GetString()!).ToArray();
        foreach (var translation in editor.RootElement.GetProperty("translations").EnumerateObject())
        {
            var values = translation.Value.GetString()!.Split('|');
            if (values.Length != editorKeys.Length) throw new InvalidDataException($"Invalid caliber editor translation for {translation.Name}");
            for (var i = 0; i < editorKeys.Length; i++) result[translation.Name][editorKeys[i]] = values[i];
        }
        using var personalStream = typeof(UiText).Assembly.GetManifestResourceStream("AmmoGraph.Resources.personal-names.json")!;
        using var personal = JsonDocument.Parse(personalStream);
        var personalKeys = personal.RootElement.GetProperty("keys").EnumerateArray().Select(k => k.GetString()!).ToArray();
        foreach (var translation in personal.RootElement.GetProperty("translations").EnumerateObject())
        {
            var values = translation.Value.GetString()!.Split('|');
            if (values.Length != personalKeys.Length) throw new InvalidDataException($"Invalid personal name translation for {translation.Name}");
            for (var i = 0; i < personalKeys.Length; i++) result[translation.Name][personalKeys[i]] = values[i];
        }
        using var simulationStream = typeof(UiText).Assembly.GetManifestResourceStream("AmmoGraph.Resources.simulation.json")!;
        using var simulation = JsonDocument.Parse(simulationStream);
        foreach (var translation in simulation.RootElement.EnumerateObject())
            foreach (var entry in translation.Value.EnumerateObject())
                result[translation.Name][entry.Name] = entry.Value.GetString()!;
        return result;
    }
}
