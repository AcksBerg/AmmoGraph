import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1100}}),page=await context.newPage(),passed=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const names={'Caliber1036x77':'.408 Cheyenne','Caliber11x33R':'.44 Magnum','Caliber762x67B':'.300 Winchester','Caliber86x63':'.338 Norma Magnum'};
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await page.waitForTimeout(100);}throw Error('UI timeout');}
async function check(name,fn){await fn();passed.push(name);console.log('PASS',name);}
try{
    await page.goto('https://localhost:6969/AmmoGraph',{waitUntil:'networkidle'});await page.locator('.ag-app[data-ready="true"]').waitFor();
    await check('Installed WTT calibers use the supplied names in both list and legend',async()=>{
        for(const [id,name] of Object.entries(names)){
            assert.equal(await page.locator(`.ag-caliber[data-caliber="${id}"]>span`).innerText(),name);
            assert.equal(await page.locator(`.ag-legend [data-caliber="${id}"]>span`).innerText(),name);
        }
    });
    await check('Caliber search and Apply filter use mapped names while retaining stable caliber IDs',async()=>{
        const s=page.locator('.ag-sidebar>.ag-input');
        for(const [id,name] of Object.entries(names)){
            await s.fill(name);await until(async()=>await page.locator('.ag-caliber').count()===1);await page.locator('.ag-apply-filter').click();
            await until(async()=>await page.locator(`.ag-legend [data-caliber="${id}"]`).getAttribute('aria-pressed')==='true');
            await until(async()=>await page.locator('.ag-comparison-table tbody tr').count()>0);
            await until(async()=>(await page.locator('.ag-comparison-table tbody [data-column="Caliber"] span').allTextContents()).every(n=>n===name));
        }
        await s.fill('762');await until(async()=>await page.locator('.ag-caliber').count()>0);
        assert.equal(await page.locator('.ag-caliber[data-caliber="Caliber762x67B"]').count(),0);await s.fill('');
    });
    await check('Selected ammunition, tooltip, locale changes and reload agree on the mapped caliber',async()=>{
        await page.locator('.ag-comparison-table .ag-ammo-name').first().click();await until(async()=>await page.locator('[data-detail="Caliber"]').innerText()==='.338 Norma Magnum');
        const p=page.locator('.ag-point').first();await p.scrollIntoViewIfNeeded();await page.waitForTimeout(150);await p.focus();
        await until(async()=>await page.locator('.ag-tooltip').getAttribute('data-open')==='true');
        assert.ok((await page.locator('[data-tooltip-value="Caliber"]').allTextContents()).every(n=>n==='.338 Norma Magnum'));
        await page.keyboard.press('Escape');await page.locator('#ag-language').selectOption('en');
        await until(async()=>await page.locator('.ag-app').getAttribute('lang')==='en');
        await page.reload({waitUntil:'networkidle'});await page.locator('.ag-app[data-ready="true"]').waitFor();
        assert.equal(await page.locator('[data-detail="Caliber"]').innerText(),'.338 Norma Magnum');
        assert.equal(await page.locator('.ag-legend [data-caliber="Caliber86x63"]').getAttribute('aria-pressed'),'true');
        await page.screenshot({path:'AmmoGraph/artifacts/caliber-map-v14.png'});
    });
    assert.deepEqual(errors,[]);await writeFile('AmmoGraph/artifacts/caliber-map-results-v14.json',JSON.stringify({passed,errors},null,2));
}finally{await browser.close();}
