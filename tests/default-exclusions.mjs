import {chromium} from 'playwright';
import {openSettingsSection} from './settings-helper.mjs';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true}),page=await context.newPage(),errors=[],passed=[];
page.on('pageerror',e=>errors.push(e.message));
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await page.waitForTimeout(100);}throw Error('UI timeout');}
async function check(name,fn){await fn();passed.push(name);console.log('PASS',name);}
const ready=()=>page.locator('.ag-app[data-ready="true"]').waitFor();
async function menu(){await openSettingsSection(page,'exclusions');}
try{
    await page.goto('https://localhost:6969/AmmoGraph',{waitUntil:'networkidle'});await ready();
    const rules=JSON.parse(await readFile('SPT_Runtime/user/mods/AmmoGraph/config/default-exclusions.json','utf8'));
    await check('Default file contains 40x46 and all prior default ammunition rules',async()=>{
        assert.deepEqual(Object.keys(rules).sort(),['ammo','calibers','nameContains']);assert.ok(rules.calibers.includes('40x46'));assert.ok(rules.ammo.includes('6241c316234b593b5676b637'));assert.ok(rules.ammo.includes('5943d9c186f7745a13413ac9'));assert.ok(rules.ammo.every(id=>/^[0-9a-f]{24}$/i.test(id)));assert.ok(rules.nameContains.includes('!!!DO_NOT_USE!!!'));
        assert.equal(await page.locator('[data-exclude-ammo="6241c316234b593b5676b637"]').isChecked(),true);
        assert.equal(await page.locator('[data-exclude-ammo="5943d9c186f7745a13413ac9"]').isChecked(),true);
        assert.equal(await page.getByText('nameContains',{exact:true}).count(),0);
        assert.equal(await page.locator('.ag-caliber[data-caliber^="Caliber40x46"]').count(),0);
        await menu();for(const c of await page.locator('[data-exclude-caliber^="Caliber40x46"]').all())assert.equal(await c.isChecked(),true);
    });
    await check('40x46 can be restored personally, survives reload, and returns to default on reset',async()=>{
        const c=page.locator('[data-exclude-caliber^="Caliber40x46"]').filter({visible:true});
        const all=await page.locator('[data-exclude-caliber^="Caliber40x46"]').evaluateAll(es=>es.map(e=>e.dataset.excludeCaliber));assert.ok(all.length>0);
        const id=all.find(k=>!k.endsWith(':pellet'));
        await page.locator(`[data-exclude-caliber="${id}"]`).uncheck();await until(async()=>await page.locator(`.ag-caliber[data-caliber="${id}"]`).count()===1);
        await page.reload({waitUntil:'networkidle'});await ready();assert.equal(await page.locator(`.ag-caliber[data-caliber="${id}"]`).count(),1);
        await menu();await page.locator('.ag-reset-exclusions').click();await until(async()=>await page.locator('.ag-caliber[data-caliber^="Caliber40x46"]').count()===0);await page.keyboard.press('Escape');
    });
    await check('The table has no ammunition or caliber hiding actions and no extra action column',async()=>{
        assert.equal(await page.locator('.ag-table-panel .ag-hide-ammo,.ag-table-panel .ag-actions,.ag-table-panel [data-exclude-caliber],.ag-table-panel [data-exclude-ammo]').count(),0);
        const headers=await page.locator('.ag-comparison-table th').count();assert.equal(headers,5);assert.equal(await page.locator('.ag-comparison-table tbody tr').first().locator('td').count(),headers);
    });
    assert.deepEqual(errors,[]);await writeFile('AmmoGraph/artifacts/default-exclusions-results-v17.json',JSON.stringify({passed,errors},null,2));
}finally{await browser.close();}
