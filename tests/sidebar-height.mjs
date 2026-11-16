import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
const context=await browser.newContext({ignoreHTTPSErrors:true,viewport:{width:1600,height:1200}}),page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
const ready=()=>page.waitForFunction(()=>document.querySelector('.ag-app')?.dataset.ready==='true'&&document.querySelector('.ag-chart')?.dataset.zoom);
const geometry=()=>page.evaluate(()=>({scroll:scrollY,height:innerHeight,document:document.documentElement.scrollHeight,elements:[...document.querySelectorAll('.ag-app,.ag-workspace,.ag-main,.ag-sidebar,.ag-analysis,.ag-chart-panel')].map(e=>({c:e.className,top:e.getBoundingClientRect().top,height:e.getBoundingClientRect().height,scroll:e.scrollHeight,min:getComputedStyle(e).minHeight}))}));
async function fit(){await page.waitForFunction(()=>Math.abs(document.querySelector('.ag-sidebar').getBoundingClientRect().height+document.querySelector('.ag-header').getBoundingClientRect().height-innerHeight)<1&&document.documentElement.scrollHeight<=innerHeight+1,{},{timeout:5000});}
try{
    await page.goto('https://localhost:6969/AmmoGraph',{waitUntil:'networkidle'});await ready();
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(200);
    assert.ok((await geometry()).scroll>0);
    await page.evaluate(()=>document.querySelector('#ag-show-table').click());await fit();
    console.log('PASS Hiding the table after scrolling reserves header height and removes the artificial page scrollbar');
    await page.reload({waitUntil:'networkidle'});await ready();await fit();
    console.log('PASS Hidden-table preference restores without sidebar overflow');
    await page.setViewportSize({width:1600,height:1400});await fit();
    await page.evaluate(()=>document.querySelector('#ag-show-table').click());await page.waitForTimeout(200);
    await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));await page.waitForTimeout(200);
    await page.evaluate(()=>document.querySelector('#ag-show-table').click());await fit();
    console.log('PASS Resize and repeated table toggles do not retain an oversized sticky sidebar');
    assert.deepEqual(errors,[]);
}catch(e){console.log(await geometry());throw e;}finally{await browser.close();}
