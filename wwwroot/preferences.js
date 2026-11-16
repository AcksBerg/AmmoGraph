const key = 'spt-ammo-graph.v2';
const legacyKey = 'spt-ammo-graph.preferences.v1';
const options = `; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
const read = name => document.cookie.split('; ').find(c => c.startsWith(name + '='))?.slice(name.length + 1);
function valid(value) {
    return value && Array.isArray(value.calibers) && value.calibers.every(c => typeof c === 'string')
        && typeof value.xAxis === 'string' && typeof value.yAxis === 'string'
        && ['dynamicScale', 'showNames', 'showPellets', 'descending'].every(k => typeof value[k] === 'boolean')
        && ['language', 'search', 'caliberSearch', 'sortKey'].every(k => typeof value[k] === 'string')
        && (value.selectedId === null || typeof value.selectedId === 'string')
        && ['columns', 'excludedCalibers', 'excludedAmmo', 'includedDefaultAmmo', 'includedDefaultCalibers', 'tooltipColumns', 'detailColumns', 'xColumns', 'yColumns'].every(k => value[k] == null || (Array.isArray(value[k]) && value[k].every(s => typeof s === 'string')))
        && ['showFilters', 'showTable', 'showDetails'].every(k => value[k] == null || typeof value[k] === 'boolean')
        && (value.theme == null || ['system', 'light', 'dark'].includes(value.theme))
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
        for (const menu of root.querySelectorAll('details.ag-icon-menu[open]')) {
            if (!menu.contains(event.target)) menu.open = false;
        }
    }
    function escape(event) {
        if (event.key !== 'Escape') return;
        for (const menu of root.querySelectorAll('details.ag-icon-menu[open]')) {
            menu.open = false;
            menu.querySelector('summary')?.focus();
        }
    }
    function positionMenu(event) {
        const menus = event?.type === 'toggle' ? [event.target] : root.querySelectorAll('details.ag-icon-menu[open]');
        for (const menu of menus) {
            if (!menu.matches('details.ag-icon-menu') || !menu.open) continue;
            menu.classList.remove('ag-menu-above');
            const panel = menu.querySelector('.ag-menu-panel');
            const anchor = menu.querySelector('summary').getBoundingClientRect();
            if (innerWidth > 600 && panel.getBoundingClientRect().bottom > innerHeight - 12 && anchor.top > innerHeight - anchor.bottom) menu.classList.add('ag-menu-above');
        }
    }
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', escape);
    root.addEventListener('toggle', positionMenu, true);
    window.addEventListener('resize', positionMenu);
    menuCleanup = () => { document.removeEventListener('pointerdown', closeOutside); document.removeEventListener('keydown', escape); root.removeEventListener('toggle', positionMenu, true); window.removeEventListener('resize', positionMenu); };
}
export function unbindMenus() { menuCleanup?.(); menuCleanup = undefined; }
export { syncChart, destroyChart } from './navigation.js?v=6';
export { bindPresentation, syncPresentation, unbindPresentation, oppositeTheme } from './presentation.js?v=13';

