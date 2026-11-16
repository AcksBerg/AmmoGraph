const bindings = new WeakMap();
export function bind(root, dotnet) {
    unbind(root);
    let drag, ghost, target, before, timer, frame;
    function clear() {
        clearTimeout(timer); cancelAnimationFrame(frame); ghost?.remove(); ghost = undefined;
        root.querySelectorAll('.ag-drop-before,.ag-drop-target').forEach(e => e.classList.remove('ag-drop-before','ag-drop-target'));
        if (drag) drag.row.classList.remove('ag-drag-source');
        drag = target = before = undefined;
    }
    function activate() {
        if (!drag || ghost) return;
        ghost = document.createElement('div'); ghost.className = 'ag-drag-ghost'; ghost.textContent = drag.row.querySelector('span').textContent;
        const app = root.closest('.ag-app'); app.append(ghost); drag.row.classList.add('ag-drag-source');
        ghost.style.left=`${drag.x+12}px`;ghost.style.top=`${drag.y+12}px`;
        drag.row.setPointerCapture(drag.id);
    }
    function down(e) {
        if (e.button !== 0 || e.target.closest('button')) return;
        const row = e.target.closest('.ag-transfer-item'); if (!row || !root.contains(row)) return;
        drag = {row,id:e.pointerId,x:e.clientX,y:e.clientY,touch:e.pointerType==='touch'};
        if (drag.touch) timer = setTimeout(activate, 250);
    }
    function locate(x,y) {
        root.querySelectorAll('.ag-drop-before,.ag-drop-target').forEach(e=>e.classList.remove('ag-drop-before','ag-drop-target'));
        const hit = document.elementFromPoint(x,y), list = hit?.closest('.ag-transfer-list');
        target = list && root.contains(list) ? list : undefined; before = undefined;
        if (!target) return;
        target.classList.add('ag-drop-target');
        const row = hit.closest('.ag-transfer-item');
        if (row) {
            const r=row.getBoundingClientRect();
            before = y < r.top+r.height/2 ? row : row.nextElementSibling;
            before?.classList.add('ag-drop-before');
        }
        const r=target.getBoundingClientRect();
        if(y<r.top+25)target.scrollTop-=12; else if(y>r.bottom-25)target.scrollTop+=12;
    }
    function move(e) {
        if (!drag || e.pointerId!==drag.id) return;
        const distance=Math.hypot(e.clientX-drag.x,e.clientY-drag.y);
        if(!ghost && distance>6){if(drag.touch){clear();return;}activate();}
        if(!ghost)return;
        e.preventDefault(); ghost.style.left=`${e.clientX+12}px`;ghost.style.top=`${e.clientY+12}px`;locate(e.clientX,e.clientY);
    }
    function up(e) {
        if(!drag || e.pointerId!==drag.id)return;
        const key=drag.row.dataset.attribute, side=target?.dataset.side, next=before?.dataset.attribute;
        const moved=!!ghost; clear();
        if(moved){e.preventDefault();if(side)dotnet.invokeMethodAsync('Drop',key,side,next??null).catch(()=>{});}
    }
    function cancel(){clear();}
    function key(e){if(e.key==='Escape')clear();}
    function touch(e){if(ghost)e.preventDefault();}
    root.addEventListener('pointerdown',down);root.addEventListener('pointermove',move,{passive:false});
    root.addEventListener('pointerup',up);root.addEventListener('pointercancel',cancel);root.addEventListener('touchmove',touch,{passive:false});
    root.addEventListener('keydown',key);
    bindings.set(root,()=>{clear();root.removeEventListener('keydown',key);root.removeEventListener('pointerdown',down);root.removeEventListener('pointermove',move);root.removeEventListener('pointerup',up);root.removeEventListener('pointercancel',cancel);root.removeEventListener('touchmove',touch);});
}
export function unbind(root){bindings.get(root)?.();bindings.delete(root);}
