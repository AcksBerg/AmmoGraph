// Verify and document the header on a running SPT server in a fresh browser context.
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';

const output = fileURLToPath(new URL('../docs/images/', import.meta.url));
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true
});
try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, locale: 'en-US',
        colorScheme: 'light', viewport: { width: 1600, height: 1100 } });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(process.env.AMMOGRAPH_URL || 'https://localhost:6969/AmmoGraph', { waitUntil: 'networkidle' });
    await page.locator('.ag-app[data-ready="true"]').waitFor();
    await page.locator('#ag-language').selectOption('en');
    await page.locator('.ag-app[lang="en"]').waitFor();
    const logo = page.locator('.ag-brand-mark img');
    await logo.evaluate(img => img.decode());
    assert.ok(await logo.evaluate(img => img.naturalWidth > 0 && img.naturalHeight > 0));
    const response = await context.request.get(new URL(await logo.getAttribute('src'), page.url()).href);
    assert.ok(response.ok());
    assert.match(response.headers()['content-type'], /image\/png/);
    for (const theme of ['light', 'dark']) {
        if (await page.locator('.ag-app').evaluate(e => getComputedStyle(e).colorScheme) !== theme) {
            await page.locator('.ag-theme-toggle[role="switch"]').click();
        }
        await page.waitForFunction(theme => getComputedStyle(document.querySelector('.ag-app')).colorScheme === theme, theme);
        assert.equal(await page.locator('.ag-brand-mark').evaluate(e => getComputedStyle(e).backgroundColor), 'rgb(255, 255, 255)');
        await page.evaluate(async () => {
            await document.fonts.ready;
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        await page.locator('.ag-header').screenshot({ path: `${output}header-${theme}.png` });
        for (const width of [1600, 768, 375, 320]) {
            await page.setViewportSize({ width, height: 1100 });
            assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${theme}: overflow at ${width}`);
            const box = await logo.boundingBox();
            assert.ok(box.width >= 30 && box.height >= 30, `${theme}: logo collapsed at ${width}`);
        }
        await page.setViewportSize({ width: 1600, height: 1100 });
        console.log(`PASS ${theme}: PNG loaded, white badge, no overflow at four window widths; screenshot saved`);
    }
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('.ag-app[data-ready="true"]').waitFor();
    assert.equal(await page.locator('.ag-app').evaluate(e => getComputedStyle(e).colorScheme), 'dark');
    assert.deepEqual(errors, []);
    console.log('PASS theme persists after reload; no browser errors');
    await context.close();
} finally { await browser.close(); }
