import {chromium} from 'playwright';
import {openSettingsSection} from './settings-helper.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),artifacts=path.join(root,'artifacts');await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1100}}),page=await context.newPage();
const errors=[],passed=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const url=process.env.AMMOGRAPH_URL||'https://localhost:6969/AmmoGraph';
const ready=()=>page.waitForFunction(()=>document.querySelector('.ag-app')?.dataset.ready==='true'&&document.querySelector('.ag-chart')?.dataset.zoom);
async function until(fn){for(let i=0;i<120;i++){if(await fn())return;await page.waitForTimeout(100);}throw Error('UI timeout');}
async function check(name,fn){await fn();passed.push(name);console.log('PASS',name);}
async function settings(){return page.evaluate(async()=>(await import('/ammo-graph/preferences.js?v=6')).load());}
async function open(scope='exclusions'){await openSettingsSection(page,scope);}
const read=()=>page.locator('.ag-chart').evaluate(e=>({k:Number(e.dataset.zoom),minX:Number(e.dataset.xMin),maxX:Number(e.dataset.xMax),minY:Number(e.dataset.yMin),maxY:Number(e.dataset.yMax),x:Number(e.dataset.viewXMin),y:Number(e.dataset.viewYMin)}));
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-7*Math.max(1,Math.abs(b)),`${a} != ${b}`);
async function drag(from,to){
    await page.locator('.ag-chart').scrollIntoViewIfNeeded();
    const [a,b]=await page.locator('.ag-chart').evaluate((e,ps)=>ps.map(([x,y])=>{const p=new DOMPoint(x,y).matrixTransform(e.getScreenCTM());return{x:p.x,y:p.y};}),[from,to]);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});await page.mouse.up();
}
try{
    assert.equal((await page.goto(url,{waitUntil:'networkidle'})).status(),200);await ready();
    await check('Airsoft BB is hidden by default, can be restored and remains restored',async()=>{
        const id='6241c316234b593b5676b637';assert.equal(await page.locator(`tbody tr[data-ammo="${id}"]`).count(),0);
        await open();assert.equal(await page.locator(`[data-exclude-ammo="${id}"]`).isChecked(),true);
        await page.locator('.ag-exclusion-toolbar input').fill(id);await page.locator(`[data-exclude-ammo="${id}"]`).uncheck();
        await until(async()=>(await settings()).includedDefaultAmmo.includes(id));
        await page.reload({waitUntil:'networkidle'});await ready();assert.equal(await page.locator(`tbody tr[data-ammo="${id}"]`).count(),1);
        await open();await page.locator('.ag-reset-exclusions').click();await until(async()=>await page.locator(`tbody tr[data-ammo="${id}"]`).count()===0);await page.keyboard.press('Escape');
    });
    await check('Hidden table does not filter graph; restoring it reapplies the saved ammunition filter',async()=>{
        await page.locator('#ag-language').selectOption('en');await until(async()=>await page.locator('.ag-app').getAttribute('lang')==='en');
        await page.locator('.ag-table-tools>.ag-input').fill('NO_MATCHING_AMMO_12345');await until(async()=>await page.locator('.ag-point').count()===0);
        assert.equal((await page.locator('.ag-chart-empty').innerText()).trim(),'No matching ammunition. Adjust your ammunition filter.');
        await open('view');await page.locator('#ag-show-table').uncheck();await until(async()=>await page.locator('.ag-point').count()>5);
        assert.equal(await page.locator('.ag-chart-empty').count(),0);assert.equal((await settings()).search,'NO_MATCHING_AMMO_12345');
        await page.reload({waitUntil:'networkidle'});await ready();assert.equal(await page.locator('.ag-table-panel').count(),0);assert.ok(await page.locator('.ag-point').count()>5);
        await open('view');await page.locator('#ag-show-table').check();await until(async()=>await page.locator('.ag-point').count()===0);await page.keyboard.press('Escape');
        assert.equal(await page.locator('.ag-table-tools>.ag-input').inputValue(),'NO_MATCHING_AMMO_12345');
        await page.locator('.ag-table-tools>.ag-input').fill('');await until(async()=>await page.locator('.ag-point').count()>5);
    });
    await check('Pellet checkbox stays beside graph All/None when the sidebar is hidden',async()=>{
        await open('view');await page.locator('#ag-show-filters').uncheck();await until(async()=>await page.locator('.ag-sidebar').count()===0);await page.keyboard.press('Escape');
        assert.equal(await page.locator('.ag-legend-bulk #ag-pellets').count(),1);assert.equal(await page.locator('#ag-pellets').count(),1);
        await page.locator('#ag-pellets').check();await page.locator('[data-legend-all]').click();
        await until(async()=>await page.locator('.ag-legend [data-caliber="Caliber12g:pellet"][aria-pressed="true"]').count()===1);
        await page.locator('#ag-pellets').uncheck();await until(async()=>await page.locator('.ag-legend [data-caliber="Caliber12g:pellet"]').count()===0);
        await page.locator('#ag-pellets').check();await until(async()=>await page.locator('.ag-legend [data-caliber="Caliber12g:pellet"][aria-pressed="true"]').count()===1);
        await page.locator('.ag-legend [data-caliber="Caliber545x39"]').dblclick();await until(async()=>(await settings()).calibers.length===1);
    });
    await check('Unzoomed mouse pan stops at exactly 20% in both directions and resets correctly',async()=>{
        await page.locator('.ag-chart').focus();await page.keyboard.press('Home');const base=await read();close(base.k,1);
        await drag([350,240],[750,360]);await until(async()=>Math.abs((await read()).x-base.minX)>.001);
        const a=await read();close(a.k,1);close(a.x,base.minX-(base.maxX-base.minX)*.2);close(a.y,base.minY+(base.maxY-base.minY)*.2);
        assert.equal(await page.locator('.ag-static-axes').evaluate(e=>getComputedStyle(e).display),'none');assert.equal(await page.locator('[data-nav="reset"]').isDisabled(),false);assert.equal(await page.locator('[data-nav="out"]').isDisabled(),true);
        await drag([750,360],[350,120]);await until(async()=>(await read()).x>base.minX);
        const b=await read();close(b.x,base.minX+(base.maxX-base.minX)*.2);close(b.y,base.minY-(base.maxY-base.minY)*.2);
        await page.screenshot({path:path.join(artifacts,'pan-unzoomed-v6.png'),fullPage:true});
        await page.locator('[data-nav="reset"]').click();await until(async()=>await page.locator('[data-nav="reset"]').isDisabled());const reset=await read();close(reset.x,base.minX);close(reset.y,base.minY);close(reset.k,1);
    });
    await check('Unzoomed touch pan obeys the same cap and the relocated pellet control fits mobile',async()=>{
        const mobileContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true}),mobile=await mobileContext.newPage();mobile.on('pageerror',e=>errors.push(e.message));
        await mobile.goto(url,{waitUntil:'networkidle'});await mobile.waitForFunction(()=>document.querySelector('.ag-chart')?.dataset.zoom);
        await openSettingsSection(mobile,'view');for(const id of ['ag-show-filters','ag-show-table','ag-show-details'])await mobile.locator('#'+id).uncheck();await mobile.keyboard.press('Escape');
        await mobile.locator('.ag-chart').scrollIntoViewIfNeeded();
        const p=await mobile.locator('.ag-chart').evaluate(e=>{const p=new DOMPoint(400,240).matrixTransform(e.getScreenCTM());return{x:p.x,y:p.y,minX:Number(e.dataset.xMin),minY:Number(e.dataset.yMin),w:Number(e.dataset.xMax)-Number(e.dataset.xMin),h:Number(e.dataset.yMax)-Number(e.dataset.yMin)};});
        const cdp=await mobileContext.newCDPSession(mobile);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:p.x,y:p.y}]});
        for(let i=1;i<=10;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:p.x+i*9,y:p.y+i*4}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        await until(async()=>Number(await mobile.locator('.ag-chart').getAttribute('data-view-x-min'))<p.minX);
        close(Number(await mobile.locator('.ag-chart').getAttribute('data-zoom')),1);close(Number(await mobile.locator('.ag-chart').getAttribute('data-view-x-min')),p.minX-p.w*.2);close(Number(await mobile.locator('.ag-chart').getAttribute('data-view-y-min')),p.minY+p.h*.2);
        assert.equal(await mobile.locator('.ag-legend-bulk #ag-pellets').count(),1);assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await mobile.screenshot({path:path.join(artifacts,'pan-mobile-v6.png'),fullPage:true});await mobileContext.close();
    });
    assert.deepEqual(errors,[]);await writeFile(path.join(artifacts,'filter-pan-results-v6.json'),JSON.stringify({passed,errors},null,2));
}catch(e){await page.screenshot({path:path.join(artifacts,'filter-pan-failure-v6.png'),fullPage:true}).catch(()=>{});throw e;}
finally{await browser.close();}
