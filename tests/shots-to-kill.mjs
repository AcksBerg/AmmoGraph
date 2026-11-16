import {chromium} from 'playwright';
import assert from 'node:assert/strict';

// Run against tests/SimulationHost, which exposes read-only expected fixture values.
const url = process.env.AMMOGRAPH_URL || 'http://127.0.0.1:6973/AmmoGraph';
const browser = await chromium.launch({executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true});
const context = await browser.newContext({ignoreHTTPSErrors: true, viewport: {width: 1600, height: 1100}});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const ready = () => page.waitForFunction(() => document.querySelector('.ag-app')?.dataset.ready === 'true');
try {
    await page.goto(url); await ready();
    const fixture = await (await context.request.get(new URL('/test/shots-to-kill', url).href)).json();
    assert.ok(fixture.metrics.every(m => m.key !== 'ShotsToKillClass10'));
    const key = fixture.metrics.at(-1).key;
    const expected = new Map(fixture.items.map(a => [a.id, a.values[key]]));
    await page.evaluate(async ({fixture, key}) => {
        const preferences = await import('/ammo-graph/preferences.js?v=24.2');
        const saved = preferences.load();
        preferences.save({...saved, language: 'en', calibers: [...new Set(fixture.items.map(a => a.caliberId))],
            includedDefaultAmmo: fixture.items.map(a => a.id), includedDefaultCalibers: [...new Set(fixture.items.map(a => a.caliberId))],
            excludedAmmo: [], excludedCalibers: [], showPellets: false, search: '', selectedId: null,
            columns: ['Name', key], xColumns: ['Damage', key], yColumns: ['Damage', key],
            tooltipColumns: [key], detailColumns: [key], xAxis: key, yAxis: 'Damage',
            sortKey: key, descending: false, showTable: true, showDetails: true});
    }, {fixture, key});
    await page.reload(); await ready();
    const cells = page.locator(`tbody td[data-column="${key}"]`);
    await page.waitForFunction(({key, count}) => document.querySelectorAll(`tbody td[data-column="${key}"]`).length === count,
        {key, count: fixture.items.length});
    const values = await cells.evaluateAll(es => es.map(e => ({id: e.closest('tr').dataset.ammo,
        display: e.querySelector('.ag-table-value').textContent.trim(), numeric: e.dataset.value})));
    for (const value of values) {
        const result = expected.get(value.id);
        assert.equal(value.display, result.state === 'Success' ? String(result.shots) : result.state === 'Capped' ? '100+' : '—');
        if (result.state === 'Success') { assert.match(value.display, /^[1-9][0-9]*$/); assert.equal(Number(value.numeric), result.shots); }
        else assert.ok(!value.numeric);
    }
    const rank = id => { const r = expected.get(id); return r.state === 'Success' ? r.shots : r.state === 'Capped' ? 101 : 102; };
    const ascending = values.map(v => rank(v.id));
    assert.deepEqual(ascending, [...ascending].sort((a,b) => a-b));
    await page.locator(`th[data-column="${key}"] button`).click();
    await page.waitForFunction(key => document.querySelector(`th[data-column="${key}"]`).getAttribute('aria-sort') === 'descending', key);
    const descending = (await cells.evaluateAll(es => es.map(e => e.closest('tr').dataset.ammo))).map(rank);
    assert.deepEqual(descending, [...ascending].reverse());
    console.log('PASS Every loaded template renders the correct integer/capped/missing state and sorts in both directions');

    const plotted = await page.locator('.ag-point').evaluateAll(es => es.map(e => ({ids: e.dataset.id.split(','), x: Number(e.dataset.x)})));
    for (const point of plotted) for (const id of point.ids) {
        assert.equal(expected.get(id).state, 'Success'); assert.equal(point.x, expected.get(id).shots);
    }
    const caps = values.filter(v => expected.get(v.id).state === 'Capped');
    assert.equal(await page.locator('.ag-capped-graph').count(), 0);
    assert.equal(plotted.flatMap(p => p.ids).length, values.filter(v => expected.get(v.id).state === 'Success').length);
    console.log('PASS Graph plots only successful numeric results without a capped-results notice');

    const numeric = values.find(v => expected.get(v.id).state === 'Success');
    const row = id => page.locator(`tbody tr[data-ammo="${id}"]`);
    await row(numeric.id).locator('.ag-ammo-name').click();
    assert.equal((await page.locator('.ag-base-value').innerText()).trim(), numeric.display);
    const point = page.locator('.ag-point').first(); await point.focus();
    await page.waitForFunction(() => document.querySelector('.ag-tooltip')?.dataset.open === 'true');
    const tooltip = await page.locator(`[data-tooltip-value="${key}"]`).allTextContents();
    assert.ok(tooltip.length && tooltip.every(t => /^[1-9][0-9]*$/.test(t.trim())));
    if (caps.length) {
        await row(caps[0].id).hover();
        await page.waitForFunction(() => document.querySelector('.ag-candidate-value')?.textContent.trim() === '100+' && document.querySelector('.ag-comparison-value .ag-delta')?.classList.contains('worse'));
        assert.equal((await page.locator('.ag-candidate-value').innerText()).trim(), '100+');
        assert.equal(await page.locator('.ag-comparison-value').getAttribute('data-delta'), null);
        assert.equal((await page.locator('.ag-comparison-value .ag-delta').innerText()).trim(), '\u2191');
        await row(caps[0].id).locator('.ag-ammo-name').click();
        await row(numeric.id).hover();
        await page.waitForFunction(value => document.querySelector('.ag-candidate-value')?.textContent.trim() === value && document.querySelector('.ag-comparison-value .ag-delta')?.classList.contains('better'), numeric.display);
    }
    await page.locator('#ag-x').selectOption('Damage');
    await page.locator('#ag-y').selectOption(key);
    await page.waitForFunction(key => document.querySelector('.ag-chart')?.dataset.yKey === key, key);
    const vertical = await page.locator('.ag-point').evaluateAll(es => es.map(e => ({ids: e.dataset.id.split(','), y: Number(e.dataset.y)})));
    for (const point of vertical) for (const id of point.ids) assert.equal(point.y, expected.get(id).shots);
    if (caps.length) {
        await page.locator('#ag-y').selectOption('Damage');
        const cappedPoint = page.locator(`.ag-point[data-id*="${caps[0].id}"]`).first();
        await cappedPoint.focus();
        await page.waitForFunction(({id, key}) => document.querySelector(`[data-tooltip-ammo="${id}"] [data-tooltip-value="${key}"]`)?.textContent.trim() === '100+', {id: caps[0].id, key});
    }
    await page.locator('#ag-x').selectOption(key);
    console.log('PASS Details, tooltips and capped comparisons preserve lower-is-better semantics');
    await page.locator('#ag-language').selectOption('de');
    await page.waitForFunction(() => document.querySelector('.ag-app')?.lang === 'de');
    assert.equal(await page.locator(`th[data-column="${key}"]`).innerText().then(s => s.includes('Rüstungsklasse')), true);
    await page.reload(); await ready();
    assert.equal(await page.locator('#ag-x').inputValue(), key);
    assert.equal(await cells.count(), values.length);
    assert.deepEqual(errors, []);
    console.log('PASS Metrics survive language changes and restored attribute preferences without browser errors');
} finally { await browser.close(); }
