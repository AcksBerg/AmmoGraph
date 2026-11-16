export async function openSettingsSection(page, scope) {
    const menu=page.locator('.ag-exclusions');
    if(!(await menu.evaluate(e=>e.open)))await menu.locator('summary').first().click();
    const section=page.locator(`[data-settings-section="${scope}"]`);
    if(!(await section.evaluate(e=>e.open)))await section.locator('summary').first().click();
    return section;
}
