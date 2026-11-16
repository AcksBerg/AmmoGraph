// Client-side camera: data stays on the server; gestures never issue per-frame Blazor calls.
const plot = { left: 84, right: 916, top: 42, bottom: 470, width: 832, height: 428 };
const ns = 'http://www.w3.org/2000/svg';
let controller;
const width = v => v.maxX - v.minX;
const height = v => v.maxY - v.minY;
const copy = v => ({ ...v });
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function ticks(min, max) {
    const raw = (max - min) / 5;
    const magnitude = 10 ** Math.floor(Math.log10(raw));
    const fraction = raw / magnitude;
    const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * magnitude;
    const first = Math.ceil(min / step) * step;
    const result = [];
    for (let i = 0; i < 10 && first + i * step <= max + step * 1e-9; i++) result.push(Math.abs(first + i * step) < step * 1e-9 ? 0 : first + i * step);
    if (!result.length || result[0] - min > step * .55) result.unshift(min);
    if (max - result.at(-1) > step * .55) result.push(max);
    return result;
}
function element(name, attrs, text) {
    const node = document.createElementNS(ns, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    if (text !== undefined) node.textContent = text;
    return node;
}
function create(svg, previous) {
    const panel = svg.closest('.ag-chart-panel');
    const pointers = new Map();
    let base, view = previous?.view, signature = previous?.signature, points = [];
    let gesture, interacting = false, suppressUntil = 0, frame = 0;
    let number, smallNumber;
    function local(event) { return new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse()); }
    function inside(p) { return p.x >= plot.left && p.x <= plot.right && p.y >= plot.top && p.y <= plot.bottom; }
    function constrain(next) {
        const w = Math.min(width(next), width(base));
        const h = Math.min(height(next), height(base));
        // Allow overscroll by at most 20% of the current visible span on each edge.
        const minX = clamp(next.minX, base.minX - w * .2, base.maxX + w * .2 - w);
        const minY = clamp(next.minY, base.minY - h * .2, base.maxY + h * .2 - h);
        return { minX, maxX: minX + w, minY, maxY: minY + h };
    }
    function format(value) { return (value !== 0 && Math.abs(value) < .001 ? smallNumber : number).format(value); }
    function draw() {
        const k = width(base) / width(view);
        const minimumZoom = Math.abs(k - 1) < 1e-8;
        const home = minimumZoom && Math.abs(view.minX - base.minX) < width(base) * 1e-8 && Math.abs(view.minY - base.minY) < height(base) * 1e-8;
        svg.dataset.zoom = String(k);
        svg.dataset.viewXMin = String(view.minX); svg.dataset.viewXMax = String(view.maxX);
        svg.dataset.viewYMin = String(view.minY); svg.dataset.viewYMax = String(view.maxY);
        svg.querySelector('.ag-static-axes').style.display = home ? '' : 'none';
        const axes = svg.querySelector('.ag-navigation-axes');
        const children = [];
        if (!home) {
            for (const value of ticks(view.minX, view.maxX)) {
                const x = plot.left + (value - view.minX) / width(view) * plot.width;
                const grid = element('g', { class: 'ag-grid' }); grid.append(element('line', { x1: x, y1: plot.top, x2: x, y2: plot.bottom }));
                const label = element('g', { class: 'ag-tick' }); label.append(element('text', { x, y: 496, 'text-anchor': 'middle' }, format(value)));
                children.push(grid, label);
            }
            for (const value of ticks(view.minY, view.maxY)) {
                const y = plot.bottom - (value - view.minY) / height(view) * plot.height;
                const grid = element('g', { class: 'ag-grid' }); grid.append(element('line', { x1: plot.left, y1: y, x2: plot.right, y2: y }));
                const label = element('g', { class: 'ag-tick' }); label.append(element('text', { x: 70, y: y + 4, 'text-anchor': 'end' }, format(value)));
                children.push(grid, label);
            }
        }
        axes.replaceChildren(...children);
        for (const point of points) {
            const x = plot.left + (point.x - view.minX) / width(view) * plot.width;
            const y = plot.bottom - (point.y - view.minY) / height(view) * plot.height;
            point.node.setAttribute('transform', `translate(${x - point.baseX} ${y - point.baseY})`);
            point.node.style.visibility = inside({ x, y }) ? '' : 'hidden';
        }
        const occupied = [];
        const labels = [...svg.querySelectorAll('.ag-point .ag-point-name')].sort((a, b) => Number(!!b.closest('.is-selected')) - Number(!!a.closest('.is-selected')));
        for (const label of labels) {
            label.style.display = '';
            const point = label.closest('.ag-point');
            if (point.style.visibility === 'hidden' || point.hasAttribute('data-expanded')) continue;
            const box = label.getBoundingClientRect();
            const overlap = occupied.some(b => box.left < b.right + 4 && box.right + 4 > b.left && box.top < b.bottom + 3 && box.bottom + 3 > b.top);
            if (overlap && !point.classList.contains('is-selected')) label.style.display = 'none';
            else occupied.push(box);
        }
        panel.querySelector('[data-nav="out"]').disabled = minimumZoom;
        panel.querySelector('[data-nav="reset"]').disabled = home;
        panel.querySelector('[data-nav="in"]').disabled = k >= 100 - 1e-8 || points.length === 0;
    }
    function redraw() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); }); }
    function zoom(start, factor, anchor, target = anchor) {
        svg.dispatchEvent(new Event('ag-navigation-start'));
        const k = clamp(width(base) / width(start) * factor, 1, 100);
        const w = width(base) / k, h = height(base) / k;
        const worldX = start.minX + (anchor.x - plot.left) / plot.width * width(start);
        const worldY = start.maxY - (anchor.y - plot.top) / plot.height * height(start);
        const minX = worldX - (target.x - plot.left) / plot.width * w;
        const maxY = worldY + (target.y - plot.top) / plot.height * h;
        view = constrain({ minX, maxX: minX + w, minY: maxY - h, maxY });
        redraw();
    }
    function wheel(event) {
        const p = local(event); if (!inside(p)) return;
        event.preventDefault();
        const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 500 : 1);
        zoom(view, Math.exp(clamp(-delta * .0015, -.8, .8)), p);
    }
    function pair() {
        const [a, b] = [...pointers.values()];
        return { center: { x: (a.p.x + b.p.x) / 2, y: (a.p.y + b.p.y) / 2 }, distance: Math.max(1, Math.hypot(a.p.x - b.p.x, a.p.y - b.p.y)) };
    }
    function begin() {
        if (pointers.size >= 2) gesture = { view: copy(view), ...pair() };
        else { const a = [...pointers.values()][0]; gesture = { view: copy(view), p: a.p, client: a.client }; }
    }
    function activate() {
        svg.dispatchEvent(new Event('ag-navigation-start'));
        interacting = true; svg.classList.add('ag-interacting');
        for (const id of pointers.keys()) { try { svg.setPointerCapture(id); } catch { /* Pointer may have ended. */ } }
    }
    function down(event) {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        const p = local(event); if (!inside(p)) return;
        pointers.set(event.pointerId, { p, client: { x: event.clientX, y: event.clientY } });
        begin(); if (pointers.size >= 2) { activate(); event.preventDefault(); }
    }
    function move(event) {
        if (!pointers.has(event.pointerId)) return;
        const current = { p: local(event), client: { x: event.clientX, y: event.clientY } };
        pointers.set(event.pointerId, current);
        if (pointers.size >= 2) {
            const now = pair(); zoom(gesture.view, now.distance / gesture.distance, gesture.center, now.center);
        } else {
            if (!interacting && Math.hypot(current.client.x - gesture.client.x, current.client.y - gesture.client.y) > 4) activate();
            if (!interacting) return;
            const dx = (current.p.x - gesture.p.x) / plot.width * width(gesture.view);
            const dy = (current.p.y - gesture.p.y) / plot.height * height(gesture.view);
            view = constrain({ minX: gesture.view.minX - dx, maxX: gesture.view.maxX - dx, minY: gesture.view.minY + dy, maxY: gesture.view.maxY + dy }); redraw();
        }
        event.preventDefault();
    }
    function up(event) {
        if (!pointers.has(event.pointerId)) return;
        if (interacting) suppressUntil = performance.now() + 300;
        pointers.delete(event.pointerId);
        try { if (svg.hasPointerCapture(event.pointerId)) svg.releasePointerCapture(event.pointerId); } catch { }
        if (pointers.size) begin();
        else { interacting = false; gesture = null; svg.classList.remove('ag-interacting'); }
    }
    function suppressClick(event) { if (performance.now() < suppressUntil) { event.preventDefault(); event.stopImmediatePropagation(); } }
    function action(event) {
        const button = event.target.closest('[data-nav]'); if (!button || !panel.contains(button)) return;
        if (button.dataset.nav === 'reset') { svg.dispatchEvent(new Event('ag-navigation-start')); view = copy(base); redraw(); }
        else zoom(view, button.dataset.nav === 'in' ? 1.5 : 1 / 1.5, { x: 500, y: 256 });
    }
    function key(event) {
        if (event.key === 'Home' || event.key.startsWith('Arrow')) svg.dispatchEvent(new Event('ag-navigation-start'));
        if (event.key === '+' || event.key === '=') zoom(view, 1.5, { x: 500, y: 256 });
        else if (event.key === '-') zoom(view, 1 / 1.5, { x: 500, y: 256 });
        else if (event.key === 'Home') { view = copy(base); redraw(); }
        else if (event.key.startsWith('Arrow')) {
            const dx = (event.key === 'ArrowLeft' ? -.1 : event.key === 'ArrowRight' ? .1 : 0) * width(view);
            const dy = (event.key === 'ArrowDown' ? -.1 : event.key === 'ArrowUp' ? .1 : 0) * height(view);
            view = constrain({ minX: view.minX + dx, maxX: view.maxX + dx, minY: view.minY + dy, maxY: view.maxY + dy }); redraw();
        } else return;
        event.preventDefault();
    }
    window.addEventListener('resize', redraw);
    svg.addEventListener('wheel', wheel, { passive: false }); svg.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    svg.addEventListener('click', suppressClick, true); svg.addEventListener('keydown', key); panel.addEventListener('click', action);
    return {
        svg,
        sync() {
            points = [...svg.querySelectorAll('.ag-point')].map(node => ({ node, x: Number(node.dataset.x), y: Number(node.dataset.y), baseX: Number(node.dataset.baseX), baseY: Number(node.dataset.baseY) }));
            const nextSignature = [svg.dataset.xKey, svg.dataset.yKey, svg.dataset.language, svg.dataset.xMin, svg.dataset.xMax, svg.dataset.yMin, svg.dataset.yMax, ...points.map(p => `${p.node.dataset.id}:${p.x}:${p.y}`)].join('|');
            base = { minX: Number(svg.dataset.xMin), maxX: Number(svg.dataset.xMax), minY: Number(svg.dataset.yMin), maxY: Number(svg.dataset.yMax) };
            if (nextSignature !== signature || !view) { svg.dispatchEvent(new Event('ag-navigation-start')); view = copy(base); pointers.clear(); interacting = false; svg.classList.remove('ag-interacting'); }
            signature = nextSignature;
            const locale = svg.dataset.language || 'en';
            number = new Intl.NumberFormat(locale, { maximumFractionDigits: 3, useGrouping: false });
            smallNumber = new Intl.NumberFormat(locale, { notation: 'scientific', maximumSignificantDigits: 3, useGrouping: false });
            draw();
        },
        state: () => ({ view, signature }),
        destroy() {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', redraw);
            svg.removeEventListener('wheel', wheel); svg.removeEventListener('pointerdown', down);
            window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
            svg.removeEventListener('click', suppressClick, true); svg.removeEventListener('keydown', key); panel.removeEventListener('click', action);
        }
    };
}

export function syncChart() {
    const svg = document.querySelector('.ag-chart');
    if (!svg) { destroyChart(); return; }
    if (controller?.svg !== svg) { const previous = controller?.state(); controller?.destroy(); controller = create(svg, previous); }
    controller.sync();
}
export function destroyChart() { controller?.destroy(); controller = undefined; }
