import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../artifacts/', import.meta.url));
await mkdir(output, { recursive: true });
const url = process.env.AMMOGRAPH_URL || 'https://127.0.0.1:6969/AmmoGraph';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1200 }, colorScheme: 'dark' });
const page = await context.newPage(), errors = [], passed = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
async function until(fn) { for (let i = 0; i < 200; i++) { if (await fn()) return; await page.waitForTimeout(100); } throw Error('UI timeout'); }
async function result() {
    await page.waitForTimeout(500);
    await until(async () => await page.locator('.ag-sim-results').count() && !await page.locator('.ag-sim-error,.ag-sim-stale').count() && await page.locator('[data-simulator]').getAttribute('data-running') === 'false');
}
async function check(name, fn) { await fn(); passed.push(name); console.log('PASS', name); }
async function caliber(id) { await page.locator(`.ag-caliber[data-caliber="${id}"] input`).check(); await page.locator(`[data-simulator][data-caliber="${id}"]`).waitFor(); }
async function capacity(n, hasRecipe = true) { await page.locator('[data-magazine-capacity]').fill(String(n)); await page.locator('[data-magazine-capacity]').press('Tab'); if (hasRecipe) await result(); }
async function rate(n) { await page.locator('[data-pellet-hit-rate]').fill(String(n)); await page.locator('[data-pellet-hit-rate]').press('Tab'); await result(); }
const meanHits = async () => Number(await page.locator('[data-mean-pellet-hits]').getAttribute('data-mean-pellet-hits'));
const damage = async () => Number((await page.locator('.ag-sim-stats dd').nth(1).innerText()).replace(/[^0-9.]/g, ''));
try {
    for (let attempt = 0; ; attempt++) {
        try { await page.goto(url); break; }
        catch (e) { if (attempt >= 59 || !e.message.includes('ERR_CONNECTION_REFUSED')) throw e; await page.waitForTimeout(500); }
    }
    await page.locator('.ag-app[data-ready="true"]').waitFor({ timeout: 60000 });
    await page.locator('#ag-language').selectOption('en');
    await page.locator('[data-view-toggle]').click();
    await caliber('Caliber545x39');
    const firstRow = () => page.locator('tbody tr[data-ammo]').first();
    await firstRow().locator('.ag-sim-table-actions button').nth(1).click();
    await capacity(75);
    await firstRow().locator('.ag-sim-table-actions button').nth(0).click();
    await firstRow().locator('.ag-sim-table-actions button').nth(2).click();
    await result();
    await check('Magazine capacity follows new and cached calibers', async () => {
        await caliber('Caliber12g');
        assert.equal(await page.locator('[data-magazine-capacity]').inputValue(), '75');
        await page.locator('tbody tr[data-ammo]').filter({ hasText: /buckshot/i }).first().locator('.ag-sim-table-actions button').nth(1).click();
        await result();
        assert.equal(await page.locator('[data-pellet-hit-rate]').inputValue(), '100');
        await capacity(60);
        await caliber('Caliber545x39'); await result();
        assert.equal(await page.locator('[data-magazine-capacity]').inputValue(), '60');
        assert.equal(await page.locator('.ag-magazine-preview li').count(), 60);
        await caliber('Caliber12g'); await result();
        assert.equal(await page.locator('[data-magazine-capacity]').inputValue(), '60');
    });
    let pellets, fullDamage;
    await check('100% hits the whole load; 0% still hits exactly one pellet', async () => {
        pellets = Number(await page.locator('[data-mean-pellet-hits]').getAttribute('data-pellet-count'));
        assert.ok(pellets > 1);
        assert.equal(await meanHits(), pellets);
        fullDamage = await damage();
        await rate(0);
        assert.equal(await meanHits(), 1);
        assert.equal(Number(await page.locator('[data-example-pellet-hits]').getAttribute('data-example-pellet-hits')), 1);
        assert.ok(Math.abs(await damage() - fullDamage / pellets) < .02);
        await page.locator('[data-show-after-death]').check();
        for (const n of [1, 2, 10, 30, 60]) {
            await page.locator(`[data-shot="${n}"]`).focus();
            await until(async () => (await page.locator('.ag-sim-shot-details h3').innerText()).includes(`Shot ${n} `));
            assert.equal(Number(await page.locator('[data-example-pellet-hits]').getAttribute('data-example-pellet-hits')), 1);
        }
        await page.locator('[data-shot="1"]').focus();
    });
    await check('50% achieves the requested mean and proportionate damage with variable sample hits', async () => {
        await rate(50);
        assert.ok(Math.abs(await meanHits() - pellets * .5) < .15);
        assert.ok(Math.abs(await damage() - fullDamage * .5) < fullDamage * .04);
        const exampleHits = new Set();
        for (const n of [1, 2, 3, 4, 5, 6]) {
            await page.locator(`[data-shot="${n}"]`).focus();
            await until(async () => (await page.locator('.ag-sim-shot-details h3').innerText()).includes(`Shot ${n} `));
            const hits = Number(await page.locator('[data-example-pellet-hits]').getAttribute('data-example-pellet-hits'));
            assert.ok(hits >= 1 && hits <= pellets); exampleHits.add(hits);
        }
        assert.ok(exampleHits.size > 1);
    });
    await check('Shrinking the shared magazine fixes cached start/end counts and leaves rifle shots unchanged', async () => {
        await capacity(1);
        await caliber('Caliber545x39'); await result();
        assert.equal(await page.locator('[data-magazine-capacity]').inputValue(), '1');
        assert.equal(await page.locator('.ag-magazine-preview li').count(), 1);
        assert.equal(await page.locator('.ag-magazine-editor > .ag-magazine-block input[type="checkbox"]:checked').count(), 0);
        assert.equal(await page.locator('[data-pellet-hit-rate],[data-mean-pellet-hits]').count(), 0);
        const before = await damage();
        await caliber('Caliber12g'); await result(); await rate(0);
        await caliber('Caliber545x39'); await result();
        assert.equal(await damage(), before);
        await caliber('Caliber556x45NATO');
        assert.equal(await page.locator('[data-magazine-capacity]').inputValue(), '1');
        await capacity(40, false);
        await caliber('Caliber12g'); await result();
        assert.equal(await page.locator('[data-magazine-capacity]').inputValue(), '40');
        await rate(50);
    });
    await check('Shared capacity and pellet accuracy survive reload and use translated labels', async () => {
        await page.reload(); await page.locator('.ag-app[data-ready="true"]').waitFor(); await result();
        assert.equal(await page.locator('[data-magazine-capacity]').inputValue(), '40');
        assert.equal(await page.locator('[data-pellet-hit-rate]').inputValue(), '50');
        await page.locator('#ag-language').selectOption('de');
        await until(async () => (await page.locator('[data-pellet-hit-rate]').locator('..').innerText()).includes('Pellet-Trefferquote'));
        await page.locator('#ag-language').selectOption('en');
        await page.locator('.ag-app[lang="en"]').waitFor();
    });
    await page.locator('[data-show-after-death]').check();
    await page.locator('[data-simulator]').screenshot({ path: output + 'simulation-pellets.png' });
    await page.locator('.ag-sim-results').screenshot({ path: output + 'simulation-pellets-results.png' });
    await check('Older browser preferences without a pellet percentage load with 100%', async () => {
        await page.evaluate(async () => {
            const module = await import('/ammo-graph/preferences.js?v=24.2');
            const saved = module.load(); delete saved.simulator.pelletHitPercent;
            if (!module.save(saved)) throw Error('Could not save legacy preferences');
        });
        await page.reload(); await page.locator('.ag-app[data-ready="true"]').waitFor(); await result();
        assert.equal(await page.locator('[data-pellet-hit-rate]').inputValue(), '100');
        assert.equal(await page.locator('[data-magazine-capacity]').inputValue(), '40');
        assert.equal(await meanHits(), pellets);
    });
    assert.deepEqual(errors, []);
    await writeFile(output + 'simulation-pellets-checks.json', JSON.stringify({ url, passed, errors }, null, 2));
} catch (e) {
    await page.screenshot({ path: output + 'simulation-pellets-failure.png', fullPage: true }).catch(() => {});
    throw e;
} finally { await browser.close(); }
