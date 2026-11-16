import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1100}}),page=await context.newPage(),errors=[],passed=[];
page.on('pageerror',e=>errors.push(e.message));
async function sizes(){
    const icons=await page.locator('.ag-symbol').evaluateAll(es=>es.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));
    assert.ok(icons.length>20);for(const i of icons){assert.ok(Math.abs(i.w-16)<.1&&Math.abs(i.h-16)<.1,JSON.stringify(i));}
    const menus=await page.locator('.ag-header-actions svg,.ag-column-picker>summary svg').evaluateAll(es=>es.map(e=>({w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})));
    assert.ok(menus.length>=3);for(const i of menus)assert.ok(i.w<=20.1&&i.h<=20.1);
}
try{
    await page.route('**/ammo-graph/graph.css*',r=>r.abort());
    await page.goto('https://localhost:6969/AmmoGraph',{waitUntil:'networkidle'});await page.locator('.ag-app[data-ready="true"]').waitFor();await sizes();
    passed.push('Caliber and menu icons retain their small dimensions even with the graph stylesheet blocked');
    await page.unroute('**/ammo-graph/graph.css*');await page.reload({waitUntil:'networkidle'});await page.locator('.ag-app[data-ready="true"]').waitFor();await sizes();
    passed.push('Normal page loading keeps the same icon dimensions');
    await page.setViewportSize({width:320,height:844});await sizes();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    passed.push('Mobile icons retain their dimensions without horizontal overflow');
    assert.deepEqual(errors,[]);await writeFile('AmmoGraph/artifacts/icon-loading-results-v14.1.json',JSON.stringify({passed,errors},null,2));for(const name of passed)console.log('PASS',name);
}finally{await browser.close();}
