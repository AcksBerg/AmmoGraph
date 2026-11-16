import { chromium } from 'playwright';
import {openSettingsSection} from './settings-helper.mjs';
import {setAttribute} from './transfer-helper.mjs';
import assert from 'node:assert/strict';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const artifacts=path.join(root,'artifacts');await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1100}});
const page=await context.newPage();const errors=[],passed=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
async function until(fn){for(let i=0;i<120;i++){if(await fn())return;await page.waitForTimeout(100);}throw Error('UI timeout');}
async function check(name,fn){await fn();passed.push(name);console.log('PASS',name);}
async function open(selector){if(selector==='.ag-exclusions'){await openSettingsSection(page,'exclusions');return;}if(!(await page.locator(selector).evaluate(e=>e.open)))await page.locator(selector+'>summary').click();}
function grouped(states){let unchecked=false;for(const state of states){if(!state)unchecked=true;else assert.equal(unchecked,false,'Excluded entries must precede all visible entries');}}
async function fits(selector){const r=await page.locator(selector).boundingBox();const viewport=page.viewportSize();assert.ok(r.x>=0&&r.x+r.width<=viewport.width+1&&r.y>=0&&r.y+r.height<=viewport.height+1,JSON.stringify(r));}
try{
    assert.equal((await page.goto(process.env.AMMOGRAPH_URL||'https://localhost:6969/AmmoGraph',{waitUntil:'networkidle'})).status(),200);
    await page.locator('.ag-app[data-ready="true"]').waitFor();
    await check('Gear and eye menus occupy the requested locations and have accessible names',async()=>{
        assert.equal(await page.locator('.ag-header-actions .ag-exclusions').count(),1);
        assert.equal(await page.locator('.ag-main>.ag-exclusions').count(),0);
        assert.equal(await page.locator('.ag-table-tools .ag-column-picker').count(),1);
        assert.equal(await page.locator('.ag-exclusions>summary').getAttribute('aria-label'),'Einstellungen');
        assert.equal(await page.locator('.ag-column-picker>summary').getAttribute('aria-label'),'Spalten');
        assert.equal(await page.locator('.ag-exclusions>summary svg').count(),1);
        assert.equal(await page.locator('.ag-column-picker>summary svg').count(),1);
        await open('.ag-exclusions');
        assert.deepEqual(await page.locator('.ag-exclusion-sections h3').allTextContents(),['Kaliber','Munition']);
        await fits('.ag-exclusion-panel');
    });
    await check('Excluded calibers and ammunition are grouped first after changes',async()=>{
        grouped(await page.locator('[data-exclude-ammo]').evaluateAll(es=>es.map(e=>e.checked)));
        await page.locator('[data-exclude-caliber="Caliber9x39"]').check();
        await until(async()=>await page.evaluate(async()=>(await(await import('/ammo-graph/preferences.js?v=6')).load()).excludedCalibers.includes('Caliber9x39')));
        grouped(await page.locator('[data-exclude-caliber]').evaluateAll(es=>es.map(e=>e.checked)));
        const unhidden=await page.locator('[data-exclude-ammo]:not(:checked)').last().getAttribute('data-exclude-ammo');
        await page.locator(`[data-exclude-ammo="${unhidden}"]`).check();
        await until(async()=>await page.evaluate(async id=>(await(await import('/ammo-graph/preferences.js?v=6')).load()).excludedAmmo.includes(id),unhidden));
        grouped(await page.locator('[data-exclude-ammo]').evaluateAll(es=>es.map(e=>e.checked)));
        await page.screenshot({path:path.join(artifacts,'settings-desktop-v6.png'),fullPage:true});
    });
    await check('Escape and outside clicks close popovers; eye opens with the keyboard',async()=>{
        await page.keyboard.press('Escape');assert.equal(await page.locator('.ag-exclusions').evaluate(e=>e.open),false);
        await open('.ag-exclusions');await page.locator('.ag-brand').click();
        await page.locator('.ag-app[data-ready="true"]').waitFor();
        assert.equal(await page.locator('.ag-exclusions').evaluate(e=>e.open),false);
        await page.locator('.ag-column-picker>summary').focus();await page.keyboard.press('Enter');
        await until(async()=>await page.locator('.ag-column-picker').evaluate(e=>e.open));
        await until(async()=>{const r=await page.locator('.ag-column-panel').boundingBox();return r&&r.y>=0&&r.y+r.height<=1101;});
        await fits('.ag-column-panel');
        await page.screenshot({path:path.join(artifacts,'columns-desktop-v6.png'),fullPage:true});
        await page.keyboard.press('Escape');assert.equal(await page.locator('.ag-column-picker').evaluate(e=>e.open),false);
    });
    await check('Attributes and language names are capitalized and units use parentheses',async()=>{
        await open('.ag-exclusions');
        await openSettingsSection(page,'attributes');
        await page.locator('[data-attributes="axes"]>summary').click();
        for(const key of ['RicochetChance','BulletMassGram'])await setAttribute(page.locator('[data-attributes="axes"]'),key,true);
        await until(async()=>(await page.locator('#ag-x option').allTextContents()).includes('Geschossmasse (g)'));
        await page.keyboard.press('Escape');
        const names=await page.locator('#ag-language option').allTextContents();
        for(const name of names)assert.equal(name[0],name[0].toLocaleUpperCase());
        const labels=await page.locator('#ag-x option').allTextContents();
        assert.ok(labels.includes('Geschossgeschwindigkeit (m/s)'));
        assert.ok(labels.includes('Querschlägerchance (%)'));
        assert.ok(labels.includes('Geschossmasse (g)'));
        assert.ok(!labels.some(s=>s.includes('QUERSCHLÄGERCH.')));
        for(const label of labels)assert.equal(label[0],label[0].toLocaleUpperCase());
        await page.locator('#ag-language').selectOption('en');
        await until(async()=>await page.locator('.ag-app').getAttribute('lang')==='en');
        assert.ok((await page.locator('#ag-x option').allTextContents()).includes('Bullet Velocity (m/s)'));
        await page.locator('#ag-language').selectOption('de');
        await until(async()=>await page.locator('.ag-app').getAttribute('lang')==='de');
    });
    await check('Probability percentages agree in table, detail, comparisons and chart',async()=>{
        await open('.ag-column-picker');
        await page.locator('.ag-column-options [data-column="RicochetChance"]').check();
        await until(async()=>await page.locator('thead [data-column="RicochetChance"]').count()===1);
        await page.keyboard.press('Escape');
        const items=JSON.parse(await readFile(path.resolve(root,'../SPT_Runtime/SPT_Data/database/templates/items.json'),'utf8'));
        const baseline=page.locator('tbody tr').filter({hasText:'7N40'});await baseline.locator('.ag-ammo-name').click();
        const id=await baseline.getAttribute('data-ammo');
        const expected=items[id]._props.RicochetChance*100;
        await until(async()=>Number(await baseline.locator('[data-column="RicochetChance"]').getAttribute('data-value'))===expected);
        await page.locator('.ag-all-values').click();
        await until(async()=>await page.locator('.ag-all-values').getAttribute('aria-expanded')==='true');
        assert.ok((await page.locator('.ag-details dt').allTextContents()).includes('Querschlägerchance (%)'));
        for(const tr of await page.locator('tbody tr').all()){
            const itemId=await tr.getAttribute('data-ammo');
            const cell=tr.locator('[data-column="RicochetChance"]');
            const value=items[itemId]._props.RicochetChance*100;
            assert.ok(Math.abs(Number(await cell.getAttribute('data-value'))-value)<1e-9);
            if(itemId!==id)assert.ok(Math.abs(Number(await cell.locator('[data-delta]').getAttribute('data-delta'))-(value-expected))<1e-9);
        }
        await page.locator('#ag-x').selectOption('RicochetChance');
        await until(async()=>(await page.locator('.ag-chart-heading h1').innerText()).includes('Querschlägerchance (%)'));
        const max=Math.max(...await page.locator('tbody [data-column="RicochetChance"]').evaluateAll(es=>es.map(e=>Number(e.dataset.value))));
        assert.ok(Math.abs(Number(await page.locator('.ag-chart').getAttribute('data-x-max'))-(max+Math.min(max*.1,10)))<.0011);
    });
    await check('Icon menus fit narrow screens and right-to-left layout',async()=>{
        await page.setViewportSize({width:390,height:844});await open('.ag-exclusions');await fits('.ag-exclusion-panel');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:path.join(artifacts,'settings-mobile-v6.png'),fullPage:true});
        await page.keyboard.press('Escape');await open('.ag-column-picker');await fits('.ag-column-panel');
        await page.keyboard.press('Escape');await page.setViewportSize({width:320,height:844});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.locator('#ag-language').selectOption('ar');await until(async()=>await page.locator('.ag-app').getAttribute('dir')==='rtl');
        await open('.ag-exclusions');await fits('.ag-exclusion-panel');
        await page.keyboard.press('Escape');await page.setViewportSize({width:1600,height:1100});await open('.ag-exclusions');await fits('.ag-exclusion-panel');
    });
    assert.deepEqual(errors,[]);await writeFile(path.join(artifacts,'menu-results-v6.json'),JSON.stringify({passed,errors},null,2));
}catch(e){await page.screenshot({path:path.join(artifacts,'menu-failure-v6.png'),fullPage:true}).catch(()=>{});throw e;}
finally{await browser.close();}
