let cleanup, refresh;
export function bindPresentation() {
    unbindPresentation();
    const root = document.querySelector('.ag-app');
    if (!root) return;
    let active, x = 0, y = 0, timer, chart, frame;
    const tooltip = () => root.querySelector('.ag-tooltip');
    function hide() { active?.removeAttribute('aria-describedby'); active = undefined; tooltip()?.removeAttribute('data-open'); }
    function place() {
        const tip = tooltip();
        if (!tip || !active?.isConnected || active.dataset.id !== tip.dataset.group) { tip?.removeAttribute('data-open'); return; }
        tip.dataset.open = 'true';
        const box = tip.getBoundingClientRect();
        tip.style.left = `${Math.max(8, Math.min(x + 14, innerWidth - box.width - 8))}px`;
        tip.style.top = `${Math.max(8, Math.min(y + 16, innerHeight - box.height - 8))}px`;
        active.setAttribute('aria-describedby', 'ag-tooltip');
    }
    function update() {
        const toggle = root.querySelector('.ag-theme-toggle');
        if (toggle) toggle.setAttribute('aria-checked', String(getComputedStyle(root).colorScheme === 'dark'));
        const sidebar = root.querySelector('.ag-sidebar');
        if (sidebar) {
            const workspace = root.querySelector('.ag-workspace');
            const top = workspace.getBoundingClientRect().top;
            // A sticky element's position depends on its own height. Measure its
            // container instead, and reserve the header when there is no table.
            const reserved = root.querySelector('.ag-table-panel') ? Math.max(0, top) : Math.max(0, top + window.scrollY);
            sidebar.style.setProperty('--ag-sidebar-height', `${Math.max(180, innerHeight - reserved)}px`);
        }
        const current = root.querySelector('.ag-chart-panel');
        if (current !== chart) { observer.disconnect(); chart = current; if (chart) observer.observe(chart); }
        if (chart) chart.closest('.ag-analysis').style.setProperty('--ag-chart-height', `${chart.getBoundingClientRect().height}px`);
        if (active && !active.isConnected) hide();
        place();
    }
    const observer = new ResizeObserver(update);
    function schedule() { cancelAnimationFrame(frame); frame = requestAnimationFrame(update); }
    function enter(event) {
        const point = event.target.closest?.('.ag-point');
        if (point) {
            clearTimeout(timer);
            if (active !== point) { active?.removeAttribute('aria-describedby'); active = point; }
            const box = point.getBoundingClientRect();
            x = event.clientX ?? box.right; y = event.clientY ?? box.top;
            place();
        } else if (event.target.closest?.('.ag-tooltip')) clearTimeout(timer);
    }
    function leave(event) {
        const target = event.relatedTarget;
        if (active?.contains(target) || tooltip()?.contains(target)) return;
        if (event.target.closest?.('.ag-point,.ag-tooltip')) { clearTimeout(timer); timer = setTimeout(hide, 180); }
    }
    function move(event) {
        if (!event.target.closest?.('.ag-point') || !active) return;
        x = event.clientX; y = event.clientY; place();
    }
    function key(event) { if (event.key === 'Escape') hide(); }
    function scroll(event) { if (!event.target.closest?.('.ag-tooltip')) hide(); schedule(); }
    root.addEventListener('pointerover', enter); root.addEventListener('pointerout', leave);
    root.addEventListener('focusin', enter); root.addEventListener('focusout', leave);
    root.addEventListener('pointermove', move); root.addEventListener('keydown', key);
    window.addEventListener('scroll', scroll, true); window.addEventListener('resize', schedule);
    const media = matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', schedule);
    refresh = update; update();
    cleanup = () => {
        hide(); clearTimeout(timer); cancelAnimationFrame(frame); observer.disconnect();
        root.removeEventListener('pointerover', enter); root.removeEventListener('pointerout', leave);
        root.removeEventListener('focusin', enter); root.removeEventListener('focusout', leave);
        root.removeEventListener('pointermove', move); root.removeEventListener('keydown', key);
        window.removeEventListener('scroll', scroll, true); window.removeEventListener('resize', schedule);
        media.removeEventListener('change', schedule);
    };
}
export function syncPresentation() { refresh?.(); }
export function unbindPresentation() { cleanup?.(); cleanup = refresh = undefined; }
export function oppositeTheme() { return getComputedStyle(document.querySelector('.ag-app')).colorScheme === 'dark' ? 'light' : 'dark'; }
