using System.Collections.Frozen;
using SPTarkov.Server.Core.Models.Eft.Common.Tables;
using SPTarkov.Server.Core.Models.Spt.Tables;
using SPTarkov.Server.Core.Models.Enums;

namespace AmmoGraph.Core;

public sealed class SimulationCatalog
{
    public FrozenDictionary<string, SimAmmo> Ammo { get; init; } = FrozenDictionary<string, SimAmmo>.Empty;
    public FrozenDictionary<string, ArmorPart> Parts { get; init; } = FrozenDictionary<string, ArmorPart>.Empty;
    public FrozenDictionary<string, ArmorCarrier> Carriers { get; init; } = FrozenDictionary<string, ArmorCarrier>.Empty;
    public FrozenDictionary<string, float> Materials { get; init; } = FrozenDictionary<string, float>.Empty;
    public FrozenDictionary<string, BodyBallistics> Bodies { get; init; } = FrozenDictionary<string, BodyBallistics>.Empty;
    public float[] Resistances { get; init; } = [];
    public float SoftArmorBluntModifier { get; init; }
    public FrozenDictionary<string, FrozenDictionary<string, string>> Names { get; init; } = FrozenDictionary<string, FrozenDictionary<string, string>>.Empty;
    public FrozenDictionary<string, FrozenDictionary<string, string>> Labels { get; init; } = FrozenDictionary<string, FrozenDictionary<string, string>>.Empty;
    public string Label(string key, string language) => Labels.GetValueOrDefault(language)?.GetValueOrDefault(key)
        ?? Labels.GetValueOrDefault("en")?.GetValueOrDefault(key) ?? key;
    public string Material(string material, string language)
    {
        var label = Label("Mat" + material, language);
        return label == "Mat" + material ? material : label;
    }
    public string Name(string id, string language) => Names.GetValueOrDefault(language)?.GetValueOrDefault(id)
        ?? Names.GetValueOrDefault("en")?.GetValueOrDefault(id) ?? Parts.GetValueOrDefault(id)?.Name ?? Carriers.GetValueOrDefault(id)?.Name ?? id;

