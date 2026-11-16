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
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error' && !message.text().includes('favicon')) errors.push(message.text()); });
const chart = () => page.locator('.ag-simulation-chart');
async function until(predicate) { for (let i = 0; i < 200; i++) { if (await predicate()) return; await page.waitForTimeout(100); } throw Error('UI timeout'); }
async function result() {
    await page.waitForTimeout(500);
    await until(async () => await chart().count() && !await page.locator('.ag-sim-error,.ag-sim-stale').count() && await page.locator('[data-simulator]').getAttribute('data-running') === 'false' && await chart().getAttribute('data-zoom') !== null);
}
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} != ${b}`);
async function state() {
    return chart().evaluate(svg => {
        const matrix = svg.querySelector('.ag-sim-plot').transform.baseVal.consolidate().matrix;
        const axis = svg.querySelector('.ag-sim-static-y-axes');
        return { zoom: Number(svg.dataset.zoom), min: Number(svg.dataset.viewXMin), max: Number(svg.dataset.viewXMax), lower: Number(svg.dataset.xMin), limit: Number(svg.dataset.xMax), lastShot: Number(svg.dataset.lastShot),
            yMin: Number(svg.dataset.viewYMin), yMax: Number(svg.dataset.viewYMax), a: matrix.a, d: matrix.d, f: matrix.f,
            labels: axis.textContent, yVisible: getComputedStyle(axis).display !== 'none', finite: !/NaN|Infinity/.test(svg.outerHTML) };
    });
}
async function verify(labels) {
    const value = await state();
    assert.ok(value.min >= value.lower - 1e-9 && value.max <= value.limit + 1e-9 && value.max > value.min, JSON.stringify(value));
    near(value.yMin, 0); near(value.yMax, 100); near(value.d, 1); near(value.f, 0);
    assert.ok(value.finite && value.yVisible);
    if (labels !== undefined) assert.equal(value.labels, labels, 'Both vertical axes keep their complete original scale');
    return value;
}
async function center() { await chart().scrollIntoViewIfNeeded(); const box = await chart().boundingBox(); return { x: box.x + box.width * .5, y: box.y + box.height * .45 }; }
async function drag(dx, dy) { const p = await center(); await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move(p.x + dx, p.y + dy, { steps: 10 }); await page.mouse.up(); await page.waitForTimeout(80); }
async function reset() { await page.locator('[data-sim-nav="reset"]').click(); await until(async () => (await state()).zoom === 1); }
async function capacity(n) { await page.locator('[data-magazine-capacity]').fill(String(n)); await page.locator('[data-magazine-capacity]').press('Tab'); await result(); }
async function check(name, action) { await action(); passed.push(name); console.log('PASS', name); }
try {
    for (let attempt = 0; ; attempt++) {
        try { await page.goto(url); break; }
        catch (error) {
            if (attempt >= 59 || !error.message.includes('ERR_CONNECTION_REFUSED')) throw error;
            await page.waitForTimeout(500);
        }
    }
    await page.locator('.ag-app[data-ready="true"]').waitFor({ timeout: 60000 });
    await page.locator('#ag-language').selectOption('en');
    await page.locator('[data-view-toggle]').click();
    await page.locator('.ag-caliber[data-caliber="Caliber545x39"] input').check();
    await page.locator('[data-simulator][data-caliber="Caliber545x39"]').waitFor();
    await page.locator('tbody tr[data-ammo] .ag-sim-table-actions button').nth(1).click();
    await result();
    await page.locator('[data-show-after-death]').check();
    await capacity(100);
    await check('Shot labels start at 1, bars have symmetric edge space, and panning stays inside the padded range', async () => {
        const initial = await verify(); near(initial.lastShot, 100); near(initial.min, .5); near(initial.max, 100.5);
        const layout = await chart().evaluate(svg => {
            const bars = [...svg.querySelectorAll('.ag-sim-damage-bar')];
            const first = bars[0], last = bars.at(-1);
            return { ticks: [...svg.querySelectorAll('.ag-sim-static-x-axes text')].map(e => Number(e.textContent)),
                left: Number(first.getAttribute('x')) - 80, right: 940 - Number(last.getAttribute('x')) - Number(last.getAttribute('width')),
                firstX: Number(svg.querySelector('[data-shot="1"] .ag-sim-shot-highlight').dataset.centerX),
                seriesStart: Number(svg.querySelector('.ag-sim-chance').getAttribute('points').split(',')[0]) };
        });
        assert.equal(layout.ticks[0], 1); assert.equal(layout.ticks.at(-1), 100); assert.ok(!layout.ticks.includes(0));
        assert.ok(layout.left > 0 && layout.right > 0); assert.ok(Math.abs(layout.left - layout.right) < .002);
        near(layout.firstX, layout.seriesStart);
        await drag(700, 200); let next = await verify(initial.labels); near(next.min, .5); near(next.max, 100.5);
        await drag(-700, -200); next = await verify(initial.labels); near(next.min, .5); near(next.max, 100.5);
    });
    await check('Selected and hovered highlights keep their unzoomed width while the whole enlarged bar stays interactive', async () => {
        const selected = page.locator('[data-shot="50"]');
        const hovered = page.locator('[data-shot="51"]');
        const markerWidth = locator => locator.locator('.ag-sim-shot-highlight').evaluate(e => e.getBoundingClientRect().width);
        await selected.focus();
        await until(async () => await selected.evaluate(e => e.classList.contains('is-selected')));
        const baseline = await markerWidth(selected);
        const hitWidth = await selected.locator('.ag-sim-shot-hit').evaluate(e => e.getBoundingClientRect().width);
        for (let i = 0; i < 7; i++) {
            const before = (await state()).zoom;
            await page.locator('[data-sim-nav="in"]').click();
            await until(async () => (await state()).zoom > before);
            assert.ok(Math.abs(await markerWidth(selected) - baseline) < .03);
            assert.ok(Math.abs(await markerWidth(hovered) - baseline) < .03);
        }
        const zoom = (await state()).zoom;
        const enlarged = await selected.locator('.ag-sim-shot-hit').evaluate(e => e.getBoundingClientRect().width);
        assert.ok(Math.abs(enlarged - hitWidth * zoom) < .03);
        await hovered.locator('.ag-sim-shot-hit').hover();
        assert.ok(await hovered.evaluate(e => e.matches(':hover')));
        assert.notEqual(await hovered.locator('.ag-sim-shot-highlight').evaluate(e => getComputedStyle(e).stroke), 'none');
        await chart().scrollIntoViewIfNeeded();
        await page.locator('.ag-sim-results').screenshot({ path: output + 'simulation-highlight-zoom.png' });
        await reset();
    });
    await check('Wheel and buttons zoom only X; vertical drags leave the view unchanged', async () => {
        const initial = await verify(), p = await center();
        await page.mouse.move(p.x, p.y); await page.mouse.wheel(0, -500);
        await until(async () => (await state()).zoom > 1.5);
        let zoomed = await verify(initial.labels); near(zoomed.d, 1); assert.ok(zoomed.a > 1);
        const min = zoomed.min, max = zoomed.max;
        await drag(0, 170); zoomed = await verify(initial.labels); near(zoomed.min, min); near(zoomed.max, max);
        await page.locator('[data-sim-nav="in"]').click();
        await until(async () => (await state()).zoom > zoomed.zoom);
        await verify(initial.labels);
    });
    await check('Large diagonal drags clamp exactly to each horizontal boundary', async () => {
        const initial = await verify();
        // Repeat drags within the browser viewport; off-window pointer delivery is platform dependent.
        for (let i = 0; i < 6; i++) { await drag(600, 100); await verify(initial.labels); }
        near((await state()).min, initial.lower);
        assert.ok((await page.locator('.ag-sim-navigation-axes text').allTextContents()).includes('1'));
        for (let i = 0; i < 6; i++) { await drag(-600, -100); await verify(initial.labels); }
        const right = await verify(initial.labels); near(right.max, right.limit);
        assert.ok((await page.locator('.ag-sim-navigation-axes text').allTextContents()).includes(String(right.lastShot)));
    });
    await check('Keyboard zoom/pan is horizontally bounded and Up/Down never alter Y', async () => {
        const initial = await verify();
        await chart().focus();
        for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowLeft');
        await until(async () => (await state()).min < initial.lower + 1e-9);
        near((await verify(initial.labels)).min, initial.lower);
        for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowRight');
        await until(async () => Math.abs((await state()).max - (await state()).limit) < 1e-8);
        const before = await verify(initial.labels);
        await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowDown');
        const after = await verify(initial.labels); near(after.min, before.min); near(after.max, before.max);
        await page.keyboard.press('+'); await page.waitForTimeout(80); await verify(initial.labels);
        await page.keyboard.press('Home'); await until(async () => (await state()).zoom === 1);
        const home = await verify(initial.labels); near(home.min, home.lower); near(home.max, home.limit);
    });
    await check('Death cutoff and 1/30/100-round ranges use the exact last visible shot', async () => {
        await capacity(30);
        await page.locator('[data-show-after-death]').uncheck();
        await until(async () => Number(await chart().getAttribute('data-last-shot')) === Number(await page.locator('.ag-sim-results').getAttribute('data-death-shot')));
        let value = await verify(); assert.ok(value.lastShot > 0 && value.lastShot < 30); near(value.zoom, 1);
        const deathX = Number(await page.locator('[data-death-line]').getAttribute('x1'));
        assert.ok(deathX > 80 + 2 && deathX < 940 - 2, 'The kill marker is fully inside the plot, including at the last displayed shot');
        await drag(500, 0); value = await verify(); near(value.min, value.lower); near(value.max, value.limit);
        await page.locator('[data-show-after-death]').check();
        await until(async () => (await state()).lastShot === 30); value = await verify(); near(value.max, 30.5);
        await capacity(1); value = await verify(); near(value.lastShot, 1); near(value.min, .5); near(value.max, 1.5);
        assert.equal((await page.locator('.ag-sim-static-x-axes').textContent()).trim(), '1');
        await page.locator('[data-sim-nav="in"]').click(); await until(async () => (await state()).zoom > 1);
        await drag(-600, 150); value = await verify(); near(value.max, 1.5);
        await reset();
    });
    await check('The HP scale stays complete while zooming the cumulative-damage series', async () => {
        await capacity(30);
        await page.locator('.ag-sim-legend button').filter({ hasText: 'Cumulative damage' }).click();
        await page.locator('.ag-sim-cumulative').waitFor();
        const initial = await verify();
        await page.locator('[data-sim-nav="in"]').click(); await until(async () => (await state()).zoom > 1);
        await verify(initial.labels);
        await page.locator('.ag-sim-results').screenshot({ path: output + 'simulation-horizontal-live.png' });
    });
    assert.deepEqual(errors, []);
    await writeFile(output + 'simulation-horizontal-live.json', JSON.stringify({ url, passed, errors, finalState: await state() }, null, 2));
} catch (error) {
    await page.screenshot({ path: output + 'simulation-horizontal-live-failure.png', fullPage: true }).catch(() => {});
    throw error;
} finally { await browser.close(); }
