import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { openSettingsSection } from './settings-helper.mjs';

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, colorScheme: 'dark', ignoreHTTPSErrors: true });
const page = await context.newPage();
const errors = [], passed = [];
const artifacts = fileURLToPath(new URL('../artifacts/', import.meta.url));
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
const url = process.env.AMMOGRAPH_URL || 'http://127.0.0.1:6973/AmmoGraph';
const ready = () => page.locator('.ag-app[data-ready="true"]').waitFor();
async function until(fn) { for (let i = 0; i < 150; i++) { if (await fn()) return; await page.waitForTimeout(100); } throw Error('UI timeout'); }
async function check(name, fn) { await fn(); passed.push(name); console.log('PASS', name); }
const saved = () => page.evaluate(async () => (await import('/ammo-graph/preferences.js?v=26.1')).load());
const names = () => page.getByRole('checkbox', { name: 'Show all names', exact: true });
async function result() {
    await page.waitForTimeout(450);
    await until(async () => await page.locator('.ag-sim-results').count() === 1 && await page.locator('.ag-sim-error').count() === 0 && await page.locator('.ag-sim-stale').count() === 0 && await page.locator('[data-simulator]').getAttribute('data-running') === 'false');
}
await mkdir(artifacts, { recursive: true });
try {
    await page.goto(url); await ready();
    await page.locator('#ag-language').selectOption('en');
    await check('New visitors get names; explicit false survives reload', async () => {
        assert.equal(await names().isChecked(), true);
        await names().uncheck();
        await until(async () => (await saved())?.showNames === false);
        await page.reload(); await ready();
        assert.equal(await names().isChecked(), false);
        await names().check();
        await until(async () => (await saved()).showNames === true);
        for (const width of [390, 768, 1600]) {
            await page.setViewportSize({ width, height: 1100 });
            await page.waitForTimeout(80); // Let layout and label fitting settle before measuring.
            const boxes = await page.locator('.ag-point-name:visible').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect()).map(b => ({ left: b.left, right: b.right, top: b.top, bottom: b.bottom })));
            for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
                const a = boxes[i], b = boxes[j];
                assert.ok(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom, 'Visible default graph labels do not overlap');
            }
        }
    });
    await check('Applied and persisted feedback is distinct and rapid changes settle on the latest value', async () => {
        await names().uncheck();
        await until(async () => (await page.locator('[data-save-status]').textContent()).includes('Applied'));
        await names().check(); await names().uncheck();
        await until(async () => (await page.locator('[data-save-status]').textContent()).includes('Saved'));
        assert.equal((await saved()).showNames, false);
    });
    await check('Failed browser persistence stays visible through unrelated actions and can be retried', async () => {
        await page.evaluate(() => {
            window.cookieDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
            Object.defineProperty(Document.prototype, 'cookie', { ...window.cookieDescriptor, set() {} });
        });
        await names().check();
        await page.locator('[data-save-error]').waitFor({ state: 'visible' });
        assert.equal(await page.locator('[data-save-error] [role=alert]').isVisible(), true);
        await page.locator('.ag-point').first().focus();
        assert.equal(await page.locator('[data-save-error]').isVisible(), true);
        assert.equal((await saved()).showNames, false);
        await page.evaluate(() => Object.defineProperty(Document.prototype, 'cookie', window.cookieDescriptor));
        await page.locator('[data-retry-save]').click();
        await page.locator('[data-save-error]').waitFor({ state: 'hidden' });
        assert.equal((await saved()).showNames, true);
    });
    await check('Graph attribute shortcut and labeled settings categories open the existing sections', async () => {
        await page.locator('.ag-attribute-shortcut').click();
        assert.equal(await page.locator('.ag-exclusions').evaluate(e => e.open), true);
        assert.equal(await page.locator('[data-settings-section=attributes]').evaluate(e => e.open), true);
        assert.equal(await page.locator('.ag-settings-categories [data-open-settings=attributes]').getAttribute('aria-pressed'), 'true');
        await page.locator('.ag-settings-categories [data-open-settings=view]').click();
        assert.equal(await page.locator('[data-settings-section=view]').evaluate(e => e.open), true);
        assert.equal(await page.locator('[data-settings-section=attributes]').evaluate(e => e.open), false);
        assert.ok((await page.locator('.ag-exclusion-panel').textContent()).includes('save automatically'));
        await page.keyboard.press('Escape');
        assert.ok((await page.locator('.ag-column-picker>summary').textContent()).trim().length > 3);
    });
    await check('Table resizing works with dragging, separator keys and slider; sorting and reload remain functional', async () => {
        const handle = page.locator('[data-table-resize]'), slider = page.locator('[data-table-height]');
        await handle.scrollIntoViewIfNeeded();
        const box = await handle.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 80, { steps: 5 }); await page.mouse.up();
        await until(async () => await slider.inputValue() === '440');
        await handle.focus(); await page.keyboard.press('ArrowDown');
        await until(async () => await slider.inputValue() === '460');
        await slider.focus(); await page.keyboard.press('ArrowLeft');
        await until(async () => await slider.inputValue() === '440');
        await until(async () => (await saved()).tableHeight === 440);
        await page.locator('th[data-column=Damage] button').click();
        await until(async () => await page.locator('th[data-column=Damage]').getAttribute('aria-sort') === 'ascending');
        await page.locator('tr[data-ammo] .ag-ammo-name').first().click();
        assert.ok(await page.locator('[data-detail=Name]').textContent());
        await page.reload(); await ready();
        assert.equal(await slider.inputValue(), '440');
        assert.equal(Math.round((await page.locator('#ag-ammunition-table').boundingBox()).height), 440);
        await until(async () => !(await page.locator('[data-save-status]').textContent()));
        await page.locator('.ag-table-panel').screenshot({ path: artifacts + 'usability-table.png' });
    });
    await check('Simulator navigation is labeled and invalid recipes stay red and accessible near the editor', async () => {
        assert.ok((await page.locator('[data-view-toggle]').textContent()).toLowerCase().includes('ballistics simulator'));
        await page.locator('[data-view-toggle]').click();
        await page.locator('[data-simulator]').waitFor();
        assert.ok((await page.locator('[data-view-toggle]').textContent()).includes('Ammo Graph'));
        const error = page.locator('#ag-magazine-error');
        await error.waitFor({ state: 'visible' });
        assert.equal(await error.getAttribute('role'), 'alert');
        assert.equal(await page.locator('.ag-magazine-editor').getAttribute('aria-describedby'), 'ag-magazine-error');
        const color = await error.evaluate(e => getComputedStyle(e).borderLeftColor);
        assert.equal(color, 'rgb(255, 112, 112)');
        await page.emulateMedia({ colorScheme: 'light' });
        assert.equal(await error.evaluate(e => getComputedStyle(e).borderLeftColor), 'rgb(180, 35, 54)');
        await page.emulateMedia({ colorScheme: 'dark' });
        await page.locator('.ag-armor-editor input[type=search]').fill('armor');
        assert.equal(await error.isVisible(), true);
        await page.locator('#ag-language').selectOption('de');
        await page.locator('.ag-app[lang=de]').waitFor();
        assert.ok((await error.textContent()).includes('Mittelmuster'));
        await page.locator('#ag-language').selectOption('en');
        await page.locator('.ag-armor-editor input[type=search]').fill('');
        await page.locator('.ag-caliber[data-caliber=Caliber545x39] input').check();
        assert.ok(await page.locator('tr[data-ammo]').first().locator('td').first().evaluate(e => e.classList.contains('ag-sim-table-actions')));
        await page.locator('tr[data-ammo]').first().locator('.ag-sim-table-actions button').nth(1).click();
        await result();
        assert.equal(await error.count(), 0);
    });
    await check('Chart legend includes units and threshold; help, names and keyboard shot selection work', async () => {
        await page.locator('[data-armor]').selectOption('5e4ac41886f77406a511c9a8'); await result();
        const legend = await page.locator('.ag-sim-legend').textContent();
        assert.ok(legend.includes('85 HP cumulative mean damage threshold'));
        assert.ok(legend.includes('Penetration probability (%)'));
        assert.ok(legend.includes('Durability (% of original maximum)'));
        assert.ok(legend.includes('HP'));
        await page.locator('.ag-sim-help>summary').click();
        assert.equal(await page.locator('.ag-sim-help li:visible').count(), 6);
        assert.ok((await page.locator('.ag-sim-help').textContent()).includes('not a kill probability'));
        assert.equal(await page.locator('[data-sim-ammo-names]').isChecked(), true);
        assert.ok(await page.locator('.ag-sim-ammo-name:visible').count() > 0);
        await page.locator('.ag-sim-help>summary').click();
        await until(async () => !(await page.locator('[data-save-status]').textContent()));
        await page.locator('.ag-sim-results').screenshot({ path: artifacts + 'usability-chart-overview.png' });
        await page.locator('[data-shot="1"]').focus(); await page.keyboard.press('ArrowRight');
        await until(async () => (await page.locator('.ag-sim-shot-details h3').textContent()).includes('2'));
        await page.locator('[data-sim-ammo-names]').uncheck();
        await until(async () => (await saved()).simAmmoNames === false);
        assert.equal(await page.locator('.ag-sim-ammo-name').count(), 0);
        await page.reload(); await ready(); await result();
        assert.equal(await page.locator('[data-sim-ammo-names]').isChecked(), false);
        await page.locator('[data-sim-ammo-names]').check();
        await page.locator('[data-show-after-death]').check();
        await page.locator('[data-magazine-capacity]').fill('100'); await page.locator('[data-magazine-capacity]').press('Tab'); await result();
        assert.equal(await page.locator('.ag-sim-ammo-name:visible').count(), 0, 'Crowded names hide until zoomed');
        for (let i = 0; i < 4; i++) await page.locator('[data-sim-nav=in]').click();
        await until(async () => await page.locator('.ag-sim-ammo-name:visible').count() > 0);
        const boxes = await page.locator('.ag-sim-ammo-name:visible').evaluateAll(nodes => nodes.map(n => n.getBoundingClientRect()).map(b => ({ left: b.left, right: b.right })));
        for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i].left >= boxes[i - 1].right, 'Names do not overlap after zoom');
        await until(async () => !(await page.locator('[data-save-status]').textContent()));
        await page.locator('.ag-sim-results').screenshot({ path: artifacts + 'usability-chart.png' });
    });
    await check('Table remove action clears ammunition and exposes recipe validation', async () => {
        const remove = page.locator('.ag-sim-table-actions button').filter({ hasText: 'Remove' }).and(page.locator('button:enabled')).first();
        await remove.click();
        await page.locator('#ag-magazine-error').waitFor({ state: 'visible' });
        assert.equal(await page.locator('[data-middle-index]').count(), 0);
    });
    await check('Narrow viewports keep labeled navigation, menus and a bounded scrollable table', async () => {
        for (const width of [320, 390, 768]) {
            await page.setViewportSize({ width, height: 740 });
            await page.locator('[data-view-toggle]').scrollIntoViewIfNeeded();
            assert.equal(await page.locator('[data-view-toggle] span').isVisible(), true);
            const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
            assert.ok(overflow <= 1, `No page overflow at ${width}px: ${overflow}`);
            await openSettingsSection(page, 'attributes');
            const menu = await page.locator('.ag-exclusion-panel').boundingBox();
            assert.ok(menu.x >= 0 && menu.x + menu.width <= width + 1);
            await page.keyboard.press('Escape');
            const tableHeight = (await page.locator('#ag-ammunition-table').boundingBox()).height;
            assert.ok(tableHeight >= 160 && tableHeight <= 481);
        }
        await page.setViewportSize({ width: 390, height: 740 });
        await page.screenshot({ path: artifacts + 'usability-mobile.png', fullPage: true });
    });
    await check('Legacy browser preference migration preserves an explicit choice to hide names', async () => {
        const legacyContext = await browser.newContext({ ignoreHTTPSErrors: true });
        await legacyContext.addInitScript(() => localStorage.setItem('spt-ammo-graph.preferences.v1', JSON.stringify({ calibers: ['Caliber545x39'], xAxis: 'Damage', yAxis: 'PenetrationPower', dynamicScale: true, showNames: false, wholeLoad: true })));
        const legacy = await legacyContext.newPage(); await legacy.goto(url);
        await legacy.locator('.ag-app[data-ready="true"]').waitFor();
        assert.equal(await legacy.locator('.ag-chart-options input[type=checkbox]').last().isChecked(), false);
        await until(async () => await legacy.evaluate(() => document.cookie.includes('spt-ammo-graph.v2')));
        assert.equal(await legacy.evaluate(() => localStorage.getItem('spt-ammo-graph.preferences.v1')), null);
        await legacyContext.close();
    });
    assert.deepEqual(errors, []);
    await writeFile(artifacts + 'usability-checks.json', JSON.stringify({ passed, errors }, null, 2));
} catch (error) {
    await page.screenshot({ path: artifacts + 'usability-failure.png', fullPage: true }).catch(() => {});
    throw error;
} finally { await browser.close(); }
