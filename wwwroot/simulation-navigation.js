// Local simulator viewport. Data, death markers, and selection stay in Blazor; navigation does not issue per-frame calls.
const plot = { left: 80, right: 940, top: 70, bottom: 430, width: 860, height: 360 };
const ns = 'http://www.w3.org/2000/svg';
const controllers = new Map();
const width = v => v.maxX - v.minX;
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
    const panel = svg.closest('.ag-sim-results');
    const pointers = new Map();
    let base, view = previous?.view, signature = previous?.signature, points = [];
    let gesture, interacting = false, suppressUntil = 0, frame = 0;
    let number, smallNumber;
    function local(event) { return new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM().inverse()); }
    function inside(p) { return p.x >= plot.left && p.x <= plot.right && p.y >= plot.top && p.y <= plot.bottom; }
    function constrain(next) {
        const w = clamp(width(next), width(base) / 100, width(base));
        const minX = clamp(next.minX, base.minX, base.maxX - w);
        return { minX, maxX: Math.min(base.maxX, minX + w), minY: base.minY, maxY: base.maxY };
    }
    function format(value) { return (value !== 0 && Math.abs(value) < .001 ? smallNumber : number).format(value); }
    function draw() {
        const k = width(base) / width(view);
        const minimumZoom = Math.abs(k - 1) < 1e-8;
        const home = minimumZoom && Math.abs(view.minX - base.minX) < width(base) * 1e-8;
        svg.dataset.zoom = String(k);
        svg.dataset.viewXMin = String(view.minX); svg.dataset.viewXMax = String(view.maxX);
        svg.dataset.viewYMin = String(view.minY); svg.dataset.viewYMax = String(view.maxY);
        svg.querySelector('.ag-sim-static-x-axes').style.display = home ? '' : 'none';
        const axes = svg.querySelector('.ag-sim-navigation-axes');
        const children = [];
        if (!home) {
            const lastShot = Number(svg.dataset.lastShot);
            const xTicks = new Set(ticks(view.minX, view.maxX).filter(n => Number.isInteger(n) && n >= 1 && n <= lastShot));
            for (const edge of [1, lastShot]) if (edge >= view.minX && edge <= view.maxX) xTicks.add(edge);
            for (const value of [...xTicks].sort((a, b) => a - b)) {
                const x = plot.left + (value - view.minX) / width(view) * plot.width;
                const grid = element('g', { class: 'ag-grid' }); grid.append(element('line', { x1: x, y1: plot.top, x2: x, y2: plot.bottom }));
                const label = element('g', { class: 'ag-tick' }); label.append(element('text', { x, y: 460, 'text-anchor': 'middle' }, format(value)));
                children.push(grid, label);
            }
        }
        axes.replaceChildren(...children);
        const kx = width(base) / width(view);
        svg.querySelector('.ag-sim-plot')?.setAttribute('transform',
            `translate(${plot.left} 0) scale(${kx} 1) translate(${-plot.left - (view.minX - base.minX) / width(base) * plot.width} 0)`);
        // Keep visual highlights at their unzoomed width. The separate hit rectangles
        // still scale with the bars so the whole enlarged bar remains interactive.
        for (const marker of svg.querySelectorAll('.ag-sim-shot-highlight')) {
            const markerWidth = Number(marker.dataset.baseWidth) / kx;
            marker.setAttribute('x', String(Number(marker.dataset.centerX) - markerWidth / 2));
            marker.setAttribute('width', String(markerWidth));
        }
        for (const circle of svg.querySelectorAll('.ag-sim-shot circle')) {
            const x = Number(circle.getAttribute('cx')), y = Number(circle.getAttribute('cy'));
            circle.setAttribute('transform', `translate(${x} ${y}) scale(${1 / kx} 1) translate(${-x} ${-y})`);
        }
        panel.querySelector('[data-sim-nav="out"]').disabled = minimumZoom;
        panel.querySelector('[data-sim-nav="reset"]').disabled = home;
        panel.querySelector('[data-sim-nav="in"]').disabled = k >= 100 - 1e-8 || points.length === 0;
    }
    function redraw() { if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); }); }
    function zoom(start, factor, anchor, target = anchor) {
        svg.dispatchEvent(new Event('ag-navigation-start'));
        const k = clamp(width(base) / width(start) * factor, 1, 100);
        const w = width(base) / k;
        const worldX = start.minX + (anchor.x - plot.left) / plot.width * width(start);
        const minX = worldX - (target.x - plot.left) / plot.width * w;
        view = constrain({ minX, maxX: minX + w });
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
            view = constrain({ minX: gesture.view.minX - dx, maxX: gesture.view.maxX - dx }); redraw();
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
        const button = event.target.closest('[data-sim-nav]'); if (!button || !panel.contains(button)) return;
        if (button.dataset.simNav === 'reset') { svg.dispatchEvent(new Event('ag-navigation-start')); view = copy(base); redraw(); }
        else zoom(view, button.dataset.simNav === 'in' ? 1.5 : 1 / 1.5, { x: 510, y: 250 });
    }
    function key(event) {
        if (event.target !== svg && event.key.startsWith('Arrow')) return;
        if (event.key === 'Home' || event.key.startsWith('Arrow')) svg.dispatchEvent(new Event('ag-navigation-start'));
        if (event.key === '+' || event.key === '=') zoom(view, 1.5, { x: 510, y: 250 });
        else if (event.key === '-') zoom(view, 1 / 1.5, { x: 510, y: 250 });
        else if (event.key === 'Home') { view = copy(base); redraw(); }
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            const dx = (event.key === 'ArrowLeft' ? -.1 : event.key === 'ArrowRight' ? .1 : 0) * width(view);
            view = constrain({ minX: view.minX + dx, maxX: view.maxX + dx }); redraw();
        } else return;
        event.preventDefault();
    }
    svg.addEventListener('wheel', wheel, { passive: false }); svg.addEventListener('pointerdown', down);
    window.addEventListener('pointermove', move, { passive: false }); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    svg.addEventListener('click', suppressClick, true); svg.addEventListener('keydown', key); panel.addEventListener('click', action);
    return {
        svg,
        sync() {
            points = [...svg.querySelectorAll('.ag-sim-shot')];
            const nextSignature = [svg.dataset.revision, svg.dataset.xMin, svg.dataset.xMax, svg.dataset.damageMax, svg.dataset.language].join('|');
            base = { minX: Number(svg.dataset.xMin), maxX: Number(svg.dataset.xMax), minY: 0, maxY: 100 };
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
            svg.removeEventListener('wheel', wheel); svg.removeEventListener('pointerdown', down);
            window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
            svg.removeEventListener('click', suppressClick, true); svg.removeEventListener('keydown', key); panel.removeEventListener('click', action);
        }
    };
}

export function sync(svg) {
    for (const [root, controller] of controllers) {
        if (!root.isConnected) { controller.destroy(); controllers.delete(root); }
    }
    if (!svg?.isConnected) return;
    let controller = controllers.get(svg);
    if (!controller) { controller = create(svg); controllers.set(svg, controller); }
    controller.sync();
}
export function destroy(svg) {
    // Blazor may resolve an element reference to null after removing its DOM node.
    for (const [root, controller] of controllers) {
        if (root === svg || !root.isConnected) { controller.destroy(); controllers.delete(root); }
    }
}
