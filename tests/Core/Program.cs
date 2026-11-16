using AmmoGraph.Core;
using SPTarkov.Server.Core.Models.Common;
using SPTarkov.Server.Core.Models.Eft.Common.Tables;
using Path = System.IO.Path;

static void Check(bool condition, string message)
{
    if (!condition) throw new Exception(message);
    Console.WriteLine("PASS " + message);
}
static TemplateItem Item(string id, string caliber, string type, double damage, double count = 1) => new()
{
    Id = new MongoId(id), Name = "mod_added_ammo", Properties = new() { Caliber = caliber, AmmoType = type, Damage = damage, ProjectileCount = count }
};
var a = Item("aaaaaaaaaaaaaaaaaaaaaaaa", "CaliberCustom777x42", "bullet", 123);
var b = Item("bbbbbbbbbbbbbbbbbbbbbbbb", "Caliber12g", "buckshot", 39, 8);
var c = Item("cccccccccccccccccccccccc", "Caliber545x39", "bullet", 51);
var d = Item("dddddddddddddddddddddddd", "CaliberToy", "grenade", 1);
var local = new Dictionary<string, string> { [a.Id + " Name"] = "Modpatrone", [c.Id + " Name"] = "", ["MAX AMMO DAMAGE"] = "Schaden" };
var english = new Dictionary<string, string> { [b.Id + " Name"] = "English buckshot", [c.Id + " Name"] = "English fallback", ["AMMO PENETRATION POWER"] = "Penetration" };
var snapshot = SnapshotBuilder.Build([a, b, c, d], "de", local, english);
Check(snapshot.Items.Count == 4, "Accept new mod ammunition and separate buckshot variants, exclude non-projectile items");
Check(snapshot.Items.Single(i => i.Id == a.Id.ToString()).Caliber == "Custom777x42", "Unknown caliber remains selectable without a hardcoded mapping");
Check(snapshot.Items.Single(i => i.Id == c.Id.ToString()).Caliber == "5.45x39", "Known caliber has correct decimal formatting");
Check(snapshot.Items.Single(i => i.Id == a.Id.ToString()).Name == "Modpatrone", "Use translated mod names");
Check(snapshot.Items.Single(i => i.Id == b.Id.ToString()).Name == "English buckshot", "Fall back to English for missing translations");
Check(snapshot.Items.Single(i => i.Id == c.Id.ToString()).Name == "English fallback", "Empty translation also falls back to English");
Check(snapshot.Metrics.Single(m => m.Key == "Damage").Label == "Schaden", "Use game localization for existing metric labels");
Check(snapshot.Metrics.Single(m => m.Key == "PenetrationPower").Label == "Durchschlagskraft", "Use translated UI metric when a game label is missing");
var shot = snapshot.Items.Single(i => i.IsBuckshot && !i.IsPellet);
var pellet = snapshot.Items.Single(i => i.IsPellet);
Check(SnapshotBuilder.Value(pellet, "Damage") == 39 && SnapshotBuilder.Value(shot, "Damage") == 312, "Independent pellet and whole-load entries match client projectile semantics");
Check(shot.CaliberId == "Caliber12g:shot" && pellet.CaliberId == "Caliber12g:pellet" && shot.Id != pellet.Id, "Buckshot representations have separate caliber and item identities");
Check(SnapshotBuilder.Value(shot, "InitialSpeed") is null, "Missing values remain missing instead of becoming zero");
a.Properties!.Damage = 999;
Check(snapshot.Items.Single(i => i.Id == a.Id.ToString()).Values["Damage"] == 123, "Startup snapshot is detached from later source mutations");
Check(SnapshotBuilder.GameLocale("de") == "ge" && SnapshotBuilder.GameLocale("cs") == "cz", "Translate server locale codes to game database codes");
a.Properties.InitialSpeed = double.PositiveInfinity;
var finiteSnapshot = SnapshotBuilder.Build([a], "en", local, english);
Check(finiteSnapshot.Items[0].Values["InitialSpeed"] is null, "Non-finite values cannot break chart geometry");
foreach (var values in new[] { new double[] { 20, 89 }, [1, 400], [-20, -3], [50], [0], [0.0001, 0.0004] })
{
    var axis = ChartAxis.Create(values);
    var max = values.Max();
    Check(Math.Abs(axis.Max - (max == 0 && values.Min() == 0 ? 1 : max + Math.Min(Math.Abs(max) * 0.1, 10))) < 1e-9, "Exact capped 10% axis padding for " + string.Join(',', values));
    Check(axis.Ticks.All(t => t >= axis.Min - 1e-9 && t <= axis.Max + 1e-9) && axis.Max > axis.Min, "Tick rounding preserves axis bounds");
}
var comparisonBase = snapshot.Items.Single(i => i.Id == a.Id.ToString());
var betterDamage = comparisonBase with { Values = a.ValuesForTest("Damage", 150) };
Check(AmmoComparison.Create(snapshot.Items.Single(i => i.Id == a.Id.ToString()), betterDamage, "Damage") is { Delta: 27, Tone: "better", Arrow: "↑" }, "Higher damage is an improvement relative to the pinned item");
var recoilBase = comparisonBase with { Values = a.ValuesForTest("AmmoRec", 10) };
var recoilBetter = comparisonBase with { Values = a.ValuesForTest("AmmoRec", -5) };
Check(AmmoComparison.Create(recoilBase, recoilBetter, "AmmoRec") is { Delta: -15, Tone: "better", Arrow: "↓" }, "Lower recoil uses a green downward improvement arrow");
Check(AmmoComparison.Create(recoilBetter, recoilBase, "AmmoRec") is { Delta: 15, Tone: "worse" }, "Higher recoil is a deterioration");
Check(AmmoComparison.Create(pellet, shot, "InitialSpeed") is null, "Missing comparison values do not produce invented deltas");
var configPath = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../../SPT_Runtime/SPT_Data/configs/locale.json"));
using var config = System.Text.Json.JsonDocument.Parse(File.ReadAllText(configPath));
Check(config.RootElement.GetProperty("serverSupportedLocales").EnumerateArray().All(code => UiText.HasTranslation(code.GetString()!)), "Every configured SPT server language has UI translations");
Check(new UiText("ja")["Language"] == "言語" && new UiText("ar").RightToLeft, "Non-Latin localization and Arabic text direction");
var unused = Item("111111111111111111111111", "Caliber9x19PARA", "bullet", 900);
unused.Name = "!!!DO_NOT_USE!!!_legacy";
var englishUnused = Item("222222222222222222222222", "Caliber9x19PARA", "bullet", 900);
var legitimate = Item("333333333333333333333333", "Caliber9x18PM", "bullet", 55);
var fragment = Item("5943d9c186f7745a13413ac9", "Caliber9x18PM", "bullet", 999);
fragment.Name = "shrapnel";
var toy = Item("555555555555555555555555", "Caliber20x1mm", "bullet", 1);
var exclusionEnglish = new Dictionary<string,string> { [englishUnused.Id + " Name"] = "!!!DO_NOT_USE!!! old round", [legitimate.Id + " Name"] = "9x18mm PM test", [fragment.Id + " Name"] = "Grenade Shrapnel" };
var exclusionGerman = new Dictionary<string,string> { [legitimate.Id + " Name"] = "Lokalisierte Patrone", [fragment.Id + " Name"] = "9x18mm falsche Übersetzung" };
var excludedSnapshot = SnapshotBuilder.Build([unused,englishUnused,legitimate,fragment,toy], "de", exclusionGerman, exclusionEnglish);
Check(excludedSnapshot.Items.Count == 5, "Default exclusions retain all source items, including formerly hardcoded exclusions");
Check(excludedSnapshot.Items.Single(i => i.Id == unused.Id.ToString()).DefaultHiddenReason == "Unused", "Internal DO_NOT_USE marker becomes a reversible default");
Check(excludedSnapshot.Items.Single(i => i.Id == englishUnused.Id.ToString()).DefaultHiddenReason == "Unused", "English display-name DO_NOT_USE marker is detected");
Check(excludedSnapshot.Items.Single(i => i.Id == legitimate.Id.ToString()).DefaultHiddenReason is null, "Real 9x18mm rounds remain visible even if translated names have a different prefix");
Check(excludedSnapshot.Items.Single(i => i.Id == fragment.Id.ToString()).DefaultHiddenReason == "Configured", "Fragments use explicit template IDs independently of localization");
Check(shot.TemplateId == pellet.TemplateId, "Personal ammunition exclusion can target both representations by their shared template ID");
Check(new UiText("de")["Columns"] == "Spalten" && new UiText("ja")["Exclusions"] == "口径と弾薬を非表示", "Column and exclusion controls are localized");
var probability = Item("666666666666666666666666", "Caliber545x39", "bullet", 50);
probability.Properties!.RicochetChance = .25;
probability.Properties.FragmentationChance = .125;
probability.Properties.MisfireChance = .01;
probability.Properties.MalfMisfireChance = .126;
probability.Properties.MalfFeedChance = .12;
probability.Properties.HeavyBleedingDelta = .05;
probability.Properties.LightBleedingDelta = .3;
probability.Properties.ArmorDamage = 30;
probability.Properties.AmmoAccr = 12;
probability.Properties.AmmoRec = -5;
var probabilitySnapshot = SnapshotBuilder.Build([probability], "de", new Dictionary<string,string> { ["RICOCHET CHANCE"] = "QUERSCHLÄGERCH." }, english);
foreach (var (key, expected) in new Dictionary<string,double> { ["RicochetChance"] = 25, ["FragmentationChance"] = 12.5, ["MisfireChance"] = 1, ["MalfMisfireChance"] = 12.6, ["MalfFeedChance"] = 12, ["HeavyBleedingDelta"] = 5, ["LightBleedingDelta"] = 30 })
    Check(Math.Abs(probabilitySnapshot.Items[0].Values[key]!.Value - expected) < 1e-9 && probabilitySnapshot.Metrics.Single(m => m.Key == key).Unit == "%", key + " is consistently converted from a fraction to percent");
