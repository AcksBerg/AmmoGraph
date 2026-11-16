import { chromium } from 'playwright';
import {openSettingsSection} from './settings-helper.mjs';
import assert from 'node:assert/strict';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifacts = path.join(root,'artifacts');
await mkdir(artifacts,{recursive:true});
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context = await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1100}});
const page = await context.newPage();
const errors=[], passed=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const url = process.env.AMMOGRAPH_URL || 'https://localhost:6969/AmmoGraph';
const ready = () => page.locator('.ag-app[data-ready="true"]').waitFor();
async function openMenu(selector) { if(selector==='.ag-exclusions'){await openSettingsSection(page,'exclusions');return;} if (!(await page.locator(selector).evaluate(el => el.open))) await page.locator(selector + '>summary').click(); }
const settings = () => page.evaluate(async()=>(await import('/ammo-graph/preferences.js?v=6')).load());
async function until(action) { for(let i=0;i<120;i++){if(await action())return;await page.waitForTimeout(100);}throw Error('UI timeout'); }
async function check(name, action) { await action();passed.push(name);console.log('PASS',name); }
const columns = () => page.locator('thead th[data-column]').evaluateAll(es=>es.map(e=>e.dataset.column));
const row = id => page.locator(`tbody tr[data-ammo="${id}"]`);
const excludedAmmo = id => page.locator(`[data-exclude-ammo="${id}"]`);
const excludedCaliber = id => page.locator(`[data-exclude-caliber="${id}"]`);
const defaultColumns=['Name','Caliber','Damage','PenetrationPower','InitialSpeed'];
try {
    assert.equal((await page.goto(url,{waitUntil:'networkidle'})).status(),200);
    await ready();
    await check('Every table row compares its own values with the pinned reference',async()=>{
        assert.deepEqual(await columns(),defaultColumns);
        await page.locator('tbody tr').filter({hasText:'7N40'}).locator('.ag-ammo-name').click();
        await until(async()=>await page.locator('.ag-comparison-table tr.is-selected').count()===1);
        assert.equal(await page.locator('.ag-table-reference').count(),0);
        const reference=await page.locator('tbody tr.is-selected').getAttribute('data-ammo');
        const baseline=await row(reference).locator('td[data-value]').evaluateAll(es=>Object.fromEntries(es.map(e=>[e.dataset.column,Number(e.dataset.value)])));
        for(const tr of await page.locator('tbody tr').all()) {
            if(await tr.getAttribute('data-ammo')===reference)continue;
            for(const td of await tr.locator('td[data-value]').all()) {
                const key=await td.getAttribute('data-column');
                const expected=Number(await td.getAttribute('data-value'))-baseline[key];
                assert.ok(Math.abs(Number(await td.locator('[data-delta]').getAttribute('data-delta'))-expected)<1e-9);
            }
        }
        const hp=page.locator('tbody tr').filter({hasText:'HP'}).first();
        assert.equal(await hp.locator('[data-column="Damage"] .better').count(),1);
        assert.equal(await hp.locator('[data-column="PenetrationPower"] .worse').count(),1);
        await page.mouse.move(20,20);
        assert.ok(await hp.locator('[data-column="Damage"] .ag-table-delta').isVisible());
    });
    await check('All metrics can be displayed, sorted and persisted as table columns',async()=>{
        await openMenu('.ag-column-picker');
        for(const key of ['ArmorDamage','AmmoRec','HeatFactor'])await page.locator(`.ag-column-options [data-column="${key}"]`).check();
        await until(async()=>(await columns()).includes('HeatFactor'));
        assert.equal((await columns()).length,8);
        await page.keyboard.press('Escape');
        const recoilHeader=page.locator('thead [data-column="AmmoRec"]');
        await recoilHeader.locator('button').click();
        await until(async()=>await recoilHeader.getAttribute('aria-sort')==='ascending');
        const values=await page.locator('tbody [data-column="AmmoRec"][data-value]').evaluateAll(es=>es.map(e=>Number(e.dataset.value)));
        assert.deepEqual(values,[...values].sort((a,b)=>a-b));
        await until(async()=>(await settings()).columns.includes('HeatFactor'));
        await page.screenshot({path:path.join(artifacts,'table-comparison-v6.png'),fullPage:true});
        await page.reload({waitUntil:'networkidle'});await ready();
        assert.equal((await columns()).length,8);
        assert.equal(await page.locator('.ag-comparison-table tr.is-selected').count(),1);
        assert.equal(await page.locator('.ag-table-reference').count(),0);
        await openMenu('.ag-column-picker');
        const selectedKeys=await page.locator('.ag-column-options input:checked').evaluateAll(es=>es.map(e=>e.dataset.column));
        for(const key of selectedKeys) {
            const input=page.locator(`.ag-column-options input[data-column="${key}"]`);
            if(!(await input.isDisabled())) {
                await input.uncheck();
                await until(async()=>!(await settings()).columns.includes(key));
            }
        }
        await until(async()=>(await columns()).length===1);
        assert.equal(await page.locator('.ag-column-options input:checked:disabled').count(),1);
        await page.locator('.ag-column-picker button').click();
        await until(async()=>JSON.stringify(await columns())===JSON.stringify(defaultColumns));
    });
    await check('Default exclusions are reversible and use canonical names across languages',async()=>{
        await page.locator('.ag-bulk button').first().click();
        await until(async()=>await page.locator('tbody tr').count()>170);
        await openMenu('.ag-exclusions');
        const items=JSON.parse(await readFile(path.resolve(root,'../SPT_Runtime/SPT_Data/database/templates/items.json'),'utf8'));
        const english=JSON.parse(await readFile(path.resolve(root,'../SPT_Runtime/SPT_Data/database/locales/global/en.json'),'utf8'));
        const flagged=Object.entries(items).filter(([id,i])=>['bullet','buckshot'].includes(i._props?.ammoType)&&i._props.Caliber&&(
            [i._name,i._props.Name,english[id+' Name']].some(n=>n?.includes('!!!DO_NOT_USE!!!')) ||
            (i._props.Caliber==='Caliber9x18PM'&&!(english[id+' Name']||i._props.Name||i._name||'').toLowerCase().startsWith('9x18mm')))).map(([id])=>id);
        assert.ok(flagged.length>=10);
        for(const id of flagged){assert.equal(await excludedAmmo(id).isChecked(),true);assert.equal(await row(id).count(),0);}
        const fragment='5943d9c186f7745a13413ac9';
        await openMenu('.ag-exclusions'); await page.locator('.ag-exclusion-toolbar input').fill(fragment);
        await excludedAmmo(fragment).uncheck();
        await until(async()=>await row(fragment).count()===1);
        await until(async()=>(await settings()).includedDefaultAmmo.includes(fragment));
        await page.reload({waitUntil:'networkidle'});await ready();
        assert.equal(await row(fragment).count(),1);
        await page.locator('#ag-language').selectOption('en');
        await until(async()=>await page.locator('.ag-app').getAttribute('lang')==='en');
        assert.equal(await row(fragment).count(),1);
        await openMenu('.ag-exclusions');
        assert.equal(await excludedAmmo(fragment).isChecked(),false);
        await openMenu('.ag-exclusions'); await page.locator('.ag-reset-exclusions').click();
        await until(async()=>await row(fragment).count()===0);
        await page.locator('.ag-show-all').click();
        await until(async()=>await row(fragment).count()===1);
        assert.equal(await page.locator('.ag-exclusion-list input:checked').count(),0);
        for(const id of flagged)assert.equal(await row(id).count(),1);
    });
    await check('Caliber blacklist persists privately and can be undone',async()=>{
        await excludedCaliber('Caliber545x39').check();
        await until(async()=>await page.locator('.ag-caliber[data-caliber="Caliber545x39"]').count()===0);
        assert.equal(await page.locator('tbody tr').filter({hasText:'5.45x39'}).count(),0);
        await until(async()=>(await settings()).excludedCalibers.includes('Caliber545x39'));
        await page.reload({waitUntil:'networkidle'});await ready();
        assert.equal(await page.locator('.ag-caliber[data-caliber="Caliber545x39"]').count(),0);
        const otherContext=await browser.newContext({ignoreHTTPSErrors:true});
        const other=await otherContext.newPage();
        await other.goto(url,{waitUntil:'networkidle'});await other.locator('.ag-app[data-ready="true"]').waitFor();
        assert.equal(await other.locator('.ag-caliber[data-caliber="Caliber545x39"]').count(),1);
        await otherContext.close();
        await openMenu('.ag-exclusions');
        await excludedCaliber('Caliber545x39').uncheck();
        await until(async()=>await page.locator('.ag-caliber[data-caliber="Caliber545x39"]').count()===1);
    });
    await check('Hiding an ammunition template removes both shotgun representations and their scale influence',async()=>{
        await page.locator('#ag-pellets').check();
        await until(async()=>await page.locator('.ag-caliber[data-caliber="Caliber12g:pellet"]').count()===1);
        await page.locator('.ag-bulk button').first().click();
        const id='560d5e524bdc2d25448b4571';
        const name=await row(id).locator('.ag-ammo-name').innerText();
        await page.locator('.ag-table-heading input.ag-input').fill(name);
        await until(async()=>await page.locator('tbody tr').count()===2);
        assert.equal(await page.locator('.ag-table-panel .ag-hide-ammo,.ag-table-panel .ag-actions').count(),0);
        await openMenu('.ag-exclusions');await excludedAmmo(id).check();await page.keyboard.press('Escape');
        await until(async()=>await page.locator('tbody tr').count()===0);
        assert.equal(await row(id+':pellet').count(),0);
        await until(async()=>(await settings()).excludedAmmo.includes(id));
        await page.reload({waitUntil:'networkidle'});await ready();
        assert.equal(await page.locator('tbody tr').count(),0);
        await openMenu('.ag-exclusions');
        await openMenu('.ag-exclusions'); await page.locator('.ag-exclusion-toolbar input').fill(id);
        await excludedAmmo(id).uncheck();
        await until(async()=>await page.locator('tbody tr').count()===2);
        await page.locator('.ag-table-heading input.ag-input').fill('');
        await page.keyboard.press('Escape');
        await page.locator('.ag-chart-options input').first().uncheck();
        await until(async()=>!(await settings()).dynamicScale);
        const max=Math.max(...await page.locator('tbody td[data-column="Damage"][data-value]').evaluateAll(es=>es.map(e=>Number(e.dataset.value))));
        assert.ok(Math.abs(Number(await page.locator('.ag-chart').getAttribute('data-x-max'))-(max+Math.min(max*.1,10)))<.0011);
    });
    await check('Defaults can be restored and controls fit on a small screen',async()=>{
        await openMenu('.ag-exclusions'); await page.locator('.ag-exclusion-toolbar input').fill('');
        await openMenu('.ag-exclusions'); await page.locator('.ag-reset-exclusions').click();
        await until(async()=>await excludedAmmo('5943d9c186f7745a13413ac9').isChecked());
        await page.setViewportSize({width:390,height:844});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:path.join(artifacts,'exclusions-mobile-v6.png'),fullPage:true});
    });
    assert.deepEqual(errors,[]);
    await writeFile(path.join(artifacts,'table-results-v6.json'),JSON.stringify({passed,errors},null,2));
}catch(e){await page.screenshot({path:path.join(artifacts,'table-failure-v6.png'),fullPage:true}).catch(()=>{});throw e;}
finally{await browser.close();}
