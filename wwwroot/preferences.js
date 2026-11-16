const key = 'spt-ammo-graph.v2';
const legacyKey = 'spt-ammo-graph.preferences.v1';
const options = `; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
const read = name => document.cookie.split('; ').find(c => c.startsWith(name + '='))?.slice(name.length + 1);
function validSimulator(value) {
    const id = v => typeof v === 'string' && v.length > 0 && v.length <= 128;
    const block = v => v && id(v.templateId) && Number.isInteger(v.count) && Math.abs(v.count) <= 1000;
    return value == null || (id(value.caliberId) && (value.armorId == null || id(value.armorId))
        && Number.isInteger(value.seed) && value.seed >= -2147483648 && value.seed <= 2147483647
        && Number.isInteger(value.zone) && value.zone >= 0 && value.zone <= 3
        && (value.pelletHitPercent == null || (typeof value.pelletHitPercent === 'number' && Number.isFinite(value.pelletHitPercent) && value.pelletHitPercent >= 0 && value.pelletHitPercent <= 100))
        && value.magazine && (value.magazine.start == null || block(value.magazine.start))
        && (value.magazine.end == null || block(value.magazine.end))
        && (value.magazine.capacity == null || (Number.isInteger(value.magazine.capacity) && value.magazine.capacity >= 1 && value.magazine.capacity <= 100))
        && Array.isArray(value.magazine.middle) && value.magazine.middle.length <= 100 && value.magazine.middle.every(block)
        && value.slots && typeof value.slots === 'object' && !Array.isArray(value.slots)
        && Object.keys(value.slots).length <= 64 && Object.entries(value.slots).every(([k,v]) => id(k) && (v == null || id(v))));
}
function valid(value) {
    return value && Array.isArray(value.calibers) && value.calibers.every(c => typeof c === 'string')
        && typeof value.xAxis === 'string' && typeof value.yAxis === 'string'
        && ['dynamicScale', 'showNames', 'showPellets', 'descending'].every(k => typeof value[k] === 'boolean')
        && ['language', 'search', 'caliberSearch', 'sortKey'].every(k => typeof value[k] === 'string')
        && (value.selectedId === null || typeof value.selectedId === 'string')
        && ['columns', 'excludedCalibers', 'excludedAmmo', 'includedDefaultAmmo', 'includedDefaultCalibers', 'tooltipColumns', 'detailColumns', 'xColumns', 'yColumns'].every(k => value[k] == null || (Array.isArray(value[k]) && value[k].every(s => typeof s === 'string')))
        && ['showFilters', 'showTable', 'showDetails'].every(k => value[k] == null || typeof value[k] === 'boolean')
        && (value.theme == null || ['system', 'light', 'dark'].includes(value.theme))
        && (value.simulationMode == null || typeof value.simulationMode === 'boolean')
        && validSimulator(value.simulator)
        && (value.caliberNames == null || (typeof value.caliberNames === 'object' && !Array.isArray(value.caliberNames) && Object.entries(value.caliberNames).every(([k,v]) => k.length>0 && k.length<=128 && (v===null || (typeof v==='string' && v.length<=128)))));
}
function encode(value) { return btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value)))); }
function decode(value) { return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(value), c => c.charCodeAt(0)))); }
export function load() {
    try {
        let encoded = read(key);
        if (encoded?.startsWith('chunks:')) {
            const count = Number(encoded.slice(7));
            if (!Number.isInteger(count) || count < 1 || count > 8) return null;
            encoded = Array.from({ length: count }, (_, i) => read(`${key}.${i}`) ?? '').join('');
        }
        if (encoded) { const value = decode(encoded); return valid(value) ? value : null; }
        // One-time migration; future reads and writes use cookies exclusively.
        const old = JSON.parse(localStorage.getItem(legacyKey));
        if (!old || !Array.isArray(old.calibers) || !old.calibers.every(c => typeof c === 'string') || typeof old.xAxis !== 'string' || typeof old.yAxis !== 'string') return null;
        return { language: '', calibers: old.calibers, xAxis: old.xAxis, yAxis: old.yAxis, dynamicScale: !!old.dynamicScale,
            showNames: !!old.showNames, showPellets: !old.wholeLoad, search: '', caliberSearch: '', sortKey: 'Name', descending: false,
            selectedId: null, legacyWholeLoad: !!old.wholeLoad };
    } catch { return null; }
}
export function save(value) {
    try {
        const encoded = encode(value);
        const chunks = encoded.match(/.{1,3500}/g) || [];
        if (chunks.length > 8) return false;
        for (let i = 0; i < 8; i++) document.cookie = `${key}.${i}=; Path=/; Max-Age=0; SameSite=Lax`;
        if (chunks.length === 1) document.cookie = `${key}=${encoded}${options}`;
        else {
            chunks.forEach((chunk, i) => { document.cookie = `${key}.${i}=${chunk}${options}`; });
            document.cookie = `${key}=chunks:${chunks.length}${options}`;
        }
        const saved = read(key) === (chunks.length === 1 ? encoded : `chunks:${chunks.length}`);
        if (saved) localStorage.removeItem(legacyKey);
        return saved;
    } catch { return false; }
}

let menuCleanup;
export function bindMenus() {
    unbindMenus();
    const root = document.querySelector('.ag-app');
    if (!root) return;
    function closeOutside(event) {
        for (const menu of root.querySelectorAll('details.ag-icon-menu[open], .ag-armor-filters details[open], details.ag-ammo-picker[open]')) {
            if (!menu.contains(event.target)) menu.open = false;
        }
    }
    function escape(event) {
        if (event.key !== 'Escape') return;
        for (const menu of root.querySelectorAll('details.ag-icon-menu[open], .ag-armor-filters details[open], details.ag-ammo-picker[open]')) {
            menu.open = false;
            menu.querySelector('summary')?.focus();
        }
    }
    function positionMenu(event) {
        const menus = event?.type === 'toggle' ? [event.target] : root.querySelectorAll('details.ag-icon-menu[open], .ag-armor-filters details[open], details.ag-ammo-picker[open]');
        for (const menu of menus) {
            if (!menu.matches('details.ag-icon-menu') || !menu.open) continue;
            menu.classList.remove('ag-menu-above');
            const panel = menu.querySelector('.ag-menu-panel');
            const anchor = menu.querySelector('summary').getBoundingClientRect();
            if (innerWidth > 600 && panel.getBoundingClientRect().bottom > innerHeight - 12 && anchor.top > innerHeight - anchor.bottom) menu.classList.add('ag-menu-above');
        }
    }
    function chooseAmmo(event) { if (event.target.closest?.('[data-ammo-choice]')) { const picker = event.target.closest('details.ag-ammo-picker'); if (picker) picker.open = false; } }
    function ammoKeys(event) {
        const picker = event.target.closest?.('details.ag-ammo-picker');
        if (!picker || !['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
        const choices = [...picker.querySelectorAll('[data-ammo-choice]')];
        if (!choices.length) return;
        event.preventDefault();
        const wasOpen = picker.open;
        picker.open = true;
        const current = choices.indexOf(document.activeElement);
        let index = current;
        if (!wasOpen || current < 0) index = Math.max(0, choices.findIndex(e => e.getAttribute('aria-selected') === 'true'));
        else if (event.key === 'ArrowDown') index = Math.min(choices.length - 1, current + 1);
        else if (event.key === 'ArrowUp') index = Math.max(0, current - 1);
        if (event.key === 'Home') index = 0;
        if (event.key === 'End') index = choices.length - 1;
        choices[index].focus(); choices[index].scrollIntoView({block:'nearest'});
    }
    document.addEventListener('keydown', ammoKeys);
    document.addEventListener('click', chooseAmmo);
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', escape);
    root.addEventListener('toggle', positionMenu, true);
    window.addEventListener('resize', positionMenu);
    menuCleanup = () => { document.removeEventListener('keydown', ammoKeys); document.removeEventListener('click', chooseAmmo); document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', escape); root.removeEventListener('toggle', positionMenu, true); window.removeEventListener('resize', positionMenu); };
}
export function unbindMenus() { menuCleanup?.(); menuCleanup = undefined; }
export { syncChart, destroyChart } from './navigation.js?v=22';
export { bindPresentation, syncPresentation, unbindPresentation, oppositeTheme } from './presentation.js?v=23.3';
export { syncFans, destroyFans } from './spiderfy.js?v=22.1';

