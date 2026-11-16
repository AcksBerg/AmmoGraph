import {chromium} from 'playwright';
import {openSettingsSection} from './settings-helper.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const artifacts=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../artifacts');
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1100}});
const page=await context.newPage(),errors=[],passed=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
async function until(fn){for(let i=0;i<120;i++){if(await fn())return;await page.waitForTimeout(100);}throw Error('UI timeout');}
async function check(name,fn){await fn();passed.push(name);console.log('PASS',name);}
const rows=()=>page.locator('tbody tr[data-ammo]').evaluateAll(es=>es.map(e=>e.dataset.ammo));
try{
    await page.goto(process.env.AMMOGRAPH_URL||'https://localhost:6969/AmmoGraph',{waitUntil:'networkidle'});
    await page.locator('.ag-app[data-ready="true"]').waitFor();
    await page.locator('#ag-language').selectOption('en');
    await check('Empty graph prioritizes caliber selection, then the active ammunition filter',async()=>{
        await page.locator('[data-legend-none]').click();
        await until(async()=>(await page.locator('.ag-chart-empty').innerText()).startsWith('No calibers selected.'));
        await page.locator('.ag-table-tools>input').fill('no-such-ammunition-xyz');
        await until(async()=>(await page.locator('.ag-table-empty').innerText()).startsWith('No calibers selected.'));
        await page.locator('[data-legend-all]').click();
        await until(async()=>await page.locator('.ag-chart-empty').innerText()==='No matching ammunition. Adjust your ammunition filter.');
        await openSettingsSection(page,'view');await page.locator('#ag-show-table').uncheck();await page.keyboard.press('Escape');
        await until(async()=>await page.locator('.ag-chart-empty').count()===0);
        await page.locator('[data-legend-none]').click();
        await until(async()=>(await page.locator('.ag-chart-empty').innerText()).startsWith('No calibers selected.'));
        await page.locator('#ag-language').selectOption('de');
        await until(async()=>(await page.locator('.ag-chart-empty').innerText()).startsWith('Keine Kaliber ausgewählt.'));
        await page.locator('[data-legend-all]').click();
        await openSettingsSection(page,'view');await page.locator('#ag-show-table').check();await page.keyboard.press('Escape');
        await page.locator('.ag-table-tools>input').fill('');await until(async()=>await page.locator('tbody tr').count()>0);
    });
    await check('Caliber search ignores dots and slashes',async()=>{
        const search=page.locator('.ag-sidebar>.ag-input');await search.fill('5.45');
        await until(async()=>await page.locator('.ag-caliber').count()===1);
        const ids=await page.locator('.ag-caliber').evaluateAll(es=>es.map(e=>e.dataset.caliber));
        await search.fill('5/4.5');await until(async()=>JSON.stringify(await page.locator('.ag-caliber').evaluateAll(es=>es.map(e=>e.dataset.caliber)))===JSON.stringify(ids));
        await search.fill('');
    });
    await check('Ammunition search uses the same normalization for names and calibers',async()=>{
        const search=page.locator('.ag-table-tools>input');await search.fill('5.45');
        await until(async()=>await page.locator('tbody tr').count()>0&&await page.locator('tbody tr').count()<30);
        const expected=await rows();await search.fill('5/4.5');await until(async()=>JSON.stringify(await rows())===JSON.stringify(expected));
        const name=await page.locator('.ag-ammo-name').first().innerText();await search.fill(name);
        await until(async()=>await page.locator('tbody tr').count()===1);const exact=await rows();
        await search.fill(name.replaceAll('.','').replaceAll('/','')+'/');await until(async()=>JSON.stringify(await rows())===JSON.stringify(exact));
        await search.fill('');
    });
    await check('Caliber search matches display names and does not expose hidden internal caliber aliases',async()=>{
        const search=page.locator('.ag-sidebar>.ag-input');await search.fill('762');
        await until(async()=>await page.locator('.ag-caliber').count()>0&&await page.locator('.ag-caliber').count()<10);
        const names=await page.locator('.ag-caliber>span').allTextContents();
        assert.ok(names.every(n=>n.replaceAll('.','').replaceAll('/','').includes('762')));
        assert.ok(!names.some(n=>n.includes('300')));
        await search.fill('Caliber');await until(async()=>await page.locator('.ag-caliber').count()===0);await search.fill('');
        await openSettingsSection(page,'exclusions');await page.locator('.ag-exclusion-toolbar input').fill('762');
        await until(async()=>await page.locator('[data-exclude-caliber]').count()>0&&await page.locator('[data-exclude-caliber]').count()<10);
        assert.ok(!(await page.locator('.ag-excluded-calibers label>span').allTextContents()).some(n=>n.includes('300')));
        await page.locator('.ag-exclusion-toolbar input').fill('');await page.keyboard.press('Escape');
    });
    await check('Exclusion search also ignores dots and slashes',async()=>{
        await openSettingsSection(page,'exclusions');const search=page.locator('.ag-exclusion-toolbar input');
        await search.fill('5.45');await until(async()=>await page.locator('[data-exclude-caliber]').count()===1);
        const expected=await page.locator('[data-exclude-ammo]').evaluateAll(es=>es.map(e=>e.dataset.excludeAmmo));assert.ok(expected.length>0);
        await search.fill('5/4.5');await until(async()=>JSON.stringify(await page.locator('[data-exclude-ammo]').evaluateAll(es=>es.map(e=>e.dataset.excludeAmmo)))===JSON.stringify(expected));
        await search.fill('');await page.keyboard.press('Escape');
    });
    await check('Filter labels align and ten SVG symbols include filled and outlined stars',async()=>{
        await until(async()=>await page.locator('.ag-caliber').count()>10);
        const positions=await page.locator('.ag-caliber>span').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().left-e.parentElement.getBoundingClientRect().left));
        assert.ok(Math.max(...positions)-Math.min(...positions)<.5);
        const shapes=await page.locator('.ag-caliber .ag-marker').evaluateAll(es=>[...new Set(es.map(e=>Number(e.dataset.shape)))].sort((a,b)=>a-b));
        assert.deepEqual(shapes,[0,1,2,3,4,5,6,7,8,9]);
        for(let i=0;i<10;i++){
            const marker=page.locator(`.ag-caliber .ag-marker[data-shape="${i}"]`).first();
            assert.equal(await marker.getAttribute('fill'),i>=5?'none':'currentColor');
        }
        assert.equal(await page.locator('.ag-caliber .ag-marker[data-shape="4"] polygon').first().getAttribute('points').then(p=>p.trim().split(/\s+/).length),10);
        for(const marker of await page.locator('.ag-point .ag-marker').all()){
            assert.equal(await marker.evaluate(e=>getComputedStyle(e).fill==='none'),Number(await marker.getAttribute('data-shape'))>=5);
        }
        await page.screenshot({path:path.join(artifacts,'search-symbols-desktop-v7.png'),fullPage:true});
    });
    await check('Mobile filter text stays aligned without horizontal overflow',async()=>{
        await page.setViewportSize({width:390,height:844});
        const positions=await page.locator('.ag-caliber>span').evaluateAll(es=>es.map(e=>e.getBoundingClientRect().left-e.parentElement.getBoundingClientRect().left));
        assert.ok(Math.max(...positions)-Math.min(...positions)<.5);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:path.join(artifacts,'search-symbols-mobile-v7.png'),fullPage:true});
    });
    assert.deepEqual(errors,[]);await writeFile(path.join(artifacts,'search-symbols-results-v7.json'),JSON.stringify({passed,errors},null,2));
}catch(e){await page.screenshot({path:path.join(artifacts,'search-symbols-failure-v7.png'),fullPage:true}).catch(()=>{});throw e;}
finally{await browser.close();}
