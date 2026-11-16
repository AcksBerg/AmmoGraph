// Run against tests/SimulationHost; fixture values choose representative real results.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openSettingsSection } from './settings-helper.mjs';

const output = fileURLToPath(new URL('../docs/images/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true
});
try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true,
        viewport: { width: 1600, height: 1100 }, colorScheme: 'dark', locale: 'en-US' });
    const page = await context.newPage();
    const url = process.env.AMMOGRAPH_URL || 'http://127.0.0.1:6973/AmmoGraph';
    const ready = () => page.locator('.ag-app[data-ready="true"]').waitFor();
    await page.goto(url); await ready();
    const fixture = await (await context.request.get(new URL('/test/shots-to-kill', url).href)).json();
    const key = fixture.metrics.at(-1).key;
    const capped = fixture.items.find(a => a.values[key]?.state === 'Capped');
    const successful = fixture.items.find(a => a.values[key]?.state === 'Success' && a.caliberId === capped?.caliberId)
        || fixture.items.find(a => a.values[key]?.state === 'Success');
    assert.ok(capped && successful, 'Dataset needs successful and capped outcomes');
    const calibers = [...new Set([capped.caliberId, successful.caliberId])];
    await page.evaluate(async ({ key, calibers, selectedId, fixture }) => {
        const prefs = await import('/ammo-graph/preferences.js?v=24.2');
        prefs.save({ ...prefs.load(), language: 'en', calibers, showPellets: false,
            search: '', excludedAmmo: [], excludedCalibers: [], selectedId,
            includedDefaultAmmo: fixture.items.map(a => a.id), includedDefaultCalibers: calibers,
            columns: ['Name', 'Damage', 'PenetrationPower', key],
            xColumns: ['Damage', 'PenetrationPower', key], yColumns: ['Damage', 'PenetrationPower', key],
            tooltipColumns: ['Damage', key], detailColumns: ['Damage', 'PenetrationPower', key],
            xAxis: key, yAxis: 'Damage', sortKey: key, descending: false,
            showTable: true, showDetails: true, simulationMode: false });
    }, { key, calibers, selectedId: successful.id, fixture });
    await page.reload(); await ready();
    assert.equal(await page.locator('.ag-app').getAttribute('lang'), 'en');
    const capture = async (name, locator) => {
        await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        await locator.screenshot({ path: `${output}${name}.png` });
        console.log(`Saved ${name}.png`);
    };
    await capture('shots-to-kill-graph', page.locator('.ag-analysis'));
    // Keep the cropped table readable while showing the capped outcome first.
    await page.locator(`th[data-column="${key}"] button`).click();
    await page.waitForFunction(key => document.querySelector(`th[data-column="${key}"]`)?.getAttribute('aria-sort') === 'descending', key);
    assert.ok((await page.locator(`td[data-column="${key}"] .ag-table-value`).allTextContents()).some(t => t.trim() === '100+'));
    await capture('shots-to-kill-table', page.locator('.ag-table-panel'));
    await page.evaluate(() => scrollTo(0, 0));
    await openSettingsSection(page, 'attributes');
    await page.locator('[data-attributes="axes"] > summary').click();
    await page.locator('[data-attributes="axes"] [data-side="available"]').evaluate(e => e.scrollTop = e.scrollHeight);
    await capture('shots-to-kill-attributes', page.locator('.ag-exclusions .ag-menu-panel'));
    await context.close();
} finally { await browser.close(); }
