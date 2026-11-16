import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {openSettingsSection} from './settings-helper.mjs';
const mapFile='SPT_Runtime/user/mods/AmmoGraph/config/caliber-names.json',exclusionFile='SPT_Runtime/user/mods/AmmoGraph/config/default-exclusions.json';
const mapBefore=await readFile(mapFile,'utf8'),exclusionsBefore=await readFile(exclusionFile,'utf8');
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1100}}),page=await context.newPage(),errors=[],passed=[];
const otherContext=await browser.newContext({ignoreHTTPSErrors:true}),other=await otherContext.newPage();
for(const p of [page,other]){p.on('pageerror',e=>errors.push(e.message));p.on('console',m=>{if(m.type()==='error')errors.push(m.text());});}
const url='https://localhost:6969/AmmoGraph',target='Caliber545x39',second='Caliber11x33R',alias='Private Alias 545';
async function until(fn){for(let i=0;i<120;i++){if(await fn())return;await page.waitForTimeout(100);}throw Error('UI timeout');}
async function check(name,fn){await fn();passed.push(name);console.log('PASS',name);}
const ready=p=>p.locator('.ag-app[data-ready="true"]').waitFor();
const label=(p,id)=>p.locator(`.ag-caliber[data-caliber="${id}"]>span`).innerText();
const settings=()=>page.evaluate(async()=>(await import('/ammo-graph/preferences.js?v=21')).load());
async function editor(){await page.evaluate(()=>scrollTo(0,0));return openSettingsSection(page,'caliber-names');}
async function select(id){await page.locator('#ag-name-caliber').selectOption(id);await until(async()=>await page.locator('#ag-name-value').inputValue()===await label(page,id));}
async function save(id,name){await editor();await select(id);await page.locator('#ag-name-value').fill(name);await page.locator('.ag-save-caliber-name').click();await until(async()=>await label(page,id)===name);}
try{
    await page.goto(url,{waitUntil:'networkidle'});await ready(page);await other.goto(url,{waitUntil:'networkidle'});await ready(other);
    const baseline=await label(page,target),secondBaseline=await label(page,second);
    await check('Settings use four accordions and the editor has only personal actions',async()=>{
        assert.equal(await page.locator('[data-settings-section]').count(),4);assert.equal(await page.locator('[data-settings-section][open]').count(),0);
        await openSettingsSection(page,'view');await editor();assert.equal(await page.locator('[data-settings-section][open]').count(),1);
        assert.ok((await page.locator('.ag-settings-hint').innerText()).includes('nur für diesen Browser'));
        assert.equal(await page.locator('.ag-delete-caliber-name').count(),1);assert.equal(await page.locator('.ag-reset-caliber-names').count(),1);
        await select(target);await page.locator('#ag-name-value').fill('   ');await until(async()=>await page.locator('.ag-save-caliber-name').isDisabled());
    });
    await check('Saving changes only this browser and leaves both configuration files unchanged',async()=>{
        await save(target,alias);await until(async()=>(await settings()).caliberNames?.['545x39']===alias);
        assert.equal(await label(other,target),baseline);await other.reload({waitUntil:'networkidle'});await ready(other);assert.equal(await label(other,target),baseline);
        assert.equal(await readFile(mapFile,'utf8'),mapBefore);assert.equal(await readFile(exclusionFile,'utf8'),exclusionsBefore);
    });
    await check('Personal names survive reload and are used for filtering and selected ammunition',async()=>{
        await page.reload({waitUntil:'networkidle'});await ready(page);assert.equal(await label(page,target),alias);
        await page.locator('.ag-sidebar>.ag-input').fill(alias);await until(async()=>await page.locator('.ag-caliber').count()===1);await page.locator('.ag-apply-filter').click();
        await until(async()=>await page.locator('.ag-comparison-table tbody tr').count()>0);await page.locator('.ag-ammo-name').first().click();await until(async()=>await page.locator('[data-detail="Caliber"]').innerText()===alias);
        await page.locator('.ag-sidebar>.ag-input').fill('');
    });
    await check('Delete name suppresses only the selected configured translation in this browser',async()=>{
        await editor();await select(second);await page.locator('.ag-delete-caliber-name').click();await until(async()=>(await settings()).caliberNames?.['11x33R']===null);
        await until(async()=>await label(page,second)!==secondBaseline);assert.equal(await label(page,target),alias);assert.equal(await label(other,second),secondBaseline);
        assert.equal(await page.locator(`[data-edit-caliber="${second}"]`).count(),0);
        await page.reload({waitUntil:'networkidle'});await ready(page);assert.notEqual(await label(page,second),secondBaseline);assert.equal(await label(page,target),alias);
    });
    await check('Reset defaults restores all configured names and removes personal overrides and deletions',async()=>{
        await editor();await page.locator('.ag-reset-caliber-names').click();await until(async()=>Object.keys((await settings()).caliberNames??{}).length===0);
        await until(async()=>await label(page,target)===baseline&&await label(page,second)===secondBaseline);
        await page.reload({waitUntil:'networkidle'});await ready(page);assert.equal(await label(page,target),baseline);assert.equal(await label(page,second),secondBaseline);
    });
    await check('Exclusion changes and resetting exclusions remain private and never write config',async()=>{
        await openSettingsSection(page,'exclusions');await page.locator('[data-exclude-caliber="Caliber556x45NATO"]').check();
        await until(async()=>await page.locator('.ag-caliber[data-caliber="Caliber556x45NATO"]').count()===0);
        assert.equal(await other.locator('.ag-caliber[data-caliber="Caliber556x45NATO"]').count(),1);
        await page.locator('[data-exclude-ammo="6241c316234b593b5676b637"]').uncheck();await page.locator('.ag-reset-exclusions').click();
        await until(async()=>await page.locator('.ag-caliber[data-caliber="Caliber556x45NATO"]').count()===1);
        assert.equal(await readFile(mapFile,'utf8'),mapBefore);assert.equal(await readFile(exclusionFile,'utf8'),exclusionsBefore);
    });
    await check('Mobile editor remains usable and translated without any config-file action',async()=>{
        await page.keyboard.press('Escape');await page.setViewportSize({width:320,height:844});await page.locator('#ag-language').selectOption('en');await editor();
        await until(async()=>await page.locator('.ag-save-caliber-name').innerText()==='Save');assert.equal(await page.locator('.ag-delete-caliber-name').innerText(),'Delete name');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:'AmmoGraph/artifacts/personal-caliber-editor-v21.png'});
    });
    assert.deepEqual(errors,[]);await writeFile('AmmoGraph/artifacts/caliber-editor-results-v21.json',JSON.stringify({passed,errors},null,2));
}catch(e){await page.screenshot({path:'AmmoGraph/artifacts/caliber-editor-failure-v21.png',fullPage:true}).catch(()=>{});throw e;}
finally{await browser.close();assert.equal(await readFile(mapFile,'utf8'),mapBefore);assert.equal(await readFile(exclusionFile,'utf8'),exclusionsBefore);}
