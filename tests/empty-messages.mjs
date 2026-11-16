import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openSettingsSection } from './settings-helper.mjs';
import { setAttribute } from './transfer-helper.mjs';

const artifacts = fileURLToPath(new URL('../artifacts/', import.meta.url));
await mkdir(artifacts, { recursive: true });
const url = process.env.AMMOGRAPH_URL || 'https://localhost:6969/AmmoGraph';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1100 }, colorScheme: 'dark' });
const page = await context.newPage(), errors = [], passed = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text()); });
async function until(fn) { for (let n = 0; n < 150; n++) { if (await fn()) return; await page.waitForTimeout(100); } throw Error('UI timeout'); }
async function check(name, fn) { await fn(); passed.push(name); console.log('PASS', name); }
async function assertError(selector, light = false) {
    const node = page.locator(selector);
    await node.waitFor({ state: 'visible' });
    assert.equal(await node.getAttribute('role'), 'status', 'Preserve polite accessible announcements');
    const style = await node.evaluate(e => { const s = getComputedStyle(e); return { color: s.color, background: s.backgroundColor, border: s.borderLeftColor, width: s.borderLeftWidth }; });
    assert.deepEqual(style, light
        ? { color: 'rgb(156, 22, 36)', background: 'rgb(255, 240, 241)', border: 'rgb(180, 35, 54)', width: '4px' }
        : { color: 'rgb(255, 180, 180)', background: 'rgb(66, 30, 36)', border: 'rgb(255, 112, 112)', width: '4px' });
}
try {
    await page.goto(url); await page.locator('.ag-app[data-ready="true"]').waitFor();
    await page.locator('#ag-language').selectOption('en');
    await check('Empty caliber selection uses the shared error styling in graph and table', async () => {
        await page.locator('.ag-bulk button').last().click();
        await assertError('.ag-chart-empty'); await assertError('.ag-table-empty');
        const message = await page.locator('.ag-chart-empty').textContent();
        await page.locator('.ag-table-heading input.ag-input').fill('still empty');
        assert.equal(await page.locator('.ag-chart-empty').textContent(), message);
        await assertError('.ag-table-empty');
        await page.screenshot({ path: artifacts + 'empty-messages-dark.png', fullPage: true });
    });
    await check('Light theme uses the same red error palette', async () => {
        await page.emulateMedia({ colorScheme: 'light' });
        await assertError('.ag-chart-empty', true); await assertError('.ag-table-empty', true);
        await page.emulateMedia({ colorScheme: 'dark' });
    });
    await check('Search with no matches is red and resolves when the search is cleared', async () => {
        await page.locator('.ag-bulk button').first().click();
        await page.locator('.ag-table-heading input.ag-input').fill('AmmoGraph-no-match-947231');
        await assertError('.ag-chart-empty'); await assertError('.ag-table-empty');
        await page.locator('.ag-table-heading input.ag-input').fill('');
        await page.locator('.ag-chart-empty').waitFor({ state: 'detached' });
        await page.locator('.ag-table-empty').waitFor({ state: 'detached' });
    });
    await check('Missing axis attributes show a graph error without hiding table data', async () => {
        const section = await openSettingsSection(page, 'attributes');
        const picker = section.locator('[data-attributes=axes]');
        await picker.locator('summary').click();
        for (const key of ['Damage', 'PenetrationPower', 'InitialSpeed']) await setAttribute(picker, key, false);
        await page.keyboard.press('Escape');
        await assertError('.ag-chart-empty');
        assert.equal(await page.locator('.ag-table-empty').count(), 0);
        assert.ok(await page.locator('tr[data-ammo]').count() > 0);
    });
    await check('German messages remain localized, persistent and usable on a narrow viewport', async () => {
        await page.locator('#ag-language').selectOption('de');
        await page.locator('.ag-app[lang=de]').waitFor();
        await page.locator('.ag-bulk button').last().click();
        await page.setViewportSize({ width: 390, height: 844 });
        await assertError('.ag-chart-empty'); await assertError('.ag-table-empty');
        assert.ok(!(await page.locator('.ag-table-empty').textContent()).includes('Select'));
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: artifacts + 'empty-messages-mobile.png', fullPage: true });
        await page.reload(); await page.locator('.ag-app[data-ready="true"]').waitFor();
        await assertError('.ag-chart-empty'); await assertError('.ag-table-empty');
    });
    assert.deepEqual(errors, []);
    await writeFile(artifacts + 'empty-messages-checks.json', JSON.stringify({ url, passed, errors }, null, 2));
} catch (error) {
    await page.screenshot({ path: artifacts + 'empty-messages-failure.png', fullPage: true }).catch(() => {});
    throw error;
} finally { await browser.close(); }
