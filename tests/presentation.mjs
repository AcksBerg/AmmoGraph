import {chromium} from 'playwright';
import {openSettingsSection} from './settings-helper.mjs';
import {setAttribute} from './transfer-helper.mjs';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const artifacts=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../artifacts');await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1000}}),page=await context.newPage(),errors=[],passed=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const url=process.env.AMMOGRAPH_URL||'https://localhost:6969/AmmoGraph';
const ready=()=>page.waitForFunction(()=>document.querySelector('.ag-app')?.dataset.ready==='true'&&document.querySelector('.ag-chart')?.dataset.zoom);
async function until(fn){for(let i=0;i<120;i++){if(await fn())return;await page.waitForTimeout(100);}throw Error('UI timeout');}
async function check(name,fn){await fn();passed.push(name);console.log('PASS',name);}
const defaults=['Icon','Caliber','Name','Damage','PenetrationPower','InitialSpeed'];
const options=axis=>page.locator(`#ag-${axis} option`).evaluateAll(es=>es.map(e=>e.value));
async function menu(){await page.evaluate(()=>scrollTo(0,0));if(!(await page.locator('.ag-exclusions').evaluate(e=>e.open)))await page.locator('.ag-exclusions>summary').click();}
async function picker(scope){if(scope==='x'||scope==='y')scope='axes';await menu();await openSettingsSection(page,'attributes');const p=page.locator(`[data-attributes="${scope}"]`);if(!(await p.evaluate(e=>e.open)))await p.locator('summary').click();return p;}
const settings=()=>page.evaluate(async()=>(await import('/ammo-graph/preferences.js?v=8')).load());
const tipColumns=async()=>await page.locator('[data-tooltip-ammo]').count() ? page.locator('[data-tooltip-ammo]').first().locator('[data-tooltip-column]').evaluateAll(es=>es.map(e=>e.dataset.tooltipColumn)) : ['Icon','Caliber','Name',...(await settings()).tooltipColumns];
const detailColumns=()=>page.locator('.ag-details [data-detail]').evaluateAll(es=>es.map(e=>e.dataset.detail));
async function sameHeight(){await until(async()=>Math.abs((await page.locator('.ag-chart-panel').boundingBox()).height-(await page.locator('.ag-details').boundingBox()).height)<1);}
async function hoverPoint(){const p=page.locator('.ag-point').first();await p.scrollIntoViewIfNeeded();await page.waitForTimeout(150);await p.focus();await until(async()=>await page.locator('.ag-tooltip').getAttribute('data-open')==='true');return p;}
try{
    await page.goto(url,{waitUntil:'networkidle'});await ready();
    await check('Defaults show six tooltip/detail attributes and three numeric axis choices',async()=>{
        assert.deepEqual(await options('x'),['Damage','PenetrationPower','InitialSpeed']);assert.deepEqual(await options('y'),await options('x'));
        await page.locator('.ag-comparison-table .ag-ammo-name').first().click();await until(async()=>(await detailColumns()).length===6);
        assert.deepEqual(await detailColumns(),defaults);assert.equal(await page.locator('.ag-table-reference').count(),0);await sameHeight();
        await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:path.join(artifacts,'modern-desktop-v10.png')});
    });
    await check('Hover tooltip renders compact vertical cards with exact default fields',async()=>{
        const p=await hoverPoint();const ids=(await p.getAttribute('data-id')).split(',');
        assert.deepEqual(await tipColumns(),defaults);assert.deepEqual(await page.locator('[data-tooltip-ammo]').evaluateAll(es=>es.map(e=>e.dataset.tooltipAmmo)),ids);
        assert.equal(await p.locator('title').count(),0);
        assert.equal(await page.locator('[data-tooltip-value="Icon"] .ag-symbol').count(),ids.length);
        const identity=page.locator('.ag-tooltip-identity').first(),icon=await identity.locator('[data-tooltip-value="Icon"]').boundingBox(),caliber=await identity.locator('[data-tooltip-value="Caliber"]').boundingBox();
        assert.ok(icon.x+icon.width<=caliber.x&&Math.abs(icon.y+icon.height/2-caliber.y-caliber.height/2)<1);
        assert.equal(await page.locator('[data-tooltip-value="Name"]').first().innerText(),await page.locator(`.ag-comparison-table tr[data-ammo="${ids[0]}"] .ag-ammo-name`).innerText());
        const metrics=await page.locator('[data-tooltip-ammo]').first().locator('.ag-tooltip-metric').all();
        let previous=-Infinity;
        for(const metric of metrics){const label=await metric.locator('dt').boundingBox(),value=await metric.locator('dd').boundingBox();assert.ok(label.x+label.width<=value.x&&label.y>previous);previous=label.y;}
        assert.equal(await page.locator('.ag-tooltip table').count(),0);
        assert.ok((await page.locator('.ag-tooltip').boundingBox()).width<=340);
        await page.screenshot({path:path.join(artifacts,'tooltip-v9.png')});await page.keyboard.press('Escape');
    });
    await check('Hover surfaces have generous padding, names have no separate hover, and selected values are centered',async()=>{
        const header=page.locator('.ag-comparison-table th button').first();await header.hover();
        assert.deepEqual(await header.evaluate(e=>[getComputedStyle(e).paddingLeft,getComputedStyle(e).paddingRight]),['8px','8px']);
        for(const selector of ['.ag-legend button','.ag-all-values']){
            assert.ok(await page.locator(selector).first().evaluate(e=>parseFloat(getComputedStyle(e).paddingInlineStart)>=6));
        }
        assert.ok(await page.locator('.ag-chart-panel').evaluate(e=>getComputedStyle(e).backgroundImage.includes('linear-gradient')));
        const row=page.locator('.ag-comparison-table tr.is-selected'),name=row.locator('.ag-ammo-name');await name.hover();
        assert.equal(await name.evaluate(e=>getComputedStyle(e).backgroundColor),'rgba(0, 0, 0, 0)');
        assert.equal(await row.locator('.ag-table-delta').count(),0);
        for(const cell of await row.locator('.ag-numeric').all()){
            const c=await cell.boundingBox(),v=await cell.locator('.ag-table-value').boundingBox();assert.ok(Math.abs(c.y+c.height/2-v.y-v.height/2)<1);
        }
        assert.ok(await page.locator('.ag-comparison-table tr:not(.is-selected) [data-delta]').count()>0);
    });
    await check('Expanded details scroll internally without changing the graph height',async()=>{
        const before=(await page.locator('.ag-chart-panel').boundingBox()).height;
        await page.locator('.ag-all-values').click();await sameHeight();
        assert.ok(Math.abs((await page.locator('.ag-chart-panel').boundingBox()).height-before)<1);
        assert.ok(await page.locator('.ag-details').evaluate(e=>e.scrollHeight>e.clientHeight));
        await page.locator('.ag-details').evaluate(e=>e.scrollTop=e.scrollHeight);assert.ok(await page.locator('.ag-details').evaluate(e=>e.scrollTop>0));
        await page.screenshot({path:path.join(artifacts,'details-scroll-v9.png')});
    });
    await check('Mouse hover opens a tooltip that remains accessible when moving into its card',async()=>{
        await page.locator('.ag-chart').scrollIntoViewIfNeeded();await page.waitForTimeout(150);
        await page.locator('.ag-point .ag-hit-area').last().hover({force:true});
        if((await page.locator('.ag-point').last().getAttribute('data-id')).includes(',')){
            await until(async()=>await page.locator('.ag-fan.is-expanded').count()===1);await page.locator('.ag-fan.is-expanded .ag-fan-point .ag-hit-area').first().hover();
        }
        await until(async()=>await page.locator('.ag-tooltip').getAttribute('data-open')==='true');
        const box=await page.locator('.ag-tooltip').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
        await page.waitForTimeout(250);assert.equal(await page.locator('.ag-tooltip').getAttribute('data-open'),'true');
        await page.keyboard.press('Escape');assert.equal(await page.locator('.ag-tooltip').getAttribute('data-open'),null);
        const overlap=page.locator('.ag-point[data-id*=","]').first();
        if(await overlap.count()){
            await page.locator('.ag-chart').focus();await overlap.focus();await until(async()=>await page.locator('.ag-fan.is-expanded').count()===1);
            await page.locator('.ag-fan.is-expanded .ag-fan-point').first().focus();await until(async()=>await page.locator('.ag-tooltip').getAttribute('data-open')==='true');
            assert.equal(await page.locator('[data-tooltip-ammo]').count(),1);
        }
        await page.mouse.move(1590,990);await page.keyboard.press('Escape');
    });
    await check('Tooltip and detail attributes can be toggled and reordered independently',async()=>{
        let p=await picker('tooltip');assert.equal(await p.locator('[data-attribute="Name"],[data-attribute="Icon"],[data-attribute="Caliber"]').count(),0);
        await p.locator('[data-attribute="PenetrationPower"] [data-move="up"]').click();
        await until(async()=>(await tipColumns())[3]==='PenetrationPower');
        await setAttribute(p,'InitialSpeed',false);await setAttribute(p,'ArmorDamage',true);
        await until(async()=>(await tipColumns()).includes('ArmorDamage'));assert.ok(!(await tipColumns()).includes('InitialSpeed'));
        p=await picker('details');assert.equal(await p.locator('[data-attribute="Name"],[data-attribute="Icon"],[data-attribute="Caliber"]').count(),0);
        await p.locator('[data-attribute="PenetrationPower"] [data-move="up"]').click();
        await until(async()=>(await detailColumns())[3]==='PenetrationPower');
        await setAttribute(p,'InitialSpeed',false);await setAttribute(p,'AmmoRec',true);
        await until(async()=>(await detailColumns()).includes('AmmoRec'));assert.ok(!(await detailColumns()).includes('InitialSpeed'));
        await page.keyboard.press('Escape');await sameHeight();
    });
    await check('Axis options support numeric attributes, ordering, fallback and swapping',async()=>{
        let p=await picker('x');assert.equal(await p.locator('[data-attribute="Name"]').count(),0);
        await setAttribute(p,'RicochetChance',true);
        await until(async()=>(await options('x')).includes('RicochetChance'));
        await p.locator('[data-attribute="RicochetChance"] [data-move="up"]').click();await until(async()=>(await options('x'))[2]==='RicochetChance');
        await setAttribute(p,'Damage',false);await until(async()=>await page.locator('#ag-x').inputValue()==='PenetrationPower');
        p=await picker('y');await setAttribute(p,'AmmoRec',true);await page.keyboard.press('Escape');
        await page.locator('#ag-y').selectOption('AmmoRec');await page.locator('.ag-swap').click();
        await until(async()=>await page.locator('#ag-x').inputValue()==='AmmoRec');assert.ok((await options('x')).includes('AmmoRec'));
    });
    await check('Attribute choices and order persist after reloading; reset restores defaults',async()=>{
        await until(async()=>(await settings()).xAxis==='AmmoRec');const saved=await settings();
        await page.reload({waitUntil:'networkidle'});await ready();
        assert.deepEqual(await tipColumns(),['Icon','Caliber','Name',...saved.tooltipColumns]);assert.deepEqual(await detailColumns(),['Icon','Caliber','Name',...saved.detailColumns]);
        assert.deepEqual(await options('x'),saved.xColumns);assert.deepEqual(await options('y'),saved.yColumns);
        for(const scope of ['tooltip','details','axes']){const p=await picker(scope);await p.locator('.ag-reset-attributes').click();}
        await page.keyboard.press('Escape');await until(async()=>JSON.stringify(await tipColumns())===JSON.stringify(defaults));
        assert.deepEqual(await detailColumns(),defaults);assert.deepEqual(await options('x'),['Damage','PenetrationPower','InitialSpeed']);
    });
    await check('All values stays at the end and disappears when all metrics are configured',async()=>{
        let p=await picker('details');await p.locator('[data-transfer="add-all"]').click();
        await until(async()=>await page.locator('.ag-all-values').count()===0);
        await setAttribute(p,'ArmorDamage',false);await page.keyboard.press('Escape');
        await until(async()=>await page.locator('.ag-all-values').count()===1);
        assert.equal(await page.locator('.ag-all-values').innerText().then(s=>s.includes('Alle Werte')),true);
        assert.ok(await page.locator('.ag-all-values').evaluate(e=>e===e.parentElement.lastElementChild));
        await page.locator('.ag-all-values').click();await sameHeight();assert.ok(await page.locator('.ag-all-values').evaluate(e=>e===e.parentElement.lastElementChild));
        p=await picker('details');await p.locator('.ag-reset-attributes').click();await page.keyboard.press('Escape');
    });
    await check('Sidebar uses available height and stays visible with controls when scrolling to the table',async()=>{
        await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(100);
        let b=await page.locator('.ag-sidebar').boundingBox();assert.ok(Math.abs(b.y+b.height-1000)<2);
        await page.evaluate(()=>scrollTo(0,1100));await page.waitForTimeout(150);
        b=await page.locator('.ag-sidebar').boundingBox();assert.ok(Math.abs(b.y)<1);assert.ok(Math.abs(b.height-1000)<2);
        for(const selector of ['.ag-section-title','.ag-sidebar>.ag-input','.ag-bulk','.ag-calibers']){const r=await page.locator(selector).boundingBox();assert.ok(r.y>=0&&r.y+r.height<=1001);}
        assert.ok(await page.locator('.ag-sidebar>.ag-input').evaluate(e=>{const r=e.getBoundingClientRect();return document.elementsFromPoint(r.x+r.width/2,r.y+r.height/2).includes(e);}));
        const list=await page.locator('.ag-calibers').boundingBox();assert.ok(list.height>700);
        await page.screenshot({path:path.join(artifacts,'sticky-sidebar-v9.png')});
    });
    await check('Mobile controls stay visible, details keep chart height, and tooltip fits the viewport',async()=>{
        await page.setViewportSize({width:390,height:844});await page.evaluate(()=>scrollTo(0,0));await sameHeight();
        await page.evaluate(()=>scrollTo(0,650));await page.waitForTimeout(150);
        const b=await page.locator('.ag-sidebar').boundingBox();assert.ok(Math.abs(b.y)<1&&b.height<=300);
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
        await page.screenshot({path:path.join(artifacts,'presentation-mobile-v10.png')});
        await hoverPoint();const t=await page.locator('.ag-tooltip').boundingBox();assert.ok(t.x>=0&&t.x+t.width<=390&&t.y>=0&&t.y+t.height<=844);
        await page.keyboard.press('Escape');
    });
    await check('Older cookies retain an existing non-default axis choice',async()=>{
        await page.evaluate(async()=>{const p=await import('/ammo-graph/preferences.js?v=8');const s=p.load();delete s.xColumns;delete s.yColumns;delete s.tooltipColumns;delete s.detailColumns;s.xAxis='AmmoRec';p.save(s);});
        await page.reload({waitUntil:'networkidle'});await ready();assert.equal(await page.locator('#ag-x').inputValue(),'AmmoRec');assert.ok((await options('x')).includes('AmmoRec'));
        assert.deepEqual(await tipColumns(),defaults);
    });
    assert.deepEqual(errors,[]);await writeFile(path.join(artifacts,'presentation-results-v10.json'),JSON.stringify({passed,errors},null,2));
}catch(e){console.log(await page.evaluate(()=>({tooltip:document.querySelector('.ag-tooltip')?.outerHTML,active:document.activeElement?.outerHTML,errors:document.querySelector('.blazor-error-boundary')?.innerText})));await page.screenshot({path:path.join(artifacts,'presentation-failure-v9.png'),fullPage:true}).catch(()=>{});throw e;}
finally{await browser.close();}
