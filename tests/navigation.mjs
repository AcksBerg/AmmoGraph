import {chromium} from 'playwright';
import {openSettingsSection} from './settings-helper.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'), artifacts=path.join(root,'artifacts');await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1100}});
const page=await context.newPage();const errors=[],passed=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const url=process.env.AMMOGRAPH_URL||'https://localhost:6969/AmmoGraph';
async function until(fn){for(let i=0;i<120;i++){if(await fn())return;await page.waitForTimeout(100);}throw Error('UI timeout');}
async function check(name,fn){await fn();passed.push(name);console.log('PASS',name);}
const ready=()=>page.waitForFunction(()=>document.querySelector('.ag-app')?.dataset.ready==='true'&&document.querySelector('.ag-chart')?.dataset.zoom);
const state=()=>page.locator('.ag-chart').evaluate(e=>({k:Number(e.dataset.zoom),x:Number(e.dataset.viewXMin),y:Number(e.dataset.viewYMin),maxX:Number(e.dataset.viewXMax),maxY:Number(e.dataset.viewYMax)}));
const settings=()=>page.evaluate(async()=>(await import('/ammo-graph/preferences.js?v=6')).load());
async function openSettings(scope='exclusions'){await openSettingsSection(page,scope);}
async function point(x=500,y=256){return page.locator('.ag-chart').evaluate((svg,p)=>{const q=new DOMPoint(p.x,p.y).matrixTransform(svg.getScreenCTM());return{x:q.x,y:q.y};},{x,y});}
try{
    assert.equal((await page.goto(url,{waitUntil:'networkidle'})).status(),200);await ready();
    await check('20x1 and 26x75 are reversible defaults that survive a reload',async()=>{
        assert.equal(await page.locator('.ag-caliber[data-caliber="Caliber20x1mm"]').count(),0);
        assert.equal(await page.locator('.ag-legend [data-caliber="Caliber26x75"]').count(),0);
        await openSettings();
        for(const id of ['Caliber20x1mm','Caliber26x75'])assert.equal(await page.locator(`[data-exclude-caliber="${id}"]`).isChecked(),true);
        await page.locator('[data-exclude-caliber="Caliber20x1mm"]').uncheck();
        await until(async()=>(await settings()).includedDefaultCalibers.includes('Caliber20x1mm'));
        await page.reload({waitUntil:'networkidle'});await ready();
        assert.equal(await page.locator('.ag-caliber[data-caliber="Caliber20x1mm"]').count(),1);
        await openSettings();await page.locator('.ag-reset-exclusions').click();
        await until(async()=>await page.locator('.ag-caliber[data-caliber="Caliber20x1mm"]').count()===0);
        await page.keyboard.press('Escape');
    });
    await check('Mouse wheel zooms around the pointer, updates axes, and clips points',async()=>{
        await page.locator('.ag-chart').scrollIntoViewIfNeeded();const center=await point();
        await page.mouse.move(center.x,center.y);await page.mouse.wheel(0,-600);
        await until(async()=>(await state()).k>1.5);
        assert.ok(await page.locator('.ag-navigation-axes .ag-tick').count()>0);
        assert.ok(await page.locator('.ag-point[style*="visibility: hidden"]').count()>0);
        assert.equal(await page.locator('.ag-point-layer').getAttribute('clip-path'),'url(#ag-plot-clip)');
        assert.equal(await page.locator('.ag-chart').evaluate(e=>/NaN|Infinity/.test(e.outerHTML)),false);
    });
    await check('Mouse dragging pans and does not accidentally select an ammunition point',async()=>{
        const before=await state(), center=await point();
        const selection=await page.locator('.ag-details h3').allTextContents();
        await page.mouse.move(center.x,center.y);await page.mouse.down();await page.mouse.move(center.x+65,center.y+25,{steps:10});await page.mouse.up();
        await until(async()=>Math.abs((await state()).x-before.x)>.001);
        assert.deepEqual(await page.locator('.ag-details h3').allTextContents(),selection);
        await page.waitForTimeout(350);
        await page.locator('.ag-point:visible .ag-hit-area').first().click();
        await until(async()=>await page.locator('.ag-details h3').count()===1);
        assert.ok((await state()).k>1.5);
        await page.screenshot({path:path.join(artifacts,'zoom-desktop-v6.png'),fullPage:true});
        await page.locator('[data-nav="reset"]').click();await until(async()=>(await state()).k===1);
    });
    await check('Double-clicking sidebar and legend calibers selects only that caliber',async()=>{
        await page.locator('.ag-caliber[data-caliber="Caliber545x39"]').dblclick();
        await until(async()=>{const s=await settings();return s.calibers.length===1&&s.calibers[0]==='Caliber545x39';});
        await page.locator('.ag-legend [data-caliber="Caliber556x45NATO"]').dblclick();
        await until(async()=>{const s=await settings();return s.calibers.length===1&&s.calibers[0]==='Caliber556x45NATO';});
        assert.equal(await page.locator('.ag-legend button[aria-pressed="true"]').count(),1);
        await page.locator('[data-legend-none]').click();await until(async()=>await page.locator('.ag-point').count()===0);
        assert.ok(await page.locator('.ag-legend button').count()>20);
        await page.locator('[data-legend-all]').click();await until(async()=>await page.locator('.ag-point').count()>100);
        await page.locator('.ag-legend [data-caliber="Caliber545x39"]').dblclick();
        await until(async()=>(await settings()).calibers.length===1);
    });
    await check('Panel visibility persists and legend controls work without the sidebar',async()=>{
        await page.locator('[data-nav="in"]').click();await until(async()=>(await state()).k>1);
        const zoom=await state();await openSettings('view');
        for(const id of ['ag-show-filters','ag-show-table','ag-show-details'])await page.locator('#'+id).uncheck();
        await until(async()=>{const s=await settings();return !s.showFilters&&!s.showTable&&!s.showDetails;});
        assert.equal(await page.locator('.ag-sidebar,.ag-table-panel,.ag-details').count(),0);
        assert.ok(Math.abs((await state()).k-zoom.k)<1e-8);
        await page.keyboard.press('Escape');
        await page.locator('[data-legend-none]').click();await until(async()=>await page.locator('.ag-point').count()===0);
        await page.locator('[data-legend-all]').click();await until(async()=>await page.locator('.ag-point').count()>100);
        await page.screenshot({path:path.join(artifacts,'graph-only-v6.png'),fullPage:true});
        await page.reload({waitUntil:'networkidle'});await ready();assert.equal(await page.locator('.ag-sidebar,.ag-table-panel,.ag-details').count(),0);
        await openSettings('view');for(const id of ['ag-show-filters','ag-show-table','ag-show-details'])await page.locator('#'+id).check();
        await until(async()=>await page.locator('.ag-sidebar,.ag-table-panel,.ag-details').count()===3);await page.keyboard.press('Escape');
    });
    await check('Camera resets on axis changes and zoom buttons/keyboard are bounded',async()=>{
        await page.locator('[data-nav="in"]').click();await until(async()=>(await state()).k>1);
        await page.locator('#ag-x').selectOption('InitialSpeed');await until(async()=>(await state()).k===1);
        await page.locator('.ag-chart').focus();await page.keyboard.press('+');await until(async()=>(await state()).k>1);
        await page.keyboard.press('Home');await until(async()=>(await state()).k===1);
        assert.equal(await page.locator('[data-nav="out"]').isDisabled(),true);
    });
    await check('Mobile pinch zoom and finger pan work with real browser touch events',async()=>{
        const touchContext=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true});
        const touch=await touchContext.newPage();touch.on('pageerror',e=>errors.push(e.message));
        await touch.goto(url,{waitUntil:'networkidle'});await touch.waitForFunction(()=>document.querySelector('.ag-chart')?.dataset.zoom);
        await openSettingsSection(touch,'view');
        for(const id of ['ag-show-filters','ag-show-table','ag-show-details'])await touch.locator('#'+id).uncheck();
        await touch.keyboard.press('Escape');await touch.locator('.ag-chart').scrollIntoViewIfNeeded();
        const b=await touch.locator('.ag-chart').boundingBox();const x=b.x+b.width*.52,y=b.y+b.height*.47;
        const cdp=await touchContext.newCDPSession(touch);
        const send=(type,points)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:2,radiusY:2,force:1}))});
        await send('touchStart',[[1,x-20,y],[2,x+20,y]]);
        for(let i=1;i<=8;i++)await send('touchMove',[[1,x-20-i*3,y],[2,x+20+i*3,y]]);
        await send('touchEnd',[]);
        await until(async()=>Number(await touch.locator('.ag-chart').getAttribute('data-zoom'))>1.5);
        const before=Number(await touch.locator('.ag-chart').getAttribute('data-view-x-min'));
        await send('touchStart',[[3,x,y]]);for(let i=1;i<=8;i++)await send('touchMove',[[3,x+i*3,y+i]]);await send('touchEnd',[]);
        await until(async()=>Math.abs(Number(await touch.locator('.ag-chart').getAttribute('data-view-x-min'))-before)>.001);
        assert.equal(await touch.locator('.ag-chart').evaluate(e=>/NaN|Infinity/.test(e.outerHTML)),false);
        assert.ok(await touch.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await touch.screenshot({path:path.join(artifacts,'zoom-mobile-v6.png'),fullPage:true});await touchContext.close();
    });
    assert.deepEqual(errors,[]);await writeFile(path.join(artifacts,'navigation-results-v6.json'),JSON.stringify({passed,errors},null,2));
}catch(e){await page.screenshot({path:path.join(artifacts,'navigation-failure-v6.png'),fullPage:true}).catch(()=>{});throw e;}
finally{await browser.close();}