Check(probabilitySnapshot.Items[0].Values["ArmorDamage"] == 30 && probabilitySnapshot.Items[0].Values["AmmoAccr"] == 12 && probabilitySnapshot.Items[0].Values["AmmoRec"] == -5, "Existing percentages are not multiplied a second time");
Check(probability.Properties.RicochetChance == .25, "Percentage normalization does not change server templates");
Check(probabilitySnapshot.Metrics.Single(m => m.Key == "RicochetChance").DisplayLabel == "Querschlägerchance (%)", "Full metric labels replace abbreviated game labels and include parenthesized units");
Check(new AmmoMetric("Speed", "Bullet Velocity", "m/s").DisplayLabel == "Bullet Velocity (m/s)", "One shared label format supplies units to every view");
Check(UiText.NativeName("fr").StartsWith("F") && UiText.NativeName("da").StartsWith("D"), "Language names are capitalized in their own culture");
Check(DefaultExclusions.IsDefaultCaliber("Caliber20x1mm") && DefaultExclusions.IsDefaultCaliber("Caliber26x75"), "Toy and flare calibers are reversible default caliber exclusions");
Check(DefaultExclusions.IsDefaultCaliber("Caliber26x75:pellet") && !DefaultExclusions.IsDefaultCaliber("Caliber9x19PARA"), "Default caliber policy includes its representations without affecting other calibers");
Check(new UiText("de")["ShowTable"] == "Tabelle anzeigen" && new UiText("ja")["ZoomIn"] == "拡大", "Layout and navigation controls are localized");
var airsoft = Item(DefaultExclusions.AirsoftAmmoId, "Caliber556x45NATO", "bullet", 1);
airsoft.Name = "patron_6mm_airsoft";
var airsoftSnapshot = SnapshotBuilder.Build([airsoft], "de", new Dictionary<string,string> { [airsoft.Id + " Name"] = "Übersetzte BB" }, english);
Check(airsoftSnapshot.Items.Count == 1 && airsoftSnapshot.Items[0].DefaultHiddenReason == "Airsoft", "Airsoft BB remains in the snapshot with a language-independent reversible default exclusion");
Check(DefaultExclusions.Reason(c, english) is null, "Airsoft policy does not hide ordinary ammunition");
Check(new UiText("en")["Empty"] == "No matching ammunition. Adjust your ammunition filter.", "Empty state explicitly identifies the ammunition filter");
Check(AmmoSearch.Matches("545", "5.45×39") && AmmoSearch.Matches("5./45", "5.45×39"), "Caliber search ignores dots and slashes on either side");
Check(AmmoSearch.Matches(".308/m80", "308/M80") && AmmoSearch.Matches("1270", "12/70"), "Ammunition search normalizes names and shotgun caliber separators");
Check(AmmoSearch.Matches(" ss/a/p ", "SSAP") && AmmoSearch.Matches("./", "any ammunition"), "Search remains case insensitive, trims query and accepts punctuation-only input");
Check(new UiText("de")["NoCalibers"].StartsWith("Keine Kaliber ausgewählt.") && new UiText("en")["EmptySelection"].Contains("exclusions"), "Empty states distinguish caliber selection from ammunition filtering");
Check(config.RootElement.GetProperty("serverSupportedLocales").EnumerateArray().All(code => new UiText(code.GetString()!)["NoCalibers"] != "NoCalibers" && new UiText(code.GetString()!)["EmptySelection"] != "EmptySelection"), "New empty-state messages are available in every supported SPT language");
Check(config.RootElement.GetProperty("serverSupportedLocales").EnumerateArray().All(code => new UiText(code.GetString()!)["Attributes"] != "Attributes" && new UiText(code.GetString()!)["MoveUp"] != "MoveUp"), "Attribute configuration is translated for every supported SPT language");
var wttNames = new Dictionary<string,string> { ["1036x77"] = ".408 Cheyenne", ["11x33R"] = ".44 Magnum", ["762x67B"] = ".300 Winchester", ["86x63"] = ".338 Norma Magnum" };
foreach (var (key, expected) in wttNames)
{
    var template = Item("777777777777777777777777", "Caliber" + key, "bullet", 80);
    var mapped = SnapshotBuilder.Build([template], "de", local, english).Items.Single();
    Check(mapped.Caliber == expected && mapped.CaliberId == template.Properties!.Caliber, "WTT default name with unchanged identity: " + key);
    Check(AmmoSearch.Matches(expected.Replace(".", ""), mapped.Caliber), "Mapped caliber name is searchable: " + key);
}
Check(SnapshotBuilder.Build([], "en", local, english).Items.Count == 0, "Uninstalled mod mappings never create phantom calibers or ammunition");
var customNames = CaliberNameMap.Parse("{\"Caliber545x39\":\"Custom 5.45\",\"12g\":\"Shotgun alias\",\"UnknownNotInstalled\":\"Absent mod\",\"Caliber1036x77\":\"Personal Cheyenne\",\"ignored\":\" \"}");
Check(SnapshotBuilder.Build([c], "en", local, english, customNames).Items.Single().Caliber == "Custom 5.45", "Server map can override an existing vanilla caliber");
Check(customNames["1036x77"] == "Personal Cheyenne" && customNames["11x33R"] == ".44 Magnum", "User overrides take priority while omitted defaults remain available");
var customShotgun = SnapshotBuilder.Build([b], "de", local, english, customNames);
Check(customShotgun.Items.Count == 2 && customShotgun.Items.All(i => i.Caliber.StartsWith("Shotgun alias")), "Mapped names apply to both buckshot representations without extra entries");
Check(b.Properties!.Caliber == "Caliber12g" && c.Properties!.Caliber == "Caliber545x39", "Display-name overrides do not mutate server templates");
Check(CaliberNameMap.Parse("{\"caliber1036X77\":\"Case alias\"}")["1036x77"] == "Case alias", "Map keys support optional prefixes and case-insensitive lookup");
var mapFile = Path.GetTempFileName();
try
{
    File.WriteAllText(mapFile, "{malformed");
    var warnings = new List<string>();
    Check(CaliberNameMap.Load(mapFile, warnings.Add)["1036x77"] == ".408 Cheyenne" && warnings.Count == 1, "Invalid user maps report a warning and fall back without blocking startup");
}
finally { File.Delete(mapFile); }
var multiplicationMap = CaliberNameMap.Parse("{\"93×64\":\"9.3x64\",\"792×57\":\"7.92x57\"}");
foreach (var (raw, expected) in new Dictionary<string,string> { ["Caliber93x64"] = "9.3x64", ["Caliber792x57"] = "7.92x57", ["Caliber93×64"] = "9.3x64" })
{
    var normalized = SnapshotBuilder.Build([Item("888888888888888888888888", raw, "bullet", 50)], "en", local, english, multiplicationMap).Items.Single();
    Check(normalized.Caliber == expected && normalized.CaliberId == raw, "Multiplication-sign keys match without changing source IDs: " + raw);
}
Check(AmmoSearch.Matches("9.3×64", "9.3x64") && AmmoSearch.Matches("7.92x57", "7.92×57"), "Search treats x and multiplication signs identically");
Check(DefaultExclusions.IsDefaultCaliber("Caliber40x46") && DefaultExclusions.IsDefaultCaliber("40×46:pellet"), "40x46 is a configurable default exclusion for all representations");
var noExclusions = DefaultExclusions.Parse("{}");
Check(!DefaultExclusions.IsDefaultCaliber("Caliber40x46", noExclusions) && DefaultExclusions.Reason(airsoft, english, noExclusions) is null && DefaultExclusions.Reason(unused, english, noExclusions) is null, "Empty configuration disables default calibers, ammunition and marker rules");
var personalDefaults = DefaultExclusions.Parse("{\"calibers\":[\"Custom777×42\"],\"ammo\":[\"aaaaaaaaaaaaaaaaaaaaaaaa\"]}");
Check(DefaultExclusions.IsDefaultCaliber("CaliberCustom777x42:shot", personalDefaults), "Configured caliber defaults accept normalized keys and derived groups");
var configuredSnapshot = SnapshotBuilder.Build([a, c], "en", local, english, exclusionRules: personalDefaults);
Check(configuredSnapshot.Items.Count == 2 && configuredSnapshot.Items.Single(i => i.Id == a.Id.ToString()).DefaultHiddenReason == "Configured" && configuredSnapshot.Items.Single(i => i.Id == c.Id.ToString()).DefaultHiddenReason is null, "Configured ammunition exclusion marks only the requested ID and retains all records");
var clearedSnapshot = SnapshotBuilder.Build([unused, legitimate, fragment], "de", exclusionGerman, exclusionEnglish, exclusionRules: noExclusions);
Check(clearedSnapshot.Items.All(i => i.DefaultHiddenReason is null), "Configured empty name and marker lists remove previous default rules");
var exclusionFile = Path.GetTempFileName();
try
{
    File.WriteAllText(exclusionFile, "{\"calibers\":null}");var warnings = new List<string>();
    Check(DefaultExclusions.Load(exclusionFile,warnings.Add).Calibers.Contains("40x46") && warnings.Count == 1, "Invalid default-exclusion configuration warns and safely uses embedded defaults");
    File.WriteAllText(exclusionFile,"{\"calibers\":[\"9x19PARA\"]}");
    Check(!DefaultExclusions.IsDefaultCaliber("Caliber40x46",DefaultExclusions.Load(exclusionFile,warnings.Add)), "Valid configuration replaces rather than merges the embedded defaults");
}
finally { File.Delete(exclusionFile); }
var idRules = DefaultExclusions.Parse("{\"ammo\":[\"6241C316234B593B5676B637\"]}");
airsoft.Name = "Renamed internal template";
Check(DefaultExclusions.Reason(airsoft, english, idRules) == "Airsoft", "Ammo ID exclusion remains valid after internal and display-name changes");
c.Name = airsoft.Name;
Check(DefaultExclusions.Reason(c, english, idRules) is null, "Same-name ammunition with a different ID is not excluded");
try { DefaultExclusions.Parse("{\"ammo\":[\"patron_6mm_airsoft\"]}"); Check(false,"Names must not be accepted as template IDs"); }
catch(System.Text.Json.JsonException) { Check(true,"Ammo entries are validated as template IDs"); }
var configuredNames = CaliberNameMap.Parse("{\"545x39\":\"Config name\",\"12g\":\"Config shotgun\"}");
var personalNames = new Dictionary<string,string?> { ["Caliber545x39"]=" New × name ", ["12g"]=null };
var privateNames = CaliberNameMap.WithOverrides(configuredNames,personalNames);
Check(privateNames["545x39"]=="New x name" && configuredNames["545x39"]=="Config name", "Personal names are normalized without modifying configured defaults");
Check(CaliberNameMap.WithOverrides(configuredNames,new Dictionary<string,string?>())["545x39"]=="Config name", "Another visitor keeps the configured names");
Check(!privateNames.ContainsKey("12g") && privateNames.ContainsKey("545x39"), "Deleting a translation suppresses only that name for the current visitor");
var resetNames=CaliberNameMap.WithOverrides(configuredNames,new Dictionary<string,string?>());
Check(resetNames.Count==configuredNames.Count && configuredNames.All(kv=>resetNames[kv.Key]==kv.Value), "Reset restores all configured names");
var renamed=SnapshotBuilder.RenameCalibers(snapshot,privateNames);var renamedC=renamed.Items.Single(i=>i.Id==c.Id.ToString());var originalC=snapshot.Items.Single(i=>i.Id==c.Id.ToString());
Check(renamedC.Caliber=="New x name" && ReferenceEquals(renamedC.Values,originalC.Values) && renamedC.Id==originalC.Id && originalC.Caliber=="5.45x39", "Private renaming preserves captured values, identities and other snapshots");
Check(SnapshotBuilder.RenameCalibers(snapshot,CaliberNameMap.WithOverrides(configuredNames,new Dictionary<string,string?> { ["NotInstalled"]="Private alias",["545x39"]=" " })).Items.Count==snapshot.Items.Count, "Invalid and unavailable personal names do not create records");
using (var usabilityStream = typeof(UiText).Assembly.GetManifestResourceStream("AmmoGraph.Resources.usability.json")!)
using (var usability = System.Text.Json.JsonDocument.Parse(usabilityStream))
{
    var keys = usability.RootElement.GetProperty("en").EnumerateObject().Select(p => p.Name).ToArray();
    foreach (var locale in usability.RootElement.EnumerateObject())
    {
        var text = new UiText(locale.Name);
        Check(locale.Value.EnumerateObject().Count() == keys.Length && keys.All(key => locale.Value.TryGetProperty(key, out var value) && !string.IsNullOrWhiteSpace(value.GetString()) && text[key] == value.GetString()), "Usability messages load completely for " + locale.Name);
    }
    foreach (var code in config.RootElement.GetProperty("serverSupportedLocales").EnumerateArray().Select(c => c.GetString()!))
    {
        var canonical = UiText.LanguageCode(code) switch { "es-mx" => "es-es", "pt-br" => "pt-pt", var other => other };
        Check(usability.RootElement.TryGetProperty(canonical, out _), "Usability translations cover server locale " + code);
    }
}
SimulationChecks.Run();
Console.WriteLine("All core checks passed.");

static class TestValues
{
    public static System.Collections.Frozen.FrozenDictionary<string, double?> ValuesForTest(this TemplateItem item, string key, double value)
        => System.Collections.Frozen.FrozenDictionary.ToFrozenDictionary(new Dictionary<string, double?> { [key] = value });
}
