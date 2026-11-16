using SPTarkov.Common.Models.Logging;
using SPTarkov.DI.Annotations;
using SPTarkov.Server.Core.DI;
using SPTarkov.Server.Core.Models.Spt.Tables;
using SPTarkov.Server.Core.Services.Locales;
using System.Collections.Frozen;

namespace AmmoGraph.Core;

// SPT 4.1.6 awaits IOnLoad in ascending TypePriority order before announcing readiness.
// Use the last possible priority to capture other mods' completed startup changes.
[Injectable(InjectionType.Singleton, int.MaxValue)]
public sealed class AmmoCatalog(TemplateTable templates, GlobalTable globals, LocaleTable localeTable, LocaleService locales, ISptLogger<AmmoCatalog> logger) : IOnLoad
{
    public AmmoSnapshot Snapshot { get; private set; } = new("en", [], []);
    public IReadOnlyList<LanguageChoice> Languages { get; private set; } = [];
    private FrozenDictionary<string, AmmoSnapshot> _snapshots = FrozenDictionary<string, AmmoSnapshot>.Empty;
    public AmmoSnapshot GetSnapshot(string language) => _snapshots.GetValueOrDefault(language) ?? Snapshot;
    public bool Ready { get; private set; }
    public SimulationCatalog Simulation { get; private set; } = new();
    public ExclusionRules ExclusionRules { get; private set; } = DefaultExclusions.Defaults;
    public IReadOnlyDictionary<string,string> CaliberNames { get; private set; } = CaliberNameMap.Defaults;
    private FrozenDictionary<string,AmmoSnapshot> _baseSnapshots = FrozenDictionary<string,AmmoSnapshot>.Empty;
    private static string MapPath => Path.Combine(Path.GetDirectoryName(typeof(AmmoCatalog).Assembly.Location)!, "config", "caliber-names.json");
    public AmmoSnapshot GetBaseSnapshot(string language) => _baseSnapshots.GetValueOrDefault(language) ?? _baseSnapshots.GetValueOrDefault(Snapshot.Language) ?? Snapshot;

    public Task OnLoadAsync(CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var language = UiText.LanguageCode(locales.GetDesiredServerLocale());
        var english = locales.GetLocaleDb("en");
        var mapPath = MapPath;
        var caliberNames = CaliberNameMap.Load(mapPath, message => logger.Warning(message));
        ExclusionRules = DefaultExclusions.Load(Path.Combine(Path.GetDirectoryName(mapPath)!, "default-exclusions.json"), message => logger.Warning(message));
        var languages = locales.GetServerSupportedLocales().Concat(localeTable.Global.Keys).Append(language).Append("en")
            .Select(UiText.LanguageCode).Distinct(StringComparer.OrdinalIgnoreCase).ToArray();
        Languages = languages.Select(code => new LanguageChoice(code, UiText.NativeName(code))).OrderBy(l => l.Name, StringComparer.OrdinalIgnoreCase).ToArray();
        _baseSnapshots = languages.ToFrozenDictionary(code => code, code => SnapshotBuilder.Build(templates.Items.Values, code,
            localeTable.Global.ContainsKey(SnapshotBuilder.GameLocale(code)) ? locales.GetLocaleDb(SnapshotBuilder.GameLocale(code)) : new Dictionary<string, string>(), english, FrozenDictionary<string,string>.Empty, ExclusionRules));
        CaliberNames = caliberNames;
        _snapshots = _baseSnapshots.ToFrozenDictionary(kv => kv.Key,kv => SnapshotBuilder.RenameCalibers(kv.Value,caliberNames));
        Snapshot = _snapshots[language];
        Simulation = SimulationCatalog.Build(templates.Items.Values, globals, languages.ToDictionary(code => code,
            code => (IReadOnlyDictionary<string, string>)(localeTable.Global.ContainsKey(SnapshotBuilder.GameLocale(code))
                ? locales.GetLocaleDb(SnapshotBuilder.GameLocale(code)) : new Dictionary<string, string>())));
        Ready = true;
        logger.Info($"[AmmoGraph] Loaded {Snapshot.Items.Count} ammunition variants in {Languages.Count} languages (default: {language}).");
        return Task.CompletedTask;
    }
}

public sealed record LanguageChoice(string Code, string Name);
