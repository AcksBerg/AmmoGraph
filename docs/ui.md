# Interface tour

[Project overview](../README.md) · [Usage](usage.md) · [Developer guide](development.md)

These screenshots were captured from the running local application using a separate temporary browser profile. They show the English interface in the dark theme. Available ammunition, values, and calibers depend on the installed mods. See [documentation maintenance](testing.md#updating-screenshots) to regenerate them.

## Overview

![Desktop view with header, caliber list, axis selectors, chart, selected ammunition, and the start of the comparison table](images/overview.png)

Language selection, settings, and the theme toggle are at the top. Choose calibers on the left, compare points in the center, and inspect a selected cartridge on the right. The table sits below the chart.

In the code, [AmmoGraphPage.razor](../Web/AmmoGraphPage.razor) assembles these sections. [GraphLayout.razor](../Web/GraphLayout.razor) supplies the page layout, and [graph.css](../wwwroot/graph.css) controls its sizing and appearance.

## Caliber filter

<img src="images/caliber-filter.png" alt="Caliber search, All/None controls, and a caliber list with symbols and checkboxes" width="280">

A checked box activates a caliber. Search narrows the displayed list; **Apply filter** makes the matches the new selection. Colors and symbols connect the list to the chart and table.

In the code: `SearchedCalibers`, `Toggle`, and `ApplyCaliberFilter` in [AmmoGraphPage](../Web/AmmoGraphPage.razor), with search rules in [AmmoSearch](../Core/AmmoSearch.cs).

## Chart and selected ammunition

![Scatter plot with a highlighted reference cartridge and its statistics in the right-hand details panel](images/chart-details.png)

Each point represents at least one ammunition variant. Clicking pins the comparison reference; repeated clicks cycle through overlapping cartridges. The details panel shows the reference and adds comparison values when another cartridge is hovered. Use the mouse wheel to zoom and drag to pan.

In the code: SVG and `SelectGroup` in [AmmoGraphPage](../Web/AmmoGraphPage.razor), comparisons in [AmmoComparison](../Core/AmmoComparison.cs), local navigation in [navigation.js](../wwwroot/navigation.js), and detail values in [ComparedValue](../Web/ComparedValue.razor).

## Comparison table

![Table with ammunition names, calibers, damage, penetration, velocity, and differences from the selected reference](images/comparison-table.png)

Numeric cells show the cartridge's value and, when a reference is selected, its difference from that reference. Search filters both the table and chart while the table is visible. The eye icon opens column selection; table headers control sorting.

In the code: `VisibleItems`, `OrderedColumns`, and `SortItems` in [AmmoGraphPage](../Web/AmmoGraphPage.razor), numeric cells in [TableValue](../Web/TableValue.razor), and column selection in [ColumnPicker](../Web/ColumnPicker.razor).

## Attributes and order

![Settings showing available and selected tooltip metrics with transfer and ordering controls](images/attribute-settings.png)

This section selects metrics for the tooltip, details panel, and both axis selectors. Available metrics are on the left; selected metrics are on the right. Buttons and drag and drop control membership and order.

In the code: [AttributePicker.razor](../Web/AttributePicker.razor) and [attribute-picker.js](../wwwroot/attribute-picker.js). `SetAttributes` on the main page applies the result.

## Personal caliber names

![Caliber name editor with a loaded caliber selector, display name input, and personal save and reset actions](images/caliber-names.png)

Visitors can assign their own display names here. **Delete name** suppresses the selected mapping in this browser. **Restore defaults** clears personal name changes and suppressions. The server file is preserved.

In the code: [CaliberNameEditor](../Web/CaliberNameEditor.razor), `SavePersonalName` and `EffectiveCaliberNames` in [AmmoGraphPage](../Web/AmmoGraphPage.razor), and overrides in [CaliberNameMap](../Core/CaliberNameMap.cs).

## Hide calibers and ammunition

![Personal caliber and ammunition exclusions with separate lists and reset actions](images/exclusions.png)

In these lists, a checked box means hidden. Entries hidden by default remain available and can be made visible again. The settings belong to the current browser.

In the code: [ExclusionEditor](../Web/ExclusionEditor.razor), exclusion state in [AmmoGraphPage](../Web/AmmoGraphPage.razor), and server defaults in [DefaultExclusions](../Core/DefaultExclusions.cs).

## Mobile view

<img src="images/mobile.png" alt="AmmoGraph at a mobile viewport width of 390 pixels, with an adapted header, filter list, axis controls, and chart" width="390">

On narrow screens, sections stack vertically and the caliber list has a limited height. This screenshot uses a 390 × 844 browser viewport; it was not captured on a physical mobile device.

In the code: media queries in [graph.css](../wwwroot/graph.css), layout sizing in [presentation.js](../wwwroot/presentation.js), and touch navigation in [navigation.js](../wwwroot/navigation.js).
