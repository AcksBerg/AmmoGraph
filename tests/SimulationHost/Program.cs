using System.Collections.Frozen;
using System.Reflection;
using System.Runtime.CompilerServices;
using System.Runtime.Loader;
using Microsoft.AspNetCore.DataProtection;
using AmmoGraph.Core;
using SPTarkov.Server.Core.Models.Eft.Common.Tables;
using SPTarkov.Server.Core.Models.Spt.Tables;
using SPTarkov.Server.Core.Utils;
using SPTarkov.Server.Core.Utils.Json;
using Path = System.IO.Path;

var workspace = new DirectoryInfo(AppContext.BaseDirectory);
while (workspace is not null && !Directory.Exists(Path.Combine(workspace.FullName, "SPT_Runtime"))) workspace = workspace.Parent;
var root = workspace?.FullName ?? throw new Exception("Workspace not found");
var runtime = Path.Combine(root, "SPT_Runtime");
AssemblyLoadContext.Default.Resolving += (_, name) => File.Exists(Path.Combine(runtime, name.Name + ".dll"))
    ? AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.Combine(runtime, name.Name + ".dll")) : null;
var json = new JsonUtil([new SptJsonConverterRegistrator()]);
var templates = json.DeserializeFromFile<Dictionary<string, TemplateItem>>(Path.Combine(runtime, "SPT_Data/database/templates/items.json"))!;
var globals = json.DeserializeFromFile<GlobalTable>(Path.Combine(runtime, "SPT_Data/database/globals.json"))!;
using var uiLanguages = System.Text.Json.JsonDocument.Parse(File.ReadAllText(Path.Combine(root, "AmmoGraph/Resources/ui.json")));
var languages = uiLanguages.RootElement.GetProperty("ui").EnumerateObject().Select(p => p.Name).ToArray();
var locales = languages.ToDictionary(l => l, l =>
{
    var path = Path.Combine(runtime, "SPT_Data/database/locales/global/" + SnapshotBuilder.GameLocale(l) + ".json");
    return (IReadOnlyDictionary<string, string>)(File.Exists(path) ? json.DeserializeFromFile<Dictionary<string, string>>(path)! : new());
});
var names = CaliberNameMap.Defaults;
var rules = DefaultExclusions.Defaults;
var simulation = SimulationCatalog.Build(templates.Values, globals, locales);
var shotsToKill = ShotsToKillEvaluation.Compute(simulation);
var snapshots = languages.ToFrozenDictionary(l => l, l => shotsToKill.Attach(SnapshotBuilder.Build(templates.Values, l, locales[l], locales["en"], exclusionRules: rules)));
// This test-only host uses read-only database fixtures instead of starting SPT.
// Reflection supplies AmmoCatalog's startup outputs; no SPT profile is loaded.
var catalog = (AmmoCatalog)RuntimeHelpers.GetUninitializedObject(typeof(AmmoCatalog));
void Property(string name, object value) => typeof(AmmoCatalog).GetProperty(name)!.SetValue(catalog, value);
void Field(string name, object value) => typeof(AmmoCatalog).GetField(name, BindingFlags.Instance | BindingFlags.NonPublic)!.SetValue(catalog, value);
Field("_baseSnapshots", snapshots);
Field("_snapshots", snapshots.ToFrozenDictionary(p => p.Key, p => SnapshotBuilder.RenameCalibers(p.Value, names)));
Property("Snapshot", SnapshotBuilder.RenameCalibers(snapshots["de"], names));
Property("Languages", (IReadOnlyList<LanguageChoice>)languages.Select(l => new LanguageChoice(l, UiText.NativeName(l))).ToArray());
Property("CaliberNames", names); Property("ExclusionRules", rules);
Property("Simulation", simulation); Property("Ready", true);

var builder = WebApplication.CreateBuilder(args);
builder.Logging.AddFilter("Microsoft.AspNetCore", LogLevel.Warning);
builder.WebHost.UseStaticWebAssets();
builder.WebHost.UseUrls(Environment.GetEnvironmentVariable("AMMOGRAPH_TEST_URL") ?? "http://127.0.0.1:6973");
builder.Services.AddRazorComponents().AddInteractiveServerComponents();
builder.Services.AddSingleton(catalog);
builder.Services.AddDataProtection().UseEphemeralDataProtectionProvider();
var app = builder.Build();
app.UseAntiforgery();
app.MapStaticAssets();
app.MapGet("/test/shots-to-kill", () => Results.Json(new
{
    Metrics = snapshots["en"].Metrics.Where(m => ShotsToKillEvaluation.IsMetric(m.Key)),
    Items = snapshots["en"].Items.Where(a => !a.IsPellet).Select(a => new
    {
        a.Id, a.CaliberId,
        Values = a.ShotsToKill!.ToDictionary(kv => kv.Key, kv => new { State = kv.Value.State.ToString(), kv.Value.Shots })
    })
}));
app.MapGet("/favicon.ico", () => Results.NoContent());
app.MapGet("/ammo-graph/{file}", (string file) =>
{
    if (Path.GetFileName(file) != file) return Results.NotFound();
    var path = Path.Combine(root, "AmmoGraph/wwwroot", file);
    return File.Exists(path) ? Results.File(path, file.EndsWith(".js") ? "text/javascript" : "text/css") : Results.NotFound();
});
app.MapRazorComponents<AmmoGraph.SimulationHost.App>().AddInteractiveServerRenderMode()
    .AddAdditionalAssemblies(typeof(AmmoGraph.Web.AmmoGraphPage).Assembly);
app.Run();
