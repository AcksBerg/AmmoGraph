import {chromium} from 'playwright';
import {openSettingsSection} from './settings-helper.mjs';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1100}}),page=await context.newPage(),errors=[],passed=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const url='https://localhost:6969/AmmoGraph',base=['Damage','PenetrationPower','InitialSpeed'];
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await page.waitForTimeout(100);}throw Error('UI timeout');}
async function check(name,fn){await fn();passed.push(name);console.log('PASS',name);}
const ready=()=>page.locator('.ag-app[data-ready="true"]').waitFor();
async function picker(scope){await page.evaluate(()=>scrollTo(0,0));await openSettingsSection(page,'attributes');const p=page.locator(`[data-attributes="${scope}"]`);if(!(await p.evaluate(e=>e.open)))await p.locator('summary').click();return p;}
const keys=p=>p.locator('[data-side="selected"] [data-attribute]').evaluateAll(es=>es.map(e=>e.dataset.attribute));
async function drag(source,target,atTop=false){await source.scrollIntoViewIfNeeded();const a=await source.locator('span').first().boundingBox(),b=await target.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+Math.min(b.width/3,50),atTop?b.y+2:b.y+b.height-12,{steps:15});await page.mouse.up();}
const settings=()=>page.evaluate(async()=>(await import('/ammo-graph/preferences.js?v=13')).load());
try{
    await page.goto(url,{waitUntil:'networkidle'});await ready();
    await check('Dual lists show available left, selected right, with four transfer controls',async()=>{
        const p=await picker('tooltip');assert.deepEqual(await keys(p),base);assert.equal(await p.locator('[data-transfer]').count(),4);
        const l=await p.locator('[data-side="available"]').boundingBox(),r=await p.locator('[data-side="selected"]').boundingBox();assert.ok(l.x<r.x);
        for(const id of ['Icon','Name','Caliber'])assert.equal(await p.locator(`[data-attribute="${id}"]`).count(),0);
        await page.screenshot({path:'AmmoGraph/artifacts/attribute-transfer-desktop-v16.png'});
    });
    await check('Single transfer buttons move the focused property in both directions',async()=>{
        const p=await picker('tooltip');await p.locator('[data-attribute="ArmorDamage"]').click();await p.locator('[data-transfer="add"]').click();await until(async()=>(await keys(p)).includes('ArmorDamage'));
        await p.locator('[data-side="selected"] [data-attribute="ArmorDamage"]').click();await p.locator('[data-transfer="remove"]').click();await until(async()=>!(await keys(p)).includes('ArmorDamage'));
    });
    await check('Transfer-all buttons support a fully empty or full property list',async()=>{
        const p=await picker('tooltip');await p.locator('[data-transfer="remove-all"]').click();await until(async()=>(await keys(p)).length===0);
        await p.locator('[data-transfer="add-all"]').click();await until(async()=>await p.locator('[data-side="available"] [data-attribute]').count()===0);
        await p.locator('.ag-reset-attributes').click();await until(async()=>JSON.stringify(await keys(p))===JSON.stringify(base));
    });
    await check('Mouse drag transfers properties and reorders the selected list',async()=>{
        const p=await picker('tooltip');await drag(p.locator('[data-attribute="ArmorDamage"]'),p.locator('[data-side="selected"]'));
        await until(async()=>(await keys(p)).includes('ArmorDamage'));
        await drag(p.locator('[data-attribute="InitialSpeed"]'),p.locator('[data-attribute="Damage"]'),true);
        await until(async()=>(await keys(p))[0]==='InitialSpeed');
        await drag(p.locator('[data-attribute="ArmorDamage"]'),p.locator('[data-side="available"]'));
        await until(async()=>!(await keys(p)).includes('ArmorDamage'));
        await p.locator('[data-attribute="Damage"] [data-move="up"]').click();await until(async()=>(await keys(p))[0]==='Damage');
    });
    await check('One axis list controls both dropdowns and handles empty selection safely',async()=>{
        const p=await picker('axes');assert.equal(await page.locator('[data-attributes="x"],[data-attributes="y"]').count(),0);
        await p.locator('[data-attribute="ArmorDamage"]').click();await p.locator('[data-transfer="add"]').click();await p.locator('[data-attribute="ArmorDamage"] [data-move="up"]').click();
        await until(async()=>JSON.stringify(await page.locator('#ag-x option').evaluateAll(es=>es.map(e=>e.value)))===JSON.stringify(await keys(p)));
        assert.deepEqual(await page.locator('#ag-y option').evaluateAll(es=>es.map(e=>e.value)),await keys(p));
        await p.locator('[data-transfer="remove-all"]').click();await until(async()=>await page.locator('#ag-x').isDisabled());
        await page.keyboard.press('Escape');assert.ok((await page.locator('.ag-chart-empty').innerText()).includes('Achsenattribut'));
        await page.reload({waitUntil:'networkidle'});await ready();assert.equal(await page.locator('#ag-y').isDisabled(),true);
        const q=await picker('axes');await q.locator('.ag-reset-attributes').click();await until(async()=>!await page.locator('#ag-x').isDisabled());
    });
    await check('Empty tooltip metrics and configured order survive a reload',async()=>{
        const p=await picker('tooltip');await p.locator('[data-transfer="remove-all"]').click();await until(async()=>(await settings()).tooltipColumns.length===0);
        await page.reload({waitUntil:'networkidle'});await ready();assert.deepEqual((await settings()).tooltipColumns,[]);
        const q=await picker('tooltip');await q.locator('.ag-reset-attributes').click();await q.locator('[data-attribute="PenetrationPower"] [data-move="up"]').click();await until(async()=>(await settings()).tooltipColumns[0]==='PenetrationPower');
        await page.reload({waitUntil:'networkidle'});await ready();assert.equal((await settings()).tooltipColumns[0],'PenetrationPower');
    });
    await check('Old independent axis settings merge without losing configured attributes',async()=>{
        await page.evaluate(async()=>{const m=await import('/ammo-graph/preferences.js?v=13'),s=m.load();s.xColumns=['Damage','AmmoRec'];s.yColumns=['InitialSpeed','PenetrationPower'];s.xAxis='AmmoRec';s.yAxis='InitialSpeed';m.save(s);});
        await page.reload({waitUntil:'networkidle'});await ready();assert.deepEqual((await settings()).xColumns,['Damage','AmmoRec','InitialSpeed','PenetrationPower']);assert.deepEqual((await settings()).xColumns,(await settings()).yColumns);
        assert.equal(await page.locator('#ag-x').inputValue(),'AmmoRec');assert.equal(await page.locator('#ag-y').inputValue(),'InitialSpeed');
    });
    await check('Mobile lists fit and support keyboard transfer and long-press touch drag',async()=>{
        await page.setViewportSize({width:390,height:844});const p=await picker('details');
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.locator('[data-attribute="ArmorDamage"]').focus();await page.keyboard.press('Enter');await until(async()=>(await keys(p)).includes('ArmorDamage'));
        await p.locator('[data-attribute="ArmorDamage"]').focus();await page.keyboard.press('Enter');await until(async()=>!(await keys(p)).includes('ArmorDamage'));
        await page.screenshot({path:'AmmoGraph/artifacts/attribute-transfer-mobile-v16.png'});
        const cdp=await context.newCDPSession(page);await p.locator('[data-attribute="ArmorDamage"]').scrollIntoViewIfNeeded();
        const a=await p.locator('[data-attribute="ArmorDamage"]>span').first().boundingBox(),b=await p.locator('[data-side="selected"]').boundingBox();
        const x=a.x+a.width/2,y=a.y+a.height/2;await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});await page.waitForTimeout(320);
        for(let i=1;i<=12;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:x+(b.x+b.width/2-x)*i/12,y:y+(b.y+b.height-15-y)*i/12}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await until(async()=>(await keys(p)).includes('ArmorDamage'));
    });
    assert.deepEqual(errors,[]);await writeFile('AmmoGraph/artifacts/attribute-transfer-results-v16.json',JSON.stringify({passed,errors},null,2));
}catch(e){await page.screenshot({path:'AmmoGraph/artifacts/attribute-transfer-failure-v16.png',fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();}
