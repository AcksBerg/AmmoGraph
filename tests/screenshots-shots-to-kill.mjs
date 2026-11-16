// Capture real rendered values from the live server; no test-only endpoint is needed.
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
    const url = process.env.AMMOGRAPH_URL || 'https://localhost:6969/AmmoGraph';
    const ready = () => page.locator('.ag-app[data-ready="true"]').waitFor();
    await page.goto(url); await ready();
    const setup = await page.evaluate(() => ({
        keys: [...new Set([...document.querySelectorAll('[data-attribute^="ShotsToKillClass"]')].map(e => e.dataset.attribute))]
            .sort((a, b) => Number(a.replace('ShotsToKillClass', '')) - Number(b.replace('ShotsToKillClass', ''))),
        calibers: [...document.querySelectorAll('[data-exclude-caliber]')].map(e => ({ id: e.dataset.excludeCaliber, name: e.closest('label').querySelector('span').textContent.trim() })),
        ammo: [...document.querySelectorAll('[data-exclude-ammo]')].map(e => e.dataset.excludeAmmo)
    }));
    const key = setup.keys.at(-1);
    assert.ok(key, 'The live dataset must provide Shots to Kill metrics');
    await page.evaluate(async ({ setup, key }) => {
        const prefs = await import('/ammo-graph/preferences.js?v=26.1');
        prefs.save({ ...prefs.load(), language: 'en', calibers: setup.calibers.map(c => c.id),
            includedDefaultAmmo: setup.ammo, includedDefaultCalibers: setup.calibers.map(c => c.id),
            excludedAmmo: [], excludedCalibers: [], showPellets: false, search: '',
            columns: ['Name', 'Caliber', key], showTable: true, simulationMode: false });
    }, { setup, key });
    await page.reload(); await ready();
    const items = await page.locator('tbody tr[data-ammo]').evaluateAll((rows, { setup, key }) => rows.map(row => {
        const display = row.querySelector(`[data-column="${key}"] .ag-table-value`).textContent.trim();
        const caliber = row.querySelector('[data-column="Caliber"] span[dir="ltr"]').textContent.trim();
        return { id: row.dataset.ammo, name: row.querySelector('.ag-ammo-name').textContent.trim(), caliberId: setup.calibers.find(c => c.name === caliber)?.id,
            values: { [key]: { state: display === '100+' ? 'Capped' : /^\d+$/.test(display) ? 'Success' : 'Failed' } } };
    }), { setup, key });
    const fixture = { items };
    const capped = fixture.items.find(a => a.values[key]?.state === 'Capped');
    const successful = fixture.items.find(a => a.values[key]?.state === 'Success' && a.caliberId === 'Caliber545x39')
        || fixture.items.find(a => a.values[key]?.state === 'Success' && !a.name.includes('DO_NOT_USE'));
    assert.ok(capped && successful, 'Dataset needs successful and capped outcomes');
    const calibers = [...new Set([capped.caliberId, successful.caliberId])];
    await page.evaluate(async ({ key, calibers, selectedId, fixture }) => {
        const prefs = await import('/ammo-graph/preferences.js?v=26.1');
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
        await page.waitForFunction(() => !document.querySelector('[data-save-status]')?.textContent.trim());
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
