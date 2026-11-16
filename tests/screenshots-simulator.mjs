// Documentation captures from the running SPT server, using an isolated English context.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const output = fileURLToPath(new URL('../docs/images/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1400 }, colorScheme: 'dark', locale: 'en-US' });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.AMMOGRAPH_URL || 'https://localhost:6969/AmmoGraph');
    await page.locator('.ag-app[data-ready="true"]').waitFor();
    await page.locator('#ag-language').selectOption('en');
    await page.locator('.ag-app[lang="en"]').waitFor();
    const capture = async (name, locator) => {
        // Let automatic-save feedback clear and browser-side labels settle.
        await page.waitForFunction(() => !document.querySelector('[data-save-status]')?.textContent.trim());
        await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        await locator.screenshot({ path: `${output}${name}.png` });
        console.log(`Saved ${name}.png`);
    };
    await page.locator('.ag-ammo-name').first().click();
    await page.locator('[data-table-height]').fill('440');
    await page.locator('[data-table-height]').dispatchEvent('input');
    await capture('usability-table', page.locator('.ag-table-panel'));
    await page.locator('[data-view-toggle]').click();
    await page.locator('.ag-caliber[data-caliber="Caliber545x39"] input').check();
    await page.locator('[data-simulator][data-caliber="Caliber545x39"]').waitFor();
    await page.locator('tbody tr[data-ammo]').first().locator('.ag-sim-table-actions button').nth(1).click();
    const result = async () => {
        await page.waitForTimeout(600); // Calculation starts after the editor debounce.
        await page.waitForFunction(() => document.querySelector('.ag-simulation-chart')?.dataset.zoom !== undefined &&
            document.querySelector('[data-simulator]')?.dataset.running === 'false' &&
            !document.querySelector('.ag-sim-error,.ag-sim-stale'), null, { timeout: 60000 });
    };
    await result();
    await page.locator('[data-armor]').selectOption('5e4ac41886f77406a511c9a8');
    await result();
    await page.locator('[data-slot="front_plate"] select').selectOption('656fae5f7c2d57afe200c0d7');
    await result();
    await page.locator('[data-show-after-death]').check();
    await page.locator('[data-shot="1"]').focus();
    await capture('simulation', page.locator('[data-simulator]'));
    await capture('simulation-results', page.locator('.ag-sim-results'));
    await page.locator('[data-magazine-capacity]').fill('12');
    await page.locator('[data-magazine-capacity]').press('Tab');
    await result();
    await page.locator('.ag-sim-help > summary').click();
    await capture('usability-simulation', page.locator('.ag-sim-results'));
    await page.locator('.ag-sim-help > summary').click();
    // A longer magazine gives narrow base highlights and makes their fixed width clear when zoomed.
    await page.locator('[data-magazine-capacity]').fill('100');
    await page.locator('[data-magazine-capacity]').press('Tab');
    await result();
    await page.locator('[data-shot="50"]').focus();
    for (let i = 0; i < 6; i++) await page.locator('[data-sim-nav="in"]').click();
    await page.locator('.ag-simulation-chart').scrollIntoViewIfNeeded();
    await page.locator('[data-shot="51"] .ag-sim-shot-hit').hover();
    await capture('simulation-highlight-zoom', page.locator('.ag-sim-results'));
    await page.locator('.ag-caliber[data-caliber="Caliber12g"] input').check();
    await page.locator('[data-simulator][data-caliber="Caliber12g"]').waitFor();
    await page.locator('tbody tr[data-ammo]').filter({ hasText: /buckshot/i }).first().locator('.ag-sim-table-actions button').nth(1).click();
    await page.locator('[data-magazine-capacity]').fill('30');
    await page.locator('[data-magazine-capacity]').press('Tab');
    await page.locator('[data-pellet-hit-rate]').fill('50');
    await page.locator('[data-pellet-hit-rate]').press('Tab');
    await result();
    await page.locator('[data-show-after-death]').check();
    await page.locator('[data-shot="1"]').focus();
    await page.locator('[data-mean-pellet-hits]').waitFor();
    await capture('simulation-pellets', page.locator('[data-simulator]'));
    assert.deepEqual(errors, []);
    console.log('PASS six simulator/usability screenshots captured without browser errors');
    await context.close();
} finally { await browser.close(); }
