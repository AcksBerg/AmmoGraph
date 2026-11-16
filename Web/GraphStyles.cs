namespace AmmoGraph.Web;

public static class GraphStyles
{
    public static string Css { get; } = Load();
    private static string Load()
    {
        using var stream = typeof(GraphStyles).Assembly.GetManifestResourceStream("AmmoGraph.wwwroot.graph.css")!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