    public static SimulationCatalog Build(IEnumerable<TemplateItem> source, GlobalTable globals,
        IReadOnlyDictionary<string, IReadOnlyDictionary<string, string>> locales)
    {
        var templates = source.ToDictionary(t => t.Id.ToString());
        static string[] Strings(IEnumerable<string>? values) => values?.ToArray() ?? [];
        static float Number(double? value) => (float)(value ?? float.NaN);
        var parts = templates.Values.Where(t => t.Properties?.ArmorClass > 0).ToDictionary(t => t.Id.ToString(), t =>
        {
            var p = t.Properties!;
            return new ArmorPart(t.Id.ToString(), p.Name ?? t.Name ?? t.Id.ToString(), p.ArmorClass!.Value,
                p.ArmorMaterial?.ToString() ?? "", Number(p.MaxDurability), Number(p.BluntThroughput),
                Strings(p.ArmorColliders), Strings(p.ArmorPlateColliders), p.ConflictingItems?.Select(i => i.ToString()).ToArray() ?? []);
        });
        bool Matches(string id, HashSet<string> filters)
        {
            var seen = new HashSet<string>();
            while (seen.Add(id))
            {
                if (filters.Contains(id)) return true;
                if (!templates.TryGetValue(id, out var item)) break;
                id = item.Parent.ToString();
            }
            return false;
        }
        bool Torso(ArmorPart p) => p.PlateColliders.Length > 0 || p.BodyColliders.Any(IsTorsoCollider);
        var carriers = new Dictionary<string, ArmorCarrier>();
        var plateBase = new HashSet<string> { BaseClasses.ARMOR_PLATE.ToString() };
        foreach (var item in templates.Values)
        {
            var id = item.Id.ToString();
            if (Matches(id, plateBase)) continue;
            var own = parts.GetValueOrDefault(id);
            // Weapon attachment filters cannot describe torso armor. Avoid walking
            // every armor part's ancestry for the thousands of unrelated slots.
            if ((own is null || !Torso(own)) && !(item.Properties?.Slots?.Any(s => s.Properties?.Filters?.Any(f =>
                    f.Plate is not null || (f.ArmorPlateColliders?.Any() ?? false) || (f.ArmorColliders?.Any(IsTorsoCollider) ?? false)) == true) ?? false)) continue;
            var preset = globals.ItemPresets?.Values.Where(p => p.Encyclopedia?.ToString() == id)
                .OrderBy(p => p.Id.ToString(), StringComparer.Ordinal).FirstOrDefault();
            var root = preset?.Items.FirstOrDefault(i => i.Template.ToString() == id && string.IsNullOrEmpty(i.ParentId));
            var slots = new List<ArmorSlot>();
            foreach (var slot in item.Properties?.Slots ?? [])
            {
                var filters = slot.Properties?.Filters?.ToArray() ?? [];
                if (filters.Length == 0) continue;
                var allowed = parts.Keys.Where(k => filters.Any(f => Matches(k, f.Filter?.Select(v => v.ToString()).ToHashSet() ?? []))).ToArray();
                if (allowed.Length == 0) continue;
                var filter = filters[0];
                var defaultPart = root is null ? null : preset!.Items.FirstOrDefault(i => i.ParentId == root.Id.ToString() && i.SlotId == slot.Name)?.Template.ToString();
                defaultPart ??= filter.Plate?.ToString();
                if (string.IsNullOrEmpty(slot.Name)) continue;
                slots.Add(new(slot.Name, filter.Locked == true, slot.Required == true, filter.BluntDamageReduceFromSoftArmor == true,
                    defaultPart, allowed, Strings(filters.SelectMany(f => f.ArmorColliders ?? [])), Strings(filters.SelectMany(f => f.ArmorPlateColliders ?? []))));
            }
            if ((own is not null && Torso(own)) || slots.Any(s => s.AllowedParts.Any(k => Torso(parts[k]))))
                carriers[id] = new(id, item.Properties?.Name ?? item.Name ?? id, slots.ToArray(), own?.Id);
        }
        var ammo = templates.Values.Where(t => t.Properties?.AmmoType is "bullet" or "buckshot").ToDictionary(t => t.Id.ToString(), t =>
        {
            var p = t.Properties!;
            return new SimAmmo(t.Id.ToString(), p.Caliber ?? "", Number(p.Damage), p.PenetrationPower ?? float.NaN,
                Number(p.PenetrationPowerDiviation ?? p.PenetrationPowerDeviation ?? 0), Number(p.ArmorDamage) / 100f,
                (int)(p.ProjectileCount ?? 1), Number(p.FragmentationChance ?? 0), p.MinFragmentsCount ?? 0,
                p.MaxFragmentsCount ?? 0, Number(p.PenetrationDamageMod ?? 0));
        });
        var cfg = globals.Configuration;
        var bodies = typeof(BodyPartColliderSettings).GetProperties()
            .Where(p => p.PropertyType == typeof(BodyPartColliderPart))
            .Select(p => (p.Name, Value: p.GetValue(cfg.BodyPartColliderSettings) as BodyPartColliderPart))
            .Where(p => p.Value is not null).ToFrozenDictionary(p => p.Name,
                p => new BodyBallistics((float)p.Value!.PenetrationLevel, (float)p.Value.PenetrationChance, (float)p.Value.PenetrationDamageMod));
        var ids = parts.Keys.Concat(carriers.Keys).Distinct().ToArray();
        var names = locales.ToFrozenDictionary(l => l.Key, l => ids.ToFrozenDictionary(id => id,
            id => SnapshotBuilder.Translate(l.Value, locales.GetValueOrDefault("en") ?? new Dictionary<string, string>(), id + " Name",
                templates[id].Properties?.Name ?? templates[id].Name ?? id)));
        var labelKeys = carriers.Values.SelectMany(c => c.Slots.Select(s => s.Id))
            .Concat(parts.Values.Select(p => "Mat" + p.Material)).Distinct().ToArray();
        var labels = locales.ToFrozenDictionary(l => l.Key, l => labelKeys.ToFrozenDictionary(key => key,
            key => SnapshotBuilder.Translate(l.Value, locales.GetValueOrDefault("en") ?? new Dictionary<string, string>(), key, key)));
        return new()
        {
            Ammo = ammo.ToFrozenDictionary(), Parts = parts.ToFrozenDictionary(), Carriers = carriers.ToFrozenDictionary(), Names = names, Labels = labels,
            Resistances = cfg.Armor.Classes.Select(c => (float)c.Resistance).ToArray(),
            Materials = cfg.ArmorMaterials.ToFrozenDictionary(m => m.Key.ToString(), m => (float)m.Value.Destructibility),
            Bodies = bodies, SoftArmorBluntModifier = (float)cfg.BluntDamageReduceFromSoftArmorMod
        };
    }

