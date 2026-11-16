import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {openSettingsSection} from './settings-helper.mjs';
import {setAttribute} from './transfer-helper.mjs';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1100}}),page=await context.newPage(),passed=[],errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const url='https://localhost:6969/AmmoGraph';
async function until(fn){for(let i=0;i<120;i++){if(await fn())return;await page.waitForTimeout(100);}throw Error('UI timeout');}
async function check(name,fn){await fn();passed.push(name);console.log('PASS',name);}
const active=()=>page.locator('.ag-fan.is-expanded');
async function openGroup(key){await page.mouse.move(10,10);await page.locator('.ag-chart').focus();const p=page.locator(`.ag-point[data-id="${key}"]`);await p.focus();await until(async()=>await active().count()===1);return p;}
async function screen(x,y){return page.locator('.ag-chart').evaluate((e,p)=>{const q=new DOMPoint(p.x,p.y).matrixTransform(e.getScreenCTM());return{x:q.x,y:q.y};},{x,y});}
let group;
try{
    await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('.ag-app')?.dataset.ready==='true'&&document.querySelector('.ag-chart')?.dataset.zoom);
    await page.locator('[data-legend-all]').click();await until(async()=>await page.locator('.ag-point[data-id*=","]').count()>0&&await page.locator('.ag-comparison-table tbody tr').count()>100);await page.locator('.ag-chart').scrollIntoViewIfNeeded();
    group=await page.locator('.ag-point[data-id*=","]').evaluateAll(es=>{
        const visible=es.filter(e=>{const c=e.querySelector('.ag-hit-area'),r=c.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;return y>0&&y<innerHeight&&document.elementFromPoint(x,y)?.closest('.ag-point')===e;});
        return (visible.sort((a,b)=>b.dataset.id.split(',').length-a.dataset.id.split(',').length)[0]||es[0]).dataset.id;
    });
    await check('Mouse hover unfolds grouped ammunition into distinct symbols with dashed links',async()=>{
        const origin=page.locator(`.ag-point[data-id="${group}"]`);await origin.locator('.ag-hit-area').hover({force:true});await until(async()=>await active().count()===1);
        group=await active().getAttribute('data-group');const ids=group.split(',');assert.equal(await active().locator('.ag-fan-point').count(),ids.length);
        const positions=await active().locator('.ag-fan-point').evaluateAll(es=>es.map(e=>e.getAttribute('transform')));assert.equal(new Set(positions).size,ids.length);
        const lines=await active().locator('.ag-fan-line').evaluateAll(es=>es.map(e=>({x1:Number(e.getAttribute('x1')),y1:Number(e.getAttribute('y1')),dash:getComputedStyle(e).strokeDasharray})));
        const x=Number(await active().getAttribute('data-origin-x')),y=Number(await active().getAttribute('data-origin-y'));
        assert.equal(lines.length,ids.length);assert.ok(lines.every(l=>Math.abs(l.x1-x)<.001&&Math.abs(l.y1-y)<.001&&l.dash.includes('5')));
        assert.equal(await active().evaluate(e=>e.closest('[clip-path]')),null);
        await page.screenshot({path:'AmmoGraph/artifacts/spiderfy-desktop-v22.png'});
    });
    await check('Moving to a fanned icon keeps the group open and shows only that ammunition in the tooltip',async()=>{
        const item=active().locator('.ag-fan-point').last(),id=await item.getAttribute('data-id');await item.locator('.ag-hit-area').hover();
        await until(async()=>await page.locator('.ag-tooltip').getAttribute('data-open')==='true'&&await page.locator('[data-tooltip-ammo]').count()===1);
        assert.equal(await page.locator('[data-tooltip-ammo]').getAttribute('data-tooltip-ammo'),id);
        assert.equal(await active().count(),1);await page.screenshot({path:'AmmoGraph/artifacts/spiderfy-tooltip-v22.png'});
    });
    await check('Show all names also controls every fanned member and persists after reload',async()=>{
        assert.equal(await active().locator('.ag-fan-name').count(),0);
        await page.locator('.ag-chart-options input').nth(1).check();await openGroup(group);
        await until(async()=>await active().locator('.ag-fan-name').count()===group.split(',').length);
        for(const id of group.split(',')){
            const name=await page.locator(`.ag-comparison-table tr[data-ammo="${id}"] .ag-ammo-name`).innerText();
            assert.equal(await active().locator(`.ag-fan-point[data-id="${id}"] .ag-fan-name`).textContent(),name.length>28?name.slice(0,26)+'…':name);
        }
        await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('.ag-chart')?.dataset.zoom);await openGroup(group);
        assert.equal(await active().locator('.ag-fan-name').count(),group.split(',').length);
        await page.screenshot({path:'AmmoGraph/artifacts/spiderfy-names-v22.1.png'});
        await page.locator('.ag-chart-options input').nth(1).uncheck();await openGroup(group);await until(async()=>await active().locator('.ag-fan-name').count()===0);
    });
    await check('Every fanned item selects its own ammunition without cycling the group',async()=>{
        const ids=group.split(',');for(const id of ids){const item=active().locator(`.ag-fan-point[data-id="${id}"]`);await item.locator('.ag-hit-area').click();await until(async()=>await page.locator('.ag-comparison-table tr.is-selected').getAttribute('data-ammo')===id);assert.equal(await item.getAttribute('class').then(s=>s.includes('is-selected')),true);}
        const baseline=await page.locator('.ag-comparison-table tr.is-selected').getAttribute('data-ammo'),candidate=ids.find(id=>id!==baseline);
        await active().locator(`.ag-fan-point[data-id="${candidate}"] .ag-hit-area`).hover();await until(async()=>await page.locator('.ag-comparison-heading:not(.ag-comparison-placeholder)').count()===1);
    });
    await check('Leaving the fan collapses it; keyboard can expand, select, and close it',async()=>{
        await page.mouse.move(10,10);await page.locator('.ag-chart').focus();await until(async()=>await active().count()===0);
        await openGroup(group);await page.keyboard.press('Enter');assert.equal(await page.evaluate(()=>document.activeElement?.classList.contains('ag-fan-point')),true);
        const id=await page.evaluate(()=>document.activeElement.dataset.id);await page.keyboard.press('Enter');await until(async()=>await page.locator('.ag-comparison-table tr.is-selected').getAttribute('data-ammo')===id);
        await page.keyboard.press('Escape');assert.equal(await active().count(),0);assert.equal(await page.locator('.ag-tooltip').getAttribute('data-open'),null);
    });
    await check('Zoom and pan close the fan and connectors follow the actual transformed data position',async()=>{
        await openGroup(group);const center=await screen(500,256);await page.mouse.move(center.x,center.y);await page.mouse.wheel(0,-400);await until(async()=>Number(await page.locator('.ag-chart').getAttribute('data-zoom'))>1);assert.equal(await active().count(),0);
        await page.locator('[data-nav="reset"]').click();await openGroup(group);
        const a=await screen(510,260),b=await screen(590,290);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:10});await page.mouse.up();assert.equal(await active().count(),0);
        const origin=await openGroup(group),expected=await origin.evaluate(e=>{const svg=e.closest('svg');return new DOMPoint(Number(e.dataset.baseX),Number(e.dataset.baseY)).matrixTransform(e.getScreenCTM()).matrixTransform(svg.getScreenCTM().inverse()).toJSON();});
        assert.ok(Math.abs(Number(await active().getAttribute('data-origin-x'))-expected.x)<.001);assert.ok(Math.abs(Number(await active().getAttribute('data-origin-y'))-expected.y)<.001);await page.keyboard.press('Escape');await page.locator('[data-nav="reset"]').click();
    });
    await check('Large groups use multiple rings while all symbols stay within the SVG',async()=>{
        await page.evaluate(()=>scrollTo(0,0));await openSettingsSection(page,'attributes');const p=page.locator('[data-attributes="axes"]');if(!(await p.evaluate(e=>e.open)))await p.locator('summary').click();await setAttribute(p,'ProjectileCount',true);await page.keyboard.press('Escape');
        await page.locator('#ag-x').selectOption('ProjectileCount');await page.locator('#ag-y').selectOption('ProjectileCount');await until(async()=>await page.locator('.ag-point').count()<20);
        const key=await page.locator('.ag-point[data-id*=","]').evaluateAll(es=>es.sort((a,b)=>b.dataset.id.split(',').length-a.dataset.id.split(',').length)[0].dataset.id);
        await openGroup(key);assert.equal(await active().locator('.ag-fan-point').count(),key.split(',').length);assert.ok(key.split(',').length>10);
        const coords=await active().locator('.ag-fan-point').evaluateAll(es=>es.map(e=>{const m=e.transform.baseVal.consolidate().matrix;return{x:m.e,y:m.f};}));assert.ok(coords.every(p=>p.x>=5&&p.x<=955&&p.y>=5&&p.y<=545));
        await page.screenshot({path:'AmmoGraph/artifacts/spiderfy-rings-v22.png'});await page.keyboard.press('Escape');
        await openSettingsSection(page,'attributes');await p.locator('.ag-reset-attributes').click();await page.keyboard.press('Escape');await page.locator('#ag-x').selectOption('Damage');await page.locator('#ag-y').selectOption('PenetrationPower');
    });
    await check('Touch can unfold a group and select one of its fanned members',async()=>{
        const c=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:390,height:844},isMobile:true,hasTouch:true}),p=await c.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(url,{waitUntil:'networkidle'});await p.waitForFunction(()=>document.querySelector('.ag-chart')?.dataset.zoom);
        await p.locator('[data-legend-all]').click();await p.locator('.ag-chart').scrollIntoViewIfNeeded();const node=p.locator('.ag-point[data-id*=","]').first();await node.locator('.ag-hit-area').tap({force:true});
        await p.waitForFunction(()=>document.querySelector('.ag-fan.is-expanded'));
        const item=p.locator('.ag-fan.is-expanded .ag-fan-point').first(),id=await item.getAttribute('data-id');await item.locator('.ag-hit-area').tap();await p.waitForFunction(id=>document.querySelector('.ag-comparison-table tr.is-selected')?.dataset.ammo===id,id);
        await p.waitForFunction(()=>document.querySelector('.ag-tooltip')?.dataset.open==='true');
        const fanBox=await p.locator('.ag-fan.is-expanded').boundingBox(),tipBox=await p.locator('.ag-tooltip').boundingBox();
        assert.ok(tipBox.y+tipBox.height<=fanBox.y||tipBox.y>=fanBox.y+fanBox.height||tipBox.x+tipBox.width<=fanBox.x||tipBox.x>=fanBox.x+fanBox.width);
        assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await p.screenshot({path:'AmmoGraph/artifacts/spiderfy-mobile-v22.png'});await c.close();
    });
    assert.deepEqual(errors,[]);await writeFile('AmmoGraph/artifacts/spiderfy-results-v22.json',JSON.stringify({passed,errors},null,2));
}catch(e){console.log({errors,group,state:await page.evaluate(()=>({expanded:[...document.querySelectorAll('.ag-point[data-expanded]')].map(e=>e.dataset.id),fans:[...document.querySelectorAll('.ag-fan.is-expanded')].map(e=>e.dataset.group),focused:document.activeElement?.getAttribute('data-id')}))});await page.screenshot({path:'AmmoGraph/artifacts/spiderfy-failure-v22.png',fullPage:true}).catch(()=>{});throw e;}finally{await browser.close();}
