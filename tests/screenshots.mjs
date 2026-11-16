// Documentation images: use an isolated browser context, never the user's profile.
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openSettingsSection } from './settings-helper.mjs';

const output = fileURLToPath(new URL('../docs/images/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true
});
try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true,
        viewport: { width: 1600, height: 1400 }, colorScheme: 'dark', locale: 'en-US' });
    const page = await context.newPage();
    await page.goto(process.env.AMMOGRAPH_URL || 'https://localhost:6969/AmmoGraph', { waitUntil: 'networkidle' });
    await page.locator('.ag-app[data-ready="true"]').waitFor();
    await page.locator('#ag-language').selectOption('en');
    await page.locator('.ag-app[lang="en"]').waitFor();
    await page.locator('.ag-ammo-name').first().click();
    await page.locator('[data-detail="Name"]').waitFor();
    // Wait for fonts and two painted frames before each capture.
    const capture = async (name, locator = page) => {
        await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        await locator.screenshot({ path: `${output}${name}.png` });
        console.log(`Saved ${name}.png`);
    };
    await page.evaluate(() => scrollTo(0, 0));
    await capture('overview');
    await capture('chart-details', page.locator('.ag-analysis'));
    await capture('caliber-filter', page.locator('.ag-sidebar'));
    await capture('comparison-table', page.locator('.ag-table-panel'));
    await page.evaluate(() => scrollTo(0, 0));
    await openSettingsSection(page, 'view');
    await capture('view-settings', page.locator('.ag-exclusions .ag-menu-panel'));
    await openSettingsSection(page, 'attributes');
    await page.locator('[data-attributes="tooltip"]>summary').click();
    await capture('attribute-settings', page.locator('.ag-exclusions .ag-menu-panel'));
    await openSettingsSection(page, 'caliber-names');
    await capture('caliber-names', page.locator('.ag-exclusions .ag-menu-panel'));
    await openSettingsSection(page, 'exclusions');
    await capture('exclusions', page.locator('.ag-exclusions .ag-menu-panel'));
    await page.keyboard.press('Escape');
    await context.close();
} finally {
    await browser.close();
}