    public static bool IsTorsoCollider(string value) => value is "RibcageUp" or "RibcageLow" or "SpineTop" or "SpineDown"
        or "LeftSideChestUp" or "LeftSideChestDown" or "RightSideChestUp" or "RightSideChestDown" or "Pelvis" or "PelvisBack";
    public static readonly string[] KnownPlates = ["Plate_Granit_SAPI_chest", "Plate_Korund_chest", "Plate_Granit_SAPI_back", "Plate_6B13_back",
        "Plate_Granit_SSAPI_side_left_high", "Plate_Korund_side_left_high", "Plate_Granit_SSAPI_side_left_low", "Plate_Korund_side_left_low",
        "Plate_Granit_SSAPI_side_right_high", "Plate_Korund_side_right_high", "Plate_Granit_SSAPI_side_right_low", "Plate_Korund_side_right_low"];
    public static bool PlateInZone(string name, HitZone zone) => zone switch
    {
        HitZone.Front => name is "Plate_Granit_SAPI_chest" or "Plate_Korund_chest",
        HitZone.Back => name is "Plate_Granit_SAPI_back" or "Plate_6B13_back",
        HitZone.Left => name.Contains("side_left_", StringComparison.Ordinal),
        _ => name.Contains("side_right_", StringComparison.Ordinal)
    };
    public static string[] ZoneBodies(HitZone zone) => zone switch
    {
        HitZone.Front => ["RibcageUp", "RibcageLow"], HitZone.Back => ["SpineTop", "SpineDown"],
        HitZone.Left => ["LeftSideChestDown", "LeftSideChestUp"], _ => ["RightSideChestDown", "RightSideChestUp"]
    };

    public ProtectionLayer[] Resolve(SimulatorDraft draft)
    {
        if (draft.ArmorId is null) return [];
        if (!Carriers.TryGetValue(draft.ArmorId, out var carrier)) throw new SimulationException("SimMissingArmor");
        var layers = new List<ProtectionLayer>();
        void Add(string id, string slot, bool locked, bool reduce, string[]? bodies = null, string[]? plates = null)
        {
            if (!Parts.TryGetValue(id, out var part) || !Materials.TryGetValue(part.Material, out var material)
                || Resistances.Length == 0 || !float.IsFinite(Resistances[Math.Clamp(part.Class, 0, Resistances.Length - 1)]) || Resistances[Math.Clamp(part.Class, 0, Resistances.Length - 1)] <= 0
                || !float.IsFinite(material) || material < 0 || !float.IsFinite(part.Maximum) || part.Maximum <= 0
                || !float.IsFinite(part.BluntThroughput) || part.BluntThroughput is < 0 or > 1)
                throw new SimulationException("SimMissingArmorData", id);
            var body = bodies is null ? part.BodyColliders : part.BodyColliders.Intersect(bodies).ToArray();
            var plate = plates is null ? part.PlateColliders : part.PlateColliders.Intersect(plates).ToArray();
            if (plate.Any(p => !KnownPlates.Contains(p)) || body.Any(p => !Bodies.ContainsKey(p)))
                throw new SimulationException("SimUnsupportedCollider", slot);
            layers.Add(new(slot, id, slot, locked, part.Maximum, Resistances[Math.Clamp(part.Class, 0, Resistances.Length - 1)], material, part.BluntThroughput, reduce, body, plate));
        }
        if (carrier.OwnPart is { } own) Add(own, "body", true, false);
        foreach (var slot in carrier.Slots)
        {
            var chosen = slot.Locked ? slot.DefaultPart : draft.Slots.GetValueOrDefault(slot.Id, slot.DefaultPart);
            if (string.IsNullOrEmpty(chosen))
            {
                if (slot.Required || slot.Locked) throw new SimulationException("SimRequiredInsert", slot.Id);
                continue;
            }
            if (!slot.AllowedParts.Contains(chosen)) throw new SimulationException("SimIncompatiblePlate", slot.Id);
            Add(chosen, slot.Id, slot.Locked, slot.ReduceBlunt, slot.BodyColliders, slot.PlateColliders);
        }
        var equipped = layers.Select(l => l.TemplateId).Append(carrier.Id).ToHashSet();
        if (layers.Any(l => Parts[l.TemplateId].Conflicts.Any(equipped.Contains))) throw new SimulationException("SimIncompatiblePlate");
        return layers.OrderBy(l => l.Locked ? 1 : -1).ToArray();
    }
}
