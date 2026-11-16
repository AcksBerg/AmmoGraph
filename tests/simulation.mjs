import { chromium } from 'playwright';
import {openSettingsSection} from './settings-helper.mjs';
import {setAttribute} from './transfer-helper.mjs';
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const simulationText = JSON.parse(await readFile(path.join(root, 'Resources/simulation.json'), 'utf8'));
await mkdir(path.join(root, 'artifacts'), { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1100 }, colorScheme: 'dark', ignoreHTTPSErrors: true });
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
async function ready() { await page.locator('.ag-app[data-ready="true"]').waitFor({ timeout: 60000 }); }
async function run() {
    await page.waitForTimeout(450);
    await page.waitForFunction(() => {
        const root = document.querySelector('[data-simulator]');
        return document.querySelector('.ag-sim-error') || (document.querySelector('.ag-sim-results') && !document.querySelector('.ag-sim-stale') && root?.dataset.running === 'false');
    });
    assert.equal(await page.locator('.ag-sim-error').count(), 0);
    await page.locator('.ag-sim-results').waitFor({ timeout: 30000 });
}
const preview = () => page.locator('.ag-magazine-preview li span').allTextContents();
async function checkLegend() {
    const entries = await page.locator('.ag-sim-legend button').evaluateAll(buttons => buttons.map(button => ({
        pressed: button.getAttribute('aria-pressed') === 'true',
        active: button.classList.contains('is-active'),
        struck: getComputedStyle(button.lastElementChild).textDecorationLine.includes('line-through'),
        color: getComputedStyle(button).color,
        opacity: getComputedStyle(button).opacity
    })));
    assert.ok(entries.some(e => e.pressed) && entries.some(e => !e.pressed));
    for (const entry of entries) {
        assert.equal(entry.active, entry.pressed);
        assert.equal(entry.struck, !entry.pressed, 'Hidden series use the AmmoGraph strikethrough');
        assert.equal(entry.opacity, '1', 'Labels remain readable when hidden');
    }
    assert.notEqual(entries.find(e => e.pressed).color, entries.find(e => !e.pressed).color);
}
try {
    await page.goto(process.env.AMMOGRAPH_URL || 'https://127.0.0.1:6969/AmmoGraph');
    await ready();
    await page.locator('#ag-language').selectOption('en');
    await page.locator('#ag-x').selectOption('PenetrationPower');
    await page.locator('#ag-y').selectOption('Damage');
    await page.locator('tbody .ag-ammo-name').first().click();
    const selected = await page.locator('[data-detail="Name"]').textContent();
    const originalCalibers = await page.locator('.ag-calibers input:checked').evaluateAll(nodes => nodes.map(n => n.closest('[data-caliber]').dataset.caliber));
    const attributes = await openSettingsSection(page, 'attributes');
    const tooltipPicker = attributes.locator('[data-attributes="tooltip"]');
    if (!(await tooltipPicker.evaluate(e => e.open))) await tooltipPicker.locator('summary').click();
    await setAttribute(tooltipPicker, 'ArmorDamage', true);
    await page.keyboard.press('Escape');
    await page.locator('[data-view-toggle]').click();
    await page.locator('[data-simulator]').waitFor();
    assert.equal(await page.locator('.ag-axis-controls,.ag-details').count(), 0);
    assert.equal(await page.locator('.ag-calibers input:checked').count(), 1);
    assert.ok(await page.locator('.ag-table-panel').isVisible());
    await page.locator('.ag-caliber[data-caliber="Caliber545x39"] input').check();
    const rows = page.locator('tbody tr[data-ammo]');
    await rows.nth(0).locator('.ag-sim-table-actions button').nth(1).click();
    await rows.nth(1).locator('.ag-sim-table-actions button').nth(1).click();
    await page.locator('[data-middle-index="1"] input[type=number]').fill('2');
    await page.locator('[data-middle-index="1"] input[type=number]').press('Tab');
    await rows.nth(2).locator('.ag-sim-table-actions button').nth(0).click();
    await rows.nth(3).locator('.ag-sim-table-actions button').nth(2).click();
    assert.equal((await page.locator('[data-middle-index="0"] .ag-magazine-inline>span').textContent()).trim(), '1.');
    assert.equal((await page.locator('[data-middle-index="1"] .ag-magazine-inline>span').textContent()).trim(), '2.');
    assert.equal(await page.locator('[data-add-middle]').textContent(), '+ Add ammunition');
    const inlineAlignment = await page.locator('[data-middle-index="0"]').evaluate(row => {
        const boxes = [...row.querySelectorAll('.ag-magazine-inline>span,.ag-ammo-picker,input[type=number],.ag-order-controls')].map(e => e.getBoundingClientRect());
        return Math.max(...boxes.map(b => (b.top+b.bottom)/2))-Math.min(...boxes.map(b => (b.top+b.bottom)/2));
    });
    assert.ok(inlineAlignment < 3, 'Number, ammunition, count and controls share one line');
    const endBlock = page.locator('.ag-magazine-editor > .ag-magazine-block').last();
    await endBlock.locator('input[type=number]').fill('6');
    await endBlock.locator('input[type=number]').press('Tab');
    await page.waitForFunction(() => {
        const names = [...document.querySelectorAll('.ag-magazine-preview li span')].map(n => n.textContent);
        return names.length === 30 && names.slice(24).every(n => n === names[29]);
    });
    assert.equal(await page.locator('.ag-magazine-preview').getAttribute('open'), null);
    const order = await preview();
    assert.equal(order.length, 30);
    assert.ok(order.slice(24).every(name => name === order[29]));
    assert.equal(order[1], order[4]);
    assert.equal(order[2], order[3]);
    assert.equal(order[23], order[2]);
    await page.locator('[data-armor]').selectOption('5e4ac41886f77406a511c9a8');
    assert.equal(await page.locator('[data-slot="soft_armor_front"] :is(select,input)').count(), 0);
    assert.equal(await page.locator('[data-slot="front_plate"] select').inputValue(), '656fae5f7c2d57afe200c0d7');
    assert.equal(await page.locator('.ag-sim-actions input,.ag-sim-run').count(), 0);
    const classFilter = page.locator('.ag-armor-filters details').first();
    const materialFilter = page.locator('.ag-armor-filters details').nth(1);
    const carrierCount = await page.locator('[data-armor] option').count();
    await classFilter.locator('summary').click();
    await classFilter.locator('[data-filter-all]').click();
    await classFilter.getByRole('checkbox', { name: 'Class 5', exact: true }).check();
    await materialFilter.locator('summary').click();
    assert.equal(await classFilter.getAttribute('open'), null);
    await materialFilter.locator('[data-filter-all]').click();
    await materialFilter.getByRole('checkbox', { name: 'Ceramic', exact: true }).check();
    await page.waitForTimeout(150);
    const plateOptions = await page.locator('[data-slot="front_plate"] option').evaluateAll(options => options.filter(o => o.value).map(o => ({ value: o.value, text: o.textContent })));
    assert.ok(plateOptions.every(o => o.text.includes('Class ') && o.text.includes('/')));
    assert.ok(plateOptions.every(o => o.value === '656fae5f7c2d57afe200c0d7' || (o.text.includes('Class 5') && o.text.includes('Ceramic'))));
    assert.equal(await page.locator('[data-armor] option').count(), carrierCount);
    await page.locator('.ag-sim-heading').click();
    assert.equal(await materialFilter.getAttribute('open'), null);
    await classFilter.locator('summary').click();
    await classFilter.locator('[data-filter-all]').click();
    await materialFilter.locator('summary').click();
    await materialFilter.locator('[data-filter-all]').click();
    await page.locator('.ag-sim-heading').click();
    await run();
    assert.equal(await page.locator('.ag-sim-cumulative').count(), 0);
    await checkLegend();
    assert.equal(await page.locator('[data-slot="front_plate"] select').inputValue(), '656fae5f7c2d57afe200c0d7', 'Filtering preserves the displayed plate selection');
    await page.locator('.ag-sim-legend button').filter({hasText:'Cumulative damage'}).click();
    await page.locator('.ag-sim-cumulative').waitFor();
    const totalBeforeLanguageChange = await page.locator('.ag-sim-cumulative').getAttribute('data-total');
    const completedBeforeLanguageChange = await page.locator('[data-simulator]').getAttribute('data-completed');
    const languages = await page.locator('#ag-language option').evaluateAll(options => options.map(o => o.value));
    for (const language of languages) {
        const code = ({'es-mx':'es-es', 'pt-br':'pt-pt'})[language] || language;
        assert.ok(simulationText[code], 'Simulator translation for ' + language);
        await page.locator('#ag-language').selectOption(language);
        await page.waitForFunction(({ title, cumulative }) => document.querySelector('.ag-sim-heading h1')?.textContent === title
            && document.querySelector('.ag-sim-legend')?.textContent.includes(cumulative), {title: simulationText[code].SimTitle, cumulative: simulationText[code].SimCumulative});
        assert.ok((await page.locator('.ag-sim-legend').textContent()).includes(simulationText[code].SimCumulative));
        assert.equal(await page.locator('[data-zone] option[value="Back"]').textContent(), simulationText[code].SimZoneBack);
        assert.equal(await page.locator('[data-add-middle]').textContent(), '+ ' + simulationText[code].SimAddGroup);
        assert.equal(await page.locator('.ag-app').getAttribute('dir'), code === 'ar' ? 'rtl' : 'ltr');
        assert.equal(await page.locator('[data-armor]').inputValue(), '5e4ac41886f77406a511c9a8');
        assert.equal(await page.locator('[data-slot="front_plate"] select').inputValue(), '656fae5f7c2d57afe200c0d7');
        assert.equal(await page.locator('.ag-sim-cumulative').getAttribute('data-total'), totalBeforeLanguageChange);
        assert.equal(await page.locator('[data-simulator]').getAttribute('data-completed'), completedBeforeLanguageChange, 'Language changes preserve calculated results');
    }
    await page.locator('#ag-language').selectOption('de');
    await page.waitForFunction(() => document.querySelector('.ag-sim-heading h1')?.textContent === 'Ballistiksimulator');
    assert.ok((await page.locator('[data-slot="front_plate"] select').textContent()).includes('Keramik'));
    assert.notEqual((await page.locator('[data-slot="front_plate"] label > span').textContent()).trim(), 'front_plate');
    await page.locator('#ag-language').selectOption('en');
    await page.waitForFunction(() => document.querySelector('.ag-sim-heading h1')?.textContent === 'Ballistics simulator');
    const ammoPicker = page.locator('[data-middle-index="0"] .ag-ammo-picker');
    await ammoPicker.locator('summary').hover();
    await page.locator('.ag-tooltip[data-open="true"] [data-tooltip-column="ArmorDamage"]').waitFor();
    await ammoPicker.locator('summary').click();
    await ammoPicker.locator('[data-ammo-choice]').first().hover();
    await page.locator('.ag-tooltip[data-open="true"] [data-tooltip-column="ArmorDamage"]').waitFor();
    await page.locator('.ag-magazine-editor').screenshot({ path: path.join(root, 'artifacts/ammunition-dropdown.png') });
    await page.locator('.ag-sim-heading').click();
    await page.locator('.ag-magazine-preview summary').click();
    await page.locator('.ag-magazine-preview li').nth(2).hover();
    await page.locator('.ag-tooltip[data-open="true"] [data-tooltip-column="ArmorDamage"]').waitFor();
    await page.locator('.ag-sim-heading').click();
    assert.ok((await page.locator('[data-total-damage]').textContent()).includes('Example total damage:'));
    assert.ok(await page.locator('.ag-sim-layer-table tbody tr').count() >= 2);
    await page.locator('.ag-sim-legend button').filter({hasText:'Penetration rate'}).click();
    await page.waitForFunction(() => !document.querySelector('.ag-sim-chance') && !document.querySelector('.ag-sim-shot circle'));
    await checkLegend();
    await page.locator('.ag-sim-legend button').filter({hasText:'Penetration rate'}).click();
    await page.locator('.ag-sim-chance').waitFor();
    await page.locator('[data-shot="30"]').click();
    await page.waitForFunction(() => document.querySelector('.ag-sim-shot-details h3')?.textContent.includes('30'));
    assert.ok((await page.locator('.ag-sim-shot-details h3').textContent()).includes('30'));
    assert.ok(Number(await page.locator('.ag-sim-cumulative').getAttribute('data-total')) > 0);
    assert.ok((await page.locator('[data-selected-total]').textContent()).includes('HP'));
    const alignment = await page.locator('.ag-sim-table-actions').first().evaluate(cell => { const a=cell.getBoundingClientRect(), b=cell.querySelector('button').getBoundingClientRect(); return Math.abs((a.top+a.bottom)/2-(b.top+b.bottom)/2); });
    assert.ok(alignment <= 3, 'Ammunition action buttons must be vertically centered');
    await page.locator('[data-simulator]').screenshot({ path: path.join(root, 'artifacts/simulation-desktop.png') });
    await page.locator('.ag-sim-results').screenshot({ path: path.join(root, 'artifacts/simulation-results.png') });
    await page.emulateMedia({ colorScheme: 'light' });
    await page.locator('.ag-sim-legend button').filter({hasText:'Cumulative damage'}).click();
    await page.waitForFunction(() => !document.querySelector('.ag-sim-cumulative'));
    await checkLegend();
    await page.locator('.ag-sim-results').screenshot({ path: path.join(root, 'artifacts/simulation-light.png') });
    await page.locator('.ag-sim-legend button').filter({hasText:'Cumulative damage'}).click();
    await page.emulateMedia({ colorScheme: 'dark' });

    // Search affects the table, not the already configured magazine.
    await page.locator('.ag-table-heading input.ag-input').fill('no-such-cartridge-zzzz');
    await page.waitForFunction(() => document.querySelectorAll('tbody tr[data-ammo]').length === 0);
    assert.equal(await rows.count(), 0);
    assert.deepEqual(await preview(), order);
    assert.equal(await page.locator('.ag-sim-stale').count(), 0);
    await page.locator('.ag-table-heading input.ag-input').fill('');
    await page.locator('[data-zone]').selectOption('Left');
    await page.locator('.ag-sim-stale').waitFor();
    assert.equal(await page.locator('.ag-sim-stale').count(), 1);
    await run();
    await page.locator('[data-zone]').selectOption('Front');
    await page.locator('[data-slot="front_plate"] select').selectOption('');
    await run();
    assert.equal(await page.locator('.ag-sim-layer-table tbody tr').count(), 1);

    // Whole-cartridge buckshot uses source projectile damage exactly once.
    await page.locator('.ag-caliber[data-caliber="Caliber12g"] input').check();
    await page.locator('[data-simulator][data-caliber="Caliber12g"]').waitFor();
    assert.equal(await page.locator('.ag-caliber[data-caliber="Caliber12g:pellet"]').count(), 0);
    assert.equal(await page.locator('.ag-caliber[data-caliber="Caliber12g:shot"]').count(), 0);
    const shotgunRow = rows.filter({ hasText: /buckshot/i }).first();
    const slugRow = rows.filter({ hasText: /slug/i }).first();
    await shotgunRow.locator('.ag-sim-table-actions button').nth(1).click();
    await slugRow.locator('.ag-sim-table-actions button').nth(1).click();
    const wholeLoadDamage = Number(await shotgunRow.locator('[data-column="Damage"]').getAttribute('data-value'));
    await run();
    const damage = await page.locator('.ag-sim-stats dd').nth(1).textContent();
    assert.ok(Math.abs(Number(damage.replace(/[^0-9.]/g, '')) - wholeLoadDamage) < .01);

    await page.locator('.ag-caliber[data-caliber="Caliber545x39"] input').check();
    await page.locator('[data-simulator][data-caliber="Caliber545x39"]').waitFor();
    assert.deepEqual(await preview(), order);
    const hiddenId = await rows.first().getAttribute('data-ammo');
    await openSettingsSection(page, 'exclusions');
    await page.locator(`[data-exclude-ammo="${hiddenId}"]`).check();
    await page.keyboard.press('Escape');
    await page.locator('.ag-sim-error').waitFor();
    await page.locator('#ag-language').selectOption('fr');
    await page.waitForFunction(error => document.querySelector('.ag-sim-error')?.textContent === error, simulationText.fr.SimExcludedAmmo);
    await page.locator('#ag-language').selectOption('en');
    await page.waitForFunction(error => document.querySelector('.ag-sim-error')?.textContent === error, simulationText.en.SimExcludedAmmo);
    assert.equal(await page.locator(`[data-ammo-choice][data-id="${hiddenId}"]`).count(), 0);
    assert.equal(await page.locator('.ag-sim-results').count(), 0);
    await openSettingsSection(page, 'exclusions');
    await page.locator(`[data-exclude-ammo="${hiddenId}"]`).uncheck();
    await page.keyboard.press('Escape');
    await run();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('[data-simulator]').screenshot({ path: path.join(root, 'artifacts/simulation-mobile.png') });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'Mobile layout must not overflow the page');
    await page.setViewportSize({ width: 320, height: 844 });
    const narrow = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth,
        elements: [...document.querySelectorAll('.ag-header,.ag-header-actions,.ag-brand,.ag-app,.ag-main,[data-simulator],.ag-sim-configuration,.ag-sim-actions,.ag-sim-results')].map(e => ({ class: e.className, width: e.getBoundingClientRect().width, right: e.getBoundingClientRect().right })) }));
    assert.ok(narrow.scroll <= narrow.width + 1, 'Narrow mobile layout overflow: ' + JSON.stringify(narrow));
    await page.setViewportSize({ width: 1600, height: 1100 });

    await page.waitForTimeout(300);
    await page.reload(); await ready();
    await page.locator('[data-simulator]').waitFor();
    assert.deepEqual(await preview(), order);
    assert.equal(await page.locator('[data-zone]').inputValue(), 'Front');
    assert.equal(await page.locator('[data-slot="front_plate"] select').inputValue(), '');
    await run(); // A restored valid draft automatically recalculates.
    await page.locator('[data-view-toggle]').click();
    assert.equal(await page.locator('#ag-x').inputValue(), 'PenetrationPower');
    assert.equal(await page.locator('#ag-y').inputValue(), 'Damage');
    assert.equal(await page.locator('[data-detail="Name"]').textContent(), selected);
    assert.deepEqual(await page.locator('.ag-calibers input:checked').evaluateAll(nodes => nodes.map(n => n.closest('[data-caliber]').dataset.caliber)), originalCalibers);
    assert.deepEqual(errors, []);
    console.log('PASS simulator editor, armor, statistics, legend, all available languages, live error translation, shot details, search, side, empty plate, buckshot, mobile, persistence and graph restoration');
} catch (error) {
    try {
        await writeFile(path.join(root, 'artifacts/simulation-failure.html'), await page.content());
        await page.screenshot({ path: path.join(root, 'artifacts/simulation-failure.png'), fullPage: true });
    } catch { /* Preserve the original navigation/test failure. */ }
    if (errors.length) console.error(errors);
    throw error;
} finally { await browser.close(); }
