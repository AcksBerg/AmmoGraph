import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true,colorScheme:'light',viewport:{width:1600,height:1100}}),page=await context.newPage(),passed=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const url='https://localhost:6969/AmmoGraph',toggle=page.locator('.ag-theme-toggle'),search=page.locator('.ag-sidebar>.ag-input'),apply=page.locator('.ag-apply-filter');
const ready=()=>page.locator('.ag-app[data-ready="true"]').waitFor();
const scheme=()=>page.locator('.ag-app').evaluate(e=>getComputedStyle(e).colorScheme);
const settings=()=>page.evaluate(async()=>(await import('/ammo-graph/preferences.js?v=13')).load());
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await page.waitForTimeout(100);}throw Error('UI timeout');}
async function check(name,fn){await fn();passed.push(name);console.log('PASS',name);}
try{
    await page.goto(url,{waitUntil:'networkidle'});await ready();
    await check('System default follows device changes; the header has a direct toggle with no menu',async()=>{
        assert.equal(await page.locator('.ag-app').getAttribute('data-theme'),'system');assert.equal(await scheme(),'light');
        await page.emulateMedia({colorScheme:'dark'});await until(async()=>await toggle.getAttribute('aria-checked')==='true');assert.equal(await scheme(),'dark');
        await page.emulateMedia({colorScheme:'light'});await until(async()=>await toggle.getAttribute('aria-checked')==='false');
        assert.equal(await page.locator('.ag-exclusions+ .ag-theme-toggle').count(),1);assert.equal(await page.locator('.ag-theme-panel').count(),0);
        assert.equal(await page.locator('.ag-header-actions').evaluate(e=>getComputedStyle(e).gap),'12px');
    });
    await check('One click switches to the opposite actual mode, persists, and ignores subsequent device changes',async()=>{
        await toggle.click();await until(async()=>await scheme()==='dark');await until(async()=>(await settings()).theme==='dark');
        await page.reload({waitUntil:'networkidle'});await ready();assert.equal(await scheme(),'dark');
        await page.emulateMedia({colorScheme:'dark'});await toggle.click();await until(async()=>await scheme()==='light');
        await page.emulateMedia({colorScheme:'light'});assert.equal(await scheme(),'light');
        await page.reload({waitUntil:'networkidle'});await ready();assert.equal(await scheme(),'light');
    });
    await check('Apply filter is below All/None, disabled for empty input, and does not change selection while typing',async()=>{
        assert.equal(await apply.isDisabled(),true);assert.equal(await page.locator('.ag-bulk+ .ag-apply-filter').count(),1);
        const before=(await settings()).calibers;await search.fill('762');await until(async()=>await page.locator('.ag-caliber').count()>0&&await page.locator('.ag-caliber').count()<10);
        assert.deepEqual((await settings()).calibers,before);assert.equal(await apply.isEnabled(),true);
    });
    await check('Applying activates exactly the visible search results and persists the selection',async()=>{
        const expected=await page.locator('.ag-caliber').evaluateAll(es=>es.map(e=>e.dataset.caliber).sort());await apply.click();
        await until(async()=>JSON.stringify((await settings()).calibers)===JSON.stringify(expected));
        assert.deepEqual(await page.locator('.ag-legend button[aria-pressed="true"]').evaluateAll(es=>es.map(e=>e.dataset.caliber).sort()),expected);
        assert.equal(await page.locator('.ag-caliber input:not(:checked)').count(),0);
        await page.reload({waitUntil:'networkidle'});await ready();assert.deepEqual((await settings()).calibers,expected);
        await search.fill('');await until(async()=>await apply.isDisabled());assert.deepEqual((await settings()).calibers,expected);
    });
    await check('A search with no matches applies an empty selection and shows the caliber message',async()=>{
        await search.fill('no-such-caliber-123');await until(async()=>await page.locator('.ag-caliber').count()===0);await apply.click();
        await until(async()=>(await settings()).calibers.length===0);assert.equal(await page.locator('.ag-point').count(),0);await search.fill('');
    });
    await check('Mobile header stays compact and the toggle supports keyboard activation',async()=>{
        await page.setViewportSize({width:320,height:844});await page.evaluate(()=>scrollTo(0,0));
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        assert.equal(await page.locator('.ag-header-actions').evaluate(e=>getComputedStyle(e).gap),'2.5px');
        const before=await scheme();await toggle.focus();await page.keyboard.press('Space');await until(async()=>await scheme()!==before);
        await page.screenshot({path:'AmmoGraph/artifacts/toggle-mobile-v13.png'});
    });
    await check('Fresh dark devices start dark and the first click switches directly to light',async()=>{
        const c=await browser.newContext({ignoreHTTPSErrors:true,colorScheme:'dark'}),p=await c.newPage();await p.goto(url,{waitUntil:'networkidle'});await p.locator('.ag-app[data-ready="true"]').waitFor();
        assert.equal(await p.locator('.ag-app').evaluate(e=>getComputedStyle(e).colorScheme),'dark');await p.locator('.ag-theme-toggle').click();await p.waitForFunction(()=>document.querySelector('.ag-app').dataset.theme==='light');await c.close();
    });
    assert.deepEqual(errors,[]);await writeFile('AmmoGraph/artifacts/theme-results-v13.json',JSON.stringify({passed,errors},null,2));
}finally{await browser.close();}
