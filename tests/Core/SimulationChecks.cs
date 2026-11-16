using AmmoGraph.Core;
using System.Collections.Frozen;
using System.Text.Json;
using SPTarkov.Server.Core.Models.Eft.Common.Tables;
using SPTarkov.Server.Core.Models.Spt.Tables;
using SPTarkov.Server.Core.Utils;
using Path = System.IO.Path;

static class SimulationChecks
{
    private static void Check(bool value, string message)
    { if (!value) throw new Exception(message); Console.WriteLine("PASS " + message); }
    private static void Throws(Action action, string key)
    { try { action(); throw new Exception("Expected " + key); } catch (SimulationException ex) { Check(ex.Key == key, key); } }
    public static void Run()
    {
        var recipe = new MagazineRecipe(new("M855", 1), [new("FMJ", 1), new("M856", 2)], new("M955", 6));
        var sequence = recipe.Expand();
        Check(sequence.Length == 30 && sequence[0] == "M855" && sequence[22] == "FMJ" && sequence[23] == "M856" && sequence.Skip(24).All(x => x == "M955"), "Magazine preserves the requested firing order and truncates the last middle group");
        Check(new MagazineRecipe(null, [new("FMJ", 2)], null).Expand().All(x => x == "FMJ"), "Middle alone fills all 30 rounds");
        Throws(() => MagazineRecipe.Empty.Expand(), "SimInvalidMagazine");
        Throws(() => new MagazineRecipe(new("a", 29), [new("b", 1)], new("c", 1)).Expand(), "SimInvalidMagazine");
        Throws(() => new MagazineRecipe(null, [new("a", 0)], null).Expand(), "SimInvalidMagazine");
        var r = BallisticsEngine.Resistance(50, 50, 40);
        Check(Math.Abs(r - 40.236735f) < .0001, "Full class-4 resistance matches the decompiled formula");
        Check(Math.Abs(BallisticsEngine.PenetrationChance(40, r) - 87.1816f) < .001, "40 penetration has 87.1816 percent chance against new class 4");
        Check(Math.Abs(BallisticsEngine.PenetrationChance(30, BallisticsEngine.Resistance(25, 50, 40)) - 43.2066f) < .001, "Worn armor uses original maximum durability");
        Check(BallisticsEngine.PenetrationChance(25, r) == 0 && BallisticsEngine.PenetrationChance(56, r) == 100, "Zero and guaranteed penetration branches match the dump");
        var plate = new ProtectionLayer("plate", "plate", "plate", false, 50, 40, .6f, .2f, true, [], ["Plate_Granit_SAPI_chest"]);
        Check(Math.Abs(BallisticsEngine.DurabilityLoss(30, .5f, plate, r, true) - 6.75f) < .0001, "Blocked ceramic hit loses 6.75 durability");
        Check(BallisticsEngine.DurabilityLoss(0, 0, plate, r, true) == 1, "Armor wear retains the game's minimum of one");
        var random = new BallisticsEngine.RandomStream(15);
        var samples = Enumerable.Range(0, 10000).Select(_ => random.PenetrationDeviation()).ToArray();
        Check(samples.All(x => x is >= -1 and <= 1) && samples.Average() is > -.03f and < .03f, "Penetration deviation is bounded and centered");

        // Use the installed databases read-only, with the same SPT serializers as the server.
        var workspace = FindWorkspace();
        using var translations = JsonDocument.Parse(File.ReadAllText(Path.Combine(workspace, "AmmoGraph/Resources/simulation.json")));
        using var uiTranslations = JsonDocument.Parse(File.ReadAllText(Path.Combine(workspace, "AmmoGraph/Resources/ui.json")));
        var simulationKeys = translations.RootElement.GetProperty("en").EnumerateObject().Select(p => p.Name).ToHashSet();
        foreach (var language in uiTranslations.RootElement.GetProperty("ui").EnumerateObject())
        {
            Check(translations.RootElement.TryGetProperty(language.Name, out var table)
                && simulationKeys.SetEquals(table.EnumerateObject().Select(p => p.Name))
                && table.EnumerateObject().All(p => !string.IsNullOrWhiteSpace(p.Value.GetString()) && new UiText(language.Name)[p.Name] == p.Value.GetString()),
                "Every simulator text is available in " + language.Name);
        }
        Check(new UiText("ge")["SimTitle"] == new UiText("de")["SimTitle"]
            && new UiText("es-mx")["SimTitle"] == new UiText("es-es")["SimTitle"]
            && new UiText("pt-br")["SimTitle"] == new UiText("pt-pt")["SimTitle"], "Simulator uses the graph's locale aliases");
        var json = new JsonUtil([new SPTarkov.Server.Core.Utils.Json.SptJsonConverterRegistrator()]);
        var templates = json.DeserializeFromFile<Dictionary<string, TemplateItem>>(Path.Combine(workspace, "SPT_Runtime/SPT_Data/database/templates/items.json"))!;
        var globals = json.DeserializeFromFile<GlobalTable>(Path.Combine(workspace, "SPT_Runtime/SPT_Data/database/globals.json"))!;
        var english = json.DeserializeFromFile<Dictionary<string, string>>(Path.Combine(workspace, "SPT_Runtime/SPT_Data/database/locales/global/en.json"))!;
        var german = json.DeserializeFromFile<Dictionary<string, string>>(Path.Combine(workspace, "SPT_Runtime/SPT_Data/database/locales/global/ge.json"))!;
        var catalog = SimulationCatalog.Build(templates.Values, globals, new Dictionary<string, IReadOnlyDictionary<string, string>> { ["en"] = english, ["ge"] = german });
        Check(catalog.Label("front_plate", "ge") == german["front_plate"] && catalog.Material("Ceramic", "ge") == german["MatCeramic"], "Slots and materials use game translations");
        Check(catalog.Label("front_plate", "unknown") == english["front_plate"]
            && catalog.Material("ModMaterial", "ge") == "ModMaterial" && catalog.Label("mod_slot", "ge") == "mod_slot", "Unknown locales fall back to English and mod identifiers remain readable");
        Check(catalog.Carriers.Count > 30 && catalog.Ammo.Count > 100, "Simulation catalog reads installed armor, ammunition and globals");
        const string cpc = "5e4ac41886f77406a511c9a8";
        var defaultDraft = new SimulatorDraft("Caliber545x39", new(null, [new("56dff026d2720bb8668b4567", 1)], null), cpc, new());
        var resolved = catalog.Resolve(defaultDraft);
        Check(resolved.Any(l => l.Locked && l.Resistance == 30) && resolved.Any(l => !l.Locked && l.Resistance == 50), "CPC standard preset resolves class-3 inserts plus class-5 plates");
        Check(resolved.TakeWhile(l => !l.Locked).Count() == resolved.Count(l => !l.Locked), "Removable plates precede fixed inserts");
        var disabled = defaultDraft with { Slots = new() { ["front_plate"] = null } };
        Check(catalog.Resolve(disabled).All(l => l.Slot != "front_plate") && catalog.Resolve(disabled).Any(l => l.Slot == "soft_armor_front"), "Removing the optional plate retains its fixed insert");
        Throws(() => catalog.Resolve(defaultDraft with { Slots = new() { ["front_plate"] = "bad" } }), "SimIncompatiblePlate");

        var one = BallisticsEngine.Run(catalog, new(defaultDraft, 100));
        var again = BallisticsEngine.Run(catalog, new(defaultDraft, 100));
        Check(JsonSerializer.Serialize(one) == JsonSerializer.Serialize(again), "Same seed produces identical full statistics and example");
        Check(one.Shots.Length == 30 && one.Layers.Length >= 2 && one.Shots.All(s => s.PenetrationPercent is >= 0 and <= 100 && double.IsFinite(s.Damage)), "All 30 shots produce finite statistics with separate layers");
        Check(one.Shots.SelectMany(s => s.Durability).All(d => d >= 0), "Durability never becomes negative");
        for (var i = 1; i < 30; i++) Check(one.Shots[i].Durability.Zip(one.Shots[i-1].Durability).All(p => p.First <= p.Second + .00001), "Remaining durability is monotonic at shot " + (i+1));
        var naked = defaultDraft with { ArmorId = null };
        var bare = BallisticsEngine.Run(catalog, new(naked, 10));
        Check(bare.Shots.All(s => s.PenetrationPercent == 100 && s.Damage == catalog.Ammo[s.AmmoId].Damage), "Unarmored shots reach the body with full immediate damage and no HP cap");
        var buckshot = catalog.Ammo.Values.First(a => a.Projectiles > 1 && a.Caliber == "Caliber12g");
        var shotgun = naked with { CaliberId = "Caliber12g:shot", Magazine = new(null, [new(buckshot.Id, 1)], null) };
        Check(BallisticsEngine.Run(catalog, new(shotgun, 10)).Shots.All(s => Math.Abs(s.Damage - buckshot.Damage * buckshot.Projectiles) < .01), "Buckshot processes the whole cartridge, not the already multiplied display damage");
        using var cancelled = new CancellationTokenSource(); cancelled.Cancel();
        try { BallisticsEngine.Run(catalog, new(naked), cancellation: cancelled.Token); throw new Exception("Cancellation missing"); } catch (OperationCanceledException) { Check(true, "Simulation honors cancellation"); }
        Throws(() => BallisticsEngine.Run(catalog, new(shotgun with { CaliberId = "Caliber545x39" }, 1)), "SimMixedCalibers");

        // Same collider and same shot seed: with a stronger outer plate the weaker
        // inner insert must NOT introduce a second independent penetration roll.
        var immortal = catalog.Parts.ToDictionary(p => p.Key, p => p.Value with { Maximum = 1_000_000 });
        var shared = Copy(catalog, immortal, catalog.Materials.ToDictionary(p => p.Key, _ => 0f));
        var ap = shared.Ammo.Values.First(a => a.Caliber == "Caliber545x39" && a.Penetration > 40 && a.Penetration < 55);
        var combined = defaultDraft with { Magazine = new(null, [new(ap.Id, 1)], null) };
        var result = BallisticsEngine.Run(shared, new(combined, 1000));
        var p5 = BallisticsEngine.PenetrationChance(ap.Penetration, BallisticsEngine.Resistance(1_000_000, 1_000_000, 50));
        Check(Math.Abs(result.Shots[0].PenetrationPercent - p5) < 8, "Shared collider statistics follow the dominant plate check instead of multiplying independent layer probabilities");

        var zeroMaterials = catalog.Materials.ToDictionary(p => p.Key, _ => 0f);
        var stableAmmo = catalog.Ammo.ToDictionary(p => p.Key, p => p.Value);
        stableAmmo[ap.Id] = ap with { Damage = 100, Penetration = 45, Deviation = 0, FragmentationChance = 0 };
        var stable = Copy(catalog, immortal, zeroMaterials, stableAmmo);
        var withInsert = BallisticsEngine.Run(stable, new(combined, 2000));
        var carriersWithoutInsert = catalog.Carriers.ToDictionary(p => p.Key, p => p.Value);
        carriersWithoutInsert[cpc] = carriersWithoutInsert[cpc] with { Slots = carriersWithoutInsert[cpc].Slots.Where(s => s.Id != "soft_armor_front").ToArray() };
        var withoutInsert = BallisticsEngine.Run(Copy(catalog, immortal, zeroMaterials, stableAmmo, carriersWithoutInsert), new(combined, 2000));
        Check(withInsert.Shots.Select(s => s.PenetrationPercent).SequenceEqual(withoutInsert.Shots.Select(s => s.PenetrationPercent)), "A weaker insert on the SAME collider does not introduce an independent penetration roll");
        var separateParts = new Dictionary<string, ArmorPart>(immortal);
        var insertSlot = catalog.Carriers[cpc].Slots.First(s => s.Id == "soft_armor_front");
        separateParts[insertSlot.DefaultPart!] = separateParts[insertSlot.DefaultPart!] with { BodyColliders = ["RibcageUp"], PlateColliders = [] };
        var separateCarriers = catalog.Carriers.ToDictionary(p => p.Key, p => p.Value);
        separateCarriers[cpc] = separateCarriers[cpc] with { Slots = separateCarriers[cpc].Slots.Select(s => s.Id == "soft_armor_front" ? s with { BodyColliders = ["RibcageUp"], PlateColliders = [] } : s).ToArray() };
        var separate = BallisticsEngine.Run(Copy(catalog, separateParts, zeroMaterials, stableAmmo, separateCarriers), new(combined, 2000));
        Check(separate.Shots[0].PenetrationPercent < withInsert.Shots[0].PenetrationPercent && separate.Shots[0].Damage < withInsert.Shots[0].Damage, "A SEPARATE body insert receives reduced penetration, a new roll and additional damage damping");

        // Mod compatibility: mutate loaded objects, then capture a fresh immutable catalog.
        var ammoTemplate = templates[defaultDraft.Magazine.Middle[0].TemplateId];
        var originalDamage = ammoTemplate.Properties!.Damage;
        ammoTemplate.Properties.Damage = 777;
        var material = globals.Configuration.ArmorMaterials.First();
        material.Value.Destructibility = .123;
        var frontSlot = templates[cpc].Properties!.Slots!.First(s => s.Name == "front_plate");
        frontSlot.Properties!.Filters = frontSlot.Properties.Filters!.Select(f => f with { Locked = true }).ToArray();
        var changed = SimulationCatalog.Build(templates.Values, globals, new Dictionary<string, IReadOnlyDictionary<string, string>> { ["en"] = english });
        Check(changed.Ammo[ammoTemplate.Id.ToString()].Damage == 777 && catalog.Ammo[ammoTemplate.Id.ToString()].Damage == originalDamage, "A new startup capture includes modded damage without mutating an existing snapshot");
        Check(Math.Abs(changed.Materials[material.Key.ToString()] - .123f) < .00001f && changed.Carriers[cpc].Slots.First(s => s.Id == "front_plate").Locked && !catalog.Carriers[cpc].Slots.First(s => s.Id == "front_plate").Locked, "Modded global material factors and slot locks are captured independently of previous snapshots");
    }
    private static SimulationCatalog Copy(SimulationCatalog c, Dictionary<string, ArmorPart> parts, Dictionary<string, float> materials,
        Dictionary<string, SimAmmo>? ammo = null, Dictionary<string, ArmorCarrier>? carriers = null) => new()
    { Ammo=ammo?.ToFrozenDictionary() ?? c.Ammo, Parts=parts.ToFrozenDictionary(), Carriers=carriers?.ToFrozenDictionary() ?? c.Carriers, Materials=materials.ToFrozenDictionary(), Bodies=c.Bodies, Resistances=c.Resistances, SoftArmorBluntModifier=c.SoftArmorBluntModifier };
    private static string FindWorkspace()
    {
        var path = new DirectoryInfo(AppContext.BaseDirectory);
        while (path is not null && !Directory.Exists(Path.Combine(path.FullName, "SPT_Runtime"))) path = path.Parent;
        return path?.FullName ?? throw new Exception("SPT runtime not found");
    }
}
