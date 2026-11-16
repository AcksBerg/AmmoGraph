import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const artifacts = fileURLToPath(new URL('../artifacts/', import.meta.url));
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1300 }, colorScheme: 'dark' });
const page = await context.newPage(), errors = [], passed = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
async function until(fn) { for (let i = 0; i < 150; i++) { if (await fn()) return; await page.waitForTimeout(100); } throw Error('UI timeout'); }
async function readyResult() {
    await page.waitForTimeout(500);
    await until(async () => await page.locator('.ag-sim-results').count() && !await page.locator('.ag-sim-stale,.ag-sim-error').count() && await page.locator('[data-simulator]').getAttribute('data-running') === 'false');
    await until(async () => await page.locator('.ag-simulation-chart').getAttribute('data-zoom') !== null);
}
async function check(name, action) { await action(); passed.push(name); console.log('PASS', name); }
const capacity = () => page.locator('[data-magazine-capacity]');
async function setCapacity(n) { await capacity().fill(String(n)); await capacity().press('Tab'); await readyResult(); }
const cpc = '5e4ac41886f77406a511c9a8', plate = '656fae5f7c2d57afe200c0d7';
const caliber = id => page.locator(`.ag-caliber[data-caliber="${id}"] input`);
try {
    await page.goto(process.env.AMMOGRAPH_URL || 'http://127.0.0.1:6973/AmmoGraph');
    await page.locator('.ag-app[data-ready="true"]').waitFor();
    await page.locator('#ag-language').selectOption('en');
    await page.locator('[data-view-toggle]').click();
    await caliber('Caliber545x39').check();
    await page.locator('tbody tr[data-ammo] .ag-sim-table-actions button').nth(1).click();
    await readyResult();
    await check('Default magazine, mean death threshold, and reversible post-death visibility', async () => {
        assert.equal(await capacity().inputValue(), '30');
        const death = Number(await page.locator('.ag-sim-results').getAttribute('data-death-shot'));
        assert.ok(death > 0 && death < 30);
        assert.equal(await page.locator('.ag-sim-shot').count(), death);
        assert.equal(Number(await page.locator('[data-death-line]').getAttribute('data-death-line')), death);
        await page.locator('[data-show-after-death]').check();
        await until(async () => await page.locator('.ag-sim-shot').count() === 30);
        await page.locator('[data-shot="30"]').focus();
        await page.locator('[data-show-after-death]').uncheck();
        await until(async () => await page.locator('.ag-sim-shot').count() === death);
        assert.ok(!(await page.locator('.ag-sim-shot-details h3').innerText()).includes('Shot 30 '));
    });
    await check('One and 100 rounds, no death marker for a nonlethal magazine, and capacity bounds', async () => {
        await setCapacity(1);
        assert.equal(await page.locator('.ag-magazine-preview li').count(), 1);
        assert.equal(await page.locator('.ag-sim-shot').count(), 1);
        assert.equal(await page.locator('[data-death-line]').count(), 0);
        await page.locator('[data-show-after-death]').check();
        await setCapacity(100);
        assert.equal(await page.locator('.ag-magazine-preview li').count(), 100);
        assert.equal(await page.locator('.ag-sim-shot').count(), 100);
        await setCapacity(0); assert.equal(await capacity().inputValue(), '1');
        await setCapacity(101); assert.equal(await capacity().inputValue(), '100');
    });
    await check('Fixed-insert labels and shared carrier, plate choices, and zone across caliber changes', async () => {
        assert.ok((await page.locator('[data-armor] option').allTextContents()).some(t => t.endsWith('(Only fixed insert)')));
        assert.ok(!(await page.locator(`[data-armor] option[value="${cpc}"]`).innerText()).includes('(Only fixed insert)'));
        await page.locator('[data-armor]').selectOption(cpc);
        await page.locator('[data-slot="front_plate"] select').selectOption('');
        await page.locator('[data-zone]').selectOption('Back');
        await caliber('Caliber556x45NATO').check();
        await page.locator('[data-simulator][data-caliber="Caliber556x45NATO"]').waitFor();
        assert.equal(await page.locator('[data-armor]').inputValue(), cpc);
        assert.equal(await page.locator('[data-zone]').inputValue(), 'Back');
        await page.locator('[data-zone]').selectOption('Front');
        assert.equal(await page.locator('[data-slot="front_plate"] select').inputValue(), '');
        await page.locator('[data-slot="front_plate"] select').selectOption(plate);
        await caliber('Caliber545x39').check();
        await page.locator('[data-simulator][data-caliber="Caliber545x39"]').waitFor();
        assert.equal(await page.locator('[data-armor]').inputValue(), cpc);
        assert.equal(await page.locator('[data-zone]').inputValue(), 'Front');
        assert.equal(await page.locator('[data-slot="front_plate"] select').inputValue(), plate);
        assert.equal(await capacity().inputValue(), '100');
        await readyResult();
    });
    await check('Wheel zoom, drag pan, reset, keyboard, and selection preserve the viewport', async () => {
        await page.locator('[data-show-after-death]').check();
        const chart = page.locator('.ag-simulation-chart');
        await chart.scrollIntoViewIfNeeded();
        const bounds = await chart.boundingBox();
        await page.mouse.move(bounds.x + bounds.width * .5, bounds.y + bounds.height * .45);
        await page.mouse.wheel(0, -500);
        await until(async () => Number(await chart.getAttribute('data-zoom')) > 1.5);
        const zoom = Number(await chart.getAttribute('data-zoom'));
        const beforeX = Number(await chart.getAttribute('data-view-x-min'));
        await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width * .58, bounds.y + bounds.height * .5, { steps: 8 }); await page.mouse.up();
        await until(async () => Math.abs(Number(await chart.getAttribute('data-view-x-min')) - beforeX) > .1);
        await page.locator('[data-shot="50"]').focus();
        assert.ok(Math.abs(Number(await chart.getAttribute('data-zoom')) - zoom) < 1e-10);
        await page.locator('[data-sim-nav="reset"]').click();
        await until(async () => Number(await chart.getAttribute('data-zoom')) === 1);
        await chart.focus(); await page.keyboard.press('+');
        await until(async () => Number(await chart.getAttribute('data-zoom')) > 1);
        await page.keyboard.press('ArrowRight');
        await page.keyboard.press('Home');
        await until(async () => Number(await chart.getAttribute('data-zoom')) === 1);
        assert.ok(!await chart.evaluate(e => /NaN|Infinity/.test(e.outerHTML)));
        await page.waitForTimeout(350); // Let drag click-suppression expire before a fresh click.
        await page.locator('[data-shot="100"]').click();
        await until(async () => (await page.locator('.ag-sim-shot-details h3').innerText()).includes('100'));
    });
    await check('Capacity and shared equipment survive reload and localize with the rest of the simulator', async () => {
        await page.reload();
        await page.locator('.ag-app[data-ready="true"]').waitFor();
        await readyResult();
        assert.equal(await capacity().inputValue(), '100');
        assert.equal(await page.locator('[data-armor]').inputValue(), cpc);
        assert.equal(await page.locator('[data-slot="front_plate"] select').inputValue(), plate);
        await page.locator('#ag-language').selectOption('de');
        await until(async () => (await page.locator('.ag-magazine-capacity').innerText()).includes('Magazingröße'));
        assert.ok((await page.locator('.ag-sim-chart-controls').innerText()).includes('Schüsse nach dem Tod anzeigen'));
        await page.locator('#ag-language').selectOption('en');
    });
    await page.locator('.ag-app[lang="en"]').waitFor();
    await setCapacity(30);
    await page.locator('[data-show-after-death]').check();
    await page.locator('.ag-sim-results').screenshot({ path: artifacts + 'simulation-0.24.0-results.png' });
    await page.locator('[data-simulator]').screenshot({ path: artifacts + 'simulation-0.24.0.png' });
    assert.deepEqual(errors, []);
    await writeFile(artifacts + 'simulation-0.24.0-checks.json', JSON.stringify({ passed, errors }, null, 2));
} catch (e) {
    await page.screenshot({ path: artifacts + 'simulation-0.24.0-failure.png', fullPage: true }).catch(() => {});
    throw e;
} finally { await browser.close(); }
