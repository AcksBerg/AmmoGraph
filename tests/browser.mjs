import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root, 'artifacts');
await mkdir(artifacts, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 1100 } });
const page = await context.newPage();
const errors = [], passed = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
async function check(name, action) { await action(); passed.push(name); console.log('PASS', name); }
async function until(predicate) {
    for (let i = 0; i < 120; i++) { if (await predicate()) return; await page.waitForTimeout(100); }
    throw new Error('Timed out waiting for UI state.');
}
const ready = () => page.locator('.ag-app[data-ready="true"]').waitFor();
async function openMenu(selector) { if (!(await page.locator(selector).evaluate(el => el.open))) await page.locator(selector + '>summary').click(); }
const settings = () => page.evaluate(async () => (await import('/ammo-graph/preferences.js?v=6')).load());
const numbers = selector => page.locator(selector).evaluateAll(elements => elements.map(el => Number(el.dataset.value)));
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 0.0011, `${actual} != ${expected}`);
const caliber = id => page.locator(`.ag-caliber[data-caliber="${id}"] input`);
try {
    const response = await page.goto(process.env.AMMOGRAPH_URL || 'https://localhost:6969/AmmoGraph', { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await ready();
    if (process.argv.includes('--inspect')) {
        console.log((await page.locator('body').innerText()).slice(0, 4000));
    } else if (process.argv.includes('--fixture')) {
        await check('Another mod’s new caliber and late damage mutation are included', async () => {
            await caliber('CaliberTest777x42').check();
            await page.locator('.ag-table-heading input.ag-input').fill('AmmoGraph startup fixture');
            await until(async () => await page.locator('tbody tr').count() === 1);
            assert.equal(await page.locator('tbody td:nth-child(3)').getAttribute('data-value'), '777');
        });
    } else {
        await check('Real server data, initial locale, and cookie initialization', async () => {
            assert.equal(await page.locator('.ag-app').getAttribute('lang'), 'de');
            assert.ok(await page.locator('.ag-point').count() > 5);
            assert.ok((await context.cookies()).some(c => c.name === 'spt-ammo-graph.v2' && c.secure && c.sameSite === 'Lax'));
            assert.equal(await page.locator('#ag-shotgun').count(), 0);
        });
        await check('Every SPT language is selectable and renders translated controls', async () => {
            const options = await page.locator('#ag-language option').evaluateAll(elements => elements.map(e => e.value));
            const config = JSON.parse(await readFile(path.resolve(root, '../SPT_Runtime/SPT_Data/configs/locale.json'), 'utf8'));
            for (const code of config.serverSupportedLocales) assert.ok(options.includes(code.toLowerCase()), code);
            for (const code of options) {
                await page.locator('#ag-language').selectOption(code);
                await until(async () => await page.locator('.ag-app').getAttribute('lang') === code);
                assert.ok((await page.locator('.ag-brand small').innerText()).length > 3);
                assert.notEqual(await page.locator('.ag-brand small').innerText(), 'Subtitle');
            }
            await page.locator('#ag-language').selectOption('en');
            await until(async () => await page.locator('.ag-brand small').innerText() === 'Compare ammunition');
            const englishName = await page.locator('tbody .ag-ammo-name').first().innerText();
            await page.locator('#ag-language').selectOption('de');
            await until(async () => await page.locator('.ag-app').getAttribute('lang') === 'de');
            assert.notEqual(await page.locator('tbody .ag-ammo-name').first().innerText(), englishName);
        });
        await check('Buckshot loads and pellets are separate, independently selectable calibers', async () => {
            assert.equal(await caliber('Caliber12g:shot').count(), 1);
            assert.equal(await caliber('Caliber12g:pellet').count(), 0);
            await page.locator('#ag-pellets').check();
            await until(async () => await caliber('Caliber12g:pellet').count() === 1);
            await page.locator('.ag-bulk button').nth(1).click();
            await until(async () => await page.locator('.ag-caliber input:checked').count() === 0);
            await caliber('Caliber12g:shot').check();
            await until(async () => await page.locator('tbody tr').count() > 0);
            await caliber('Caliber12g:pellet').check();
            await page.locator('.ag-table-heading input.ag-input').fill('7mm');
            await until(async () => await page.locator('tbody tr').count() === 2);
            const values = await numbers('tbody td:nth-child(3)');
            assert.deepEqual([...values].sort((a,b) => a-b), [39, 312]);
            await page.locator('#ag-pellets').uncheck();
            await until(async () => await page.locator('tbody tr').count() === 1);
            assert.equal(await page.locator('tbody td:nth-child(3)').getAttribute('data-value'), '312');
            assert.equal(await caliber('Caliber12g:pellet').count(), 0);
            await page.locator('#ag-pellets').check();
            await until(async () => await page.locator('tbody tr').count() === 2);
            assert.equal(await caliber('Caliber12g:pellet').isChecked(), true);
            await page.locator('.ag-table-heading input.ag-input').fill('');
        });
        await check('Global axes use exactly capped 10% headroom without rounding the bounds', async () => {
            await page.locator('.ag-bulk button').first().click();
            await until(async () => await page.locator('tbody tr').count() > 180);
            const maxX = Math.max(...await numbers('tbody td:nth-child(3)'));
            const maxY = Math.max(...await numbers('tbody td:nth-child(4)'));
            await page.locator('.ag-chart-options input').first().uncheck();
            await until(async () => !(await settings()).dynamicScale);
            const xMax = Number(await page.locator('.ag-chart').getAttribute('data-x-max'));
            const yMax = Number(await page.locator('.ag-chart').getAttribute('data-y-max'));
            closeTo(xMax, maxX + Math.min(maxX * 0.1, 10));
            closeTo(yMax, maxY + Math.min(maxY * 0.1, 10));
            await page.locator('.ag-bulk button').nth(1).click();
            await until(async () => await page.locator('tbody tr').count() === 0);
            await caliber('Caliber545x39').check();
            await until(async () => await page.locator('tbody tr').count() === 13);
            closeTo(Number(await page.locator('.ag-chart').getAttribute('data-x-max')), xMax);
        });
        await check('Dynamic axes fit the filtered data with the same headroom rule', async () => {
            await page.locator('.ag-chart-options input').first().check();
            await until(async () => (await settings()).dynamicScale);
            const max = Math.max(...await numbers('tbody td:nth-child(3)'));
            closeTo(Number(await page.locator('.ag-chart').getAttribute('data-x-max')), max + Math.min(max * 0.1, 10));
            await page.locator('.ag-table-heading input.ag-input').fill('NO_SUCH_AMMO');
            await until(async () => await page.locator('tbody tr').count() === 0);
            assert.equal(await page.locator('.ag-point').count(), 0);
            assert.ok(await page.locator('.ag-table-empty').count() === 1);
            await page.locator('.ag-table-heading input.ag-input').fill('');
            await until(async () => await page.locator('tbody tr').count() === 13);
        });
        await check('Hover compares against pinned selection with signed improvement deltas', async () => {
            const baseline = page.locator('tbody tr').filter({ hasText: '7N40' });
            const candidate = page.locator('tbody tr').filter({ hasText: 'HP' });
            await baseline.locator('.ag-ammo-name').click();
            await until(async () => (await page.locator('.ag-details h3').innerText()).includes('7N40'));
            const pinned = await page.locator('.ag-details h3').innerText();
            await candidate.hover();
            await until(async () => await page.locator('.ag-comparison-heading:not(.ag-comparison-placeholder)').count() === 1);
            assert.equal(await page.locator('.ag-details h3').innerText(), pinned);
            assert.equal(await page.locator('.ag-comparison-value[data-metric="Damage"]').getAttribute('data-delta'), '21');
            assert.equal(await page.locator('[data-metric="Damage"] .better').count(), 1);
            assert.equal(await page.locator('[data-metric="PenetrationPower"] .worse').count(), 1);
            assert.ok((await page.locator('[data-metric="Damage"] .ag-delta').innerText()).includes('+21'));
            const beforeY = (await candidate.boundingBox()).y;
            await page.screenshot({ path: path.join(artifacts, 'comparison-v6.png'), fullPage: true });
            await page.mouse.move(20, 20);
            await until(async () => await page.locator('.ag-comparison-heading:not(.ag-comparison-placeholder)').count() === 0);
            closeTo((await candidate.boundingBox()).y, beforeY);
            assert.equal(await page.locator('.ag-details h3').innerText(), pinned);
            const point = page.locator('.ag-point:not(.is-selected)').first();
            await point.hover();
            await until(async () => await page.locator('.ag-comparison-heading:not(.ag-comparison-placeholder)').count() === 1);
            await page.mouse.move(20, 20);
        });
        await check('Cookie persists language, axes, selections, search, pellets, sort, and pinned item', async () => {
            await page.locator('#ag-language').selectOption('fr');
            await until(async () => await page.locator('.ag-app').getAttribute('lang') === 'fr');
            await page.locator('#ag-x').selectOption('InitialSpeed');
            await page.locator('.ag-exclusions>summary').click();
            await page.locator('[data-settings-section="attributes"]>summary').click();
            await page.locator('[data-attributes="axes"]>summary').click();
            await page.locator('[data-attributes="axes"] [data-attribute="AmmoRec"]').click();
            await page.locator('[data-attributes="axes"] [data-transfer="add"]').click();
            await page.keyboard.press('Escape');
            await page.locator('#ag-y').selectOption('AmmoRec');
            await page.locator('.ag-chart-options input').nth(1).check();
            await page.locator('.ag-table-heading input.ag-input').fill('7N40');
            await page.locator('.ag-sidebar>.ag-input').fill('5.45');
            await until(async () => await page.locator('.ag-comparison-table tbody tr').count() === 1);
            await page.locator('tbody .ag-ammo-name').click();
            await page.locator('thead th').nth(2).locator('button').click();
            await until(async () => { const s = await settings(); return s.language === 'fr' && s.search === '7N40' && s.sortKey === 'Damage' && s.selectedId && s.yAxis === 'AmmoRec'; });
            const before = await settings();
            await page.reload({ waitUntil: 'networkidle' }); await ready();
            const after = await settings();
            assert.deepEqual(after, before);
            assert.equal(await page.locator('#ag-language').inputValue(), 'fr');
            assert.equal(await page.locator('#ag-y').inputValue(), 'AmmoRec');
            assert.equal(await page.locator('.ag-table-heading input.ag-input').inputValue(), '7N40');
            assert.ok((await page.locator('.ag-details h3').innerText()).includes('7N40'));
            assert.equal(await page.evaluate(() => localStorage.getItem('spt-ammo-graph.preferences.v1')), null);
        });
        await check('Malformed cookies are ignored', async () => {
            await page.evaluate(() => { document.cookie = 'spt-ammo-graph.v2=invalid; Path=/; SameSite=Lax; Secure'; });
            await page.reload({ waitUntil: 'networkidle' }); await ready();
            assert.equal(await page.locator('#ag-language').inputValue(), 'de');
            assert.equal(await page.locator('.ag-caliber input:checked').count(), 2);
            assert.equal(await page.locator('.ag-table-heading input.ag-input').inputValue(), '');
        });
        await check('Legacy browser settings migrate once to cookies', async () => {
            await page.evaluate(() => {
                document.cookie = 'spt-ammo-graph.v2=; Max-Age=0; Path=/';
                localStorage.setItem('spt-ammo-graph.preferences.v1', JSON.stringify({calibers:['Caliber12g'], xAxis:'ArmorDamage', yAxis:'Damage', dynamicScale:false, showNames:true, wholeLoad:false}));
            });
            await page.reload({ waitUntil: 'networkidle' }); await ready();
            assert.equal(await page.locator('#ag-x').inputValue(), 'ArmorDamage');
            assert.equal(await page.locator('#ag-pellets').isChecked(), true);
            assert.equal(await caliber('Caliber12g:pellet').isChecked(), true);
            await until(async () => await page.evaluate(() => localStorage.getItem('spt-ammo-graph.preferences.v1')) === null);
        });
        await check('Chunked cookies round-trip larger mod configurations and Unicode text', async () => {
            const current = await settings();
            const oversized = {...current, calibers:Array.from({length:180},(_,i)=>`CaliberMod${i}:pellet`), search:'日本語 · العربية'};
            const result = await page.evaluate(async value => { const m = await import('/ammo-graph/preferences.js?v=6'); return {saved:m.save(value), value:m.load()}; }, oversized);
            assert.equal(result.saved, true); assert.deepEqual(result.value, oversized);
            await page.evaluate(async value => (await import('/ammo-graph/preferences.js?v=6')).save(value), current);
        });
        await check('Desktop and mobile layout, including Arabic direction', async () => {
            await page.evaluate(() => { document.cookie = 'spt-ammo-graph.v2=; Max-Age=0; Path=/'; });
            await page.reload({ waitUntil: 'networkidle' }); await ready();
            await page.locator('tbody .ag-ammo-name').first().click();
            await until(async () => await page.locator('.ag-details h3').count() === 1);
            await page.mouse.move(20,20);
            await page.screenshot({ path:path.join(artifacts,'desktop-v6.png'),fullPage:true });
            await page.setViewportSize({width:390,height:844});
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
            assert.ok(await page.locator('#ag-language').evaluate(el=>parseFloat(getComputedStyle(el).fontSize)>=11));
            await page.screenshot({path:path.join(artifacts,'mobile-v6.png'),fullPage:true});
            await page.locator('#ag-language').selectOption('ar');
            await until(async()=>await page.locator('.ag-app').getAttribute('dir')==='rtl');
            assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
            await page.screenshot({path:path.join(artifacts,'arabic-v6.png'),fullPage:true});
        });
    }
    assert.deepEqual(errors, []);
    await writeFile(path.join(artifacts,process.argv.includes('--fixture')?'startup-results.json':'browser-results-v6.json'),JSON.stringify({passed,errors},null,2));
} catch (error) {
    await page.screenshot({path:path.join(artifacts,'browser-failure-v6.png'),fullPage:true}).catch(()=>{});
    throw error;
} finally { await browser.close(); }
