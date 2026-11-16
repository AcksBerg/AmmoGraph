using System.Reflection;
using System.Runtime.Loader;

var runtime = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "../../../../../../SPT_Runtime"));
if (args.FirstOrDefault() == "il")
{
    using var module = Mono.Cecil.ModuleDefinition.ReadModule(Path.Combine(runtime, args[1] + ".dll"));
    foreach (var type in module.Types.Where(t => t.FullName.Contains(args[2])))
    foreach (var target in new[] { type }.Concat(type.NestedTypes))
    foreach (var method in target.Methods.Where(m => m.HasBody))
    {
        Console.WriteLine(method.FullName);
        foreach (var instruction in method.Body.Instructions) Console.WriteLine(instruction);
    }
    return;
}
AssemblyLoadContext.Default.Resolving += (_, name) => File.Exists(Path.Combine(runtime, name.Name + ".dll")) ? AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.Combine(runtime, name.Name + ".dll")) : null;
foreach (var name in new[] { "SPTarkov.Server.Core", "SPTarkov.Server.Web", "SPTarkov.DI" })
{
    var assembly = AssemblyLoadContext.Default.LoadFromAssemblyPath(Path.Combine(runtime, name + ".dll"));
    foreach (var type in assembly.GetTypes().Where(t => args.Any(a => t.FullName!.Contains(a, StringComparison.OrdinalIgnoreCase))))
    {
        Console.WriteLine($"TYPE {type.FullName}");
        foreach (var constructor in type.GetConstructors()) Console.WriteLine("  " + constructor);
        foreach (var property in type.GetProperties(BindingFlags.Public | BindingFlags.Instance | BindingFlags.Static | BindingFlags.DeclaredOnly)) Console.WriteLine("  " + property);
        foreach (var field in type.GetFields(BindingFlags.Public | BindingFlags.Static | BindingFlags.DeclaredOnly)) Console.WriteLine($"  {field.Name} = {(field.IsLiteral ? field.GetRawConstantValue() : "")}");
        foreach (var method in type.GetMethods(BindingFlags.Public | BindingFlags.Instance | BindingFlags.DeclaredOnly).Where(m => !m.IsSpecialName)) Console.WriteLine("  " + method);
    }
}
