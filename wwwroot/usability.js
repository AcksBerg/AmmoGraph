let cleanup;
export function bindUsability() {
    unbindUsability();
    const root = document.querySelector('.ag-app');
    if (!root) return;
    let drag;
    function categories() {
        for (const button of root.querySelectorAll('.ag-settings-categories [data-open-settings]')) {
            const section = root.querySelector(`[data-settings-section="${button.dataset.openSettings}"]`);
            button.setAttribute('aria-pressed', String(!!section?.open));
        }
    }
    function open(event) {
        const button = event.target.closest?.('[data-open-settings]');
        if (!button) return;
        const menu = root.querySelector('.ag-exclusions');
        const section = root.querySelector(`[data-settings-section="${button.dataset.openSettings}"]`);
        if (!menu || !section) return;
        menu.open = true;
        section.open = true;
        section.querySelector('summary').focus();
        categories();
    }
    function setHeight(panel, value, commit) {
        const slider = panel.querySelector('[data-table-height]');
        const height = Math.max(160, Math.min(760, Math.round(value / 20) * 20));
        slider.value = String(height);
        panel.style.setProperty('--ag-table-height', `${height}px`);
        panel.querySelector('output').textContent = `${height} px`;
        panel.querySelector('[data-table-resize]').setAttribute('aria-valuenow', String(height));
        if (commit) slider.dispatchEvent(new Event('input', { bubbles: true }));
    }
    function down(event) {
        const handle = event.target.closest?.('[data-table-resize]');
        if (!handle || (event.pointerType === 'mouse' && event.button !== 0)) return;
        const panel = handle.closest('.ag-table-panel');
        drag = { handle, panel, id: event.pointerId, y: event.clientY, height: Number(panel.querySelector('[data-table-height]').value) };
        handle.setPointerCapture(event.pointerId);
        handle.focus();
        event.preventDefault();
    }
    function move(event) {
        if (!drag || event.pointerId !== drag.id) return;
        setHeight(drag.panel, drag.height + event.clientY - drag.y, false);
    }
    function up(event) {
        if (!drag || event.pointerId !== drag.id) return;
        const { handle, panel, height } = drag;
        setHeight(panel, event.type === 'pointercancel' ? height : Number(panel.querySelector('[data-table-height]').value), true);
        if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
        drag = undefined;
    }
    function key(event) {
        const handle = event.target.closest?.('[data-table-resize]');
        if (!handle || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
        const panel = handle.closest('.ag-table-panel');
        const value = Number(panel.querySelector('[data-table-height]').value);
        setHeight(panel, event.key === 'Home' ? 160 : event.key === 'End' ? 760 : value + (event.key === 'ArrowDown' ? 20 : -20), true);
        event.preventDefault();
    }
    root.addEventListener('click', open);
    root.addEventListener('toggle', categories, true);
    root.addEventListener('pointerdown', down);
    root.addEventListener('keydown', key);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    categories();
    cleanup = () => {
        root.removeEventListener('click', open);
        root.removeEventListener('toggle', categories, true);
        root.removeEventListener('pointerdown', down);
        root.removeEventListener('keydown', key);
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        window.removeEventListener('pointercancel', up);
    };
}
export function unbindUsability() { cleanup?.(); cleanup = undefined; }
