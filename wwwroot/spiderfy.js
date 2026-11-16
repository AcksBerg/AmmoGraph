let controller;
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

function create(svg) {
    let active, timer, ignoreFocus=false;
    const root=svg.closest('.ag-app');
    const findFan=key=>[...svg.querySelectorAll('.ag-fan')].find(f=>f.dataset.group===key);
    function close(restoreFocus=false) {
        clearTimeout(timer);
        if(!active)return;
        const {origin,fan}=active;active=undefined;
        origin.removeAttribute('data-expanded');origin.setAttribute('aria-expanded','false');
        fan.classList.remove('is-expanded');fan.querySelectorAll('.ag-fan-point').forEach(p=>p.setAttribute('tabindex','-1'));
        if(restoreFocus&&origin.isConnected){ignoreFocus=true;origin.focus({preventScroll:true});ignoreFocus=false;}
    }
    function layout() {
        if(!active)return;
        const {origin,fan}=active, matrix=svg.getScreenCTM(), originMatrix=origin.getScreenCTM();if(!matrix||!originMatrix)return;
        const inverse=matrix.inverse(),unit=Math.min(3,Math.max(1,1/Math.hypot(matrix.a,matrix.b)));
        const anchor=new DOMPoint(Number(origin.dataset.baseX),Number(origin.dataset.baseY)).matrixTransform(originMatrix).matrixTransform(inverse);
        const points=[...fan.querySelectorAll('.ag-fan-point')],positions=[];
        // Small groups use one circle; larger stacks use concentric rings so
        // every ammunition item keeps a distinct pointer target.
        for(let start=0,ring=0;start<points.length;ring++){
            const radius=(42+ring*28)*unit, count=Math.min(points.length-start,Math.floor(2*Math.PI*radius/(25*unit)));
            for(let i=0;i<count;i++){const angle=-Math.PI/2+i*2*Math.PI/count+(ring%2?Math.PI/count:0);positions.push({x:Math.cos(angle)*radius,y:Math.sin(angle)*radius,radius});}
            start+=count;
        }
        const scale=Math.min(1,240/positions.at(-1).radius),radius=positions.at(-1).radius*scale, cx=clamp(anchor.x,radius+18,960-radius-18),cy=clamp(anchor.y,radius+18,550-radius-18);
        const hit=fan.querySelector('.ag-fan-hit');hit.setAttribute('cx',cx);hit.setAttribute('cy',cy);hit.setAttribute('r',radius+15);
        const center=fan.querySelector('.ag-fan-origin');center.setAttribute('cx',anchor.x);center.setAttribute('cy',anchor.y);center.setAttribute('r',String(3.5*unit));
        const lines=[...fan.querySelectorAll('.ag-fan-line')];
        points.forEach((point,i)=>{
            const x=cx+positions[i].x*scale,y=cy+positions[i].y*scale;
            point.setAttribute('transform',`translate(${x} ${y}) scale(${unit*scale})`);
            const label=point.querySelector('.ag-fan-name');
            if(label){
                const size=unit*scale,labelWidth=label.getComputedTextLength()*size;
                const left=clamp(positions[i].x<0?x-12*size-labelWidth:x+12*size,8,952-labelWidth);
                label.setAttribute('text-anchor','start');label.setAttribute('x',String((left-x)/size));
                label.setAttribute('y',String((clamp(y-12*size,14*size,542)-y)/size));
            }
            for(const [key,value] of Object.entries({x1:anchor.x,y1:anchor.y,x2:x,y2:y}))lines[i].setAttribute(key,String(value));
        });
        fan.dataset.originX=String(anchor.x);fan.dataset.originY=String(anchor.y);
    }
    function expand(origin) {
        clearTimeout(timer);
        if(active?.origin===origin){layout();return;}
        close();const fan=findFan(origin.dataset.id);if(!fan)return;
        active={origin,fan,key:origin.dataset.id};origin.dataset.expanded='true';origin.setAttribute('aria-expanded','true');
        fan.classList.add('is-expanded');fan.querySelectorAll('.ag-fan-point').forEach(p=>p.setAttribute('tabindex','0'));layout();
    }
    function enter(e) {
        if(ignoreFocus||svg.classList.contains('ag-interacting'))return;
        const fan=e.target.closest?.('.ag-fan');if(fan&&active?.fan===fan){clearTimeout(timer);return;}
        const point=e.target.closest?.('.ag-point');
        if(point&&svg.contains(point)){if(point.dataset.id.includes(','))expand(point);else close();}
        else if(e.target.closest?.('.ag-tooltip'))clearTimeout(timer);
    }
    function leave(e) {
        if(!active)return;const next=e.relatedTarget;
        if(next&&(active.origin.contains(next)||active.fan.contains(next)||next.closest?.('.ag-tooltip')))return;
        if(active.origin.contains(e.target)||active.fan.contains(e.target)||e.target.closest?.('.ag-tooltip')){clearTimeout(timer);timer=setTimeout(()=>close(),200);}
    }
    function click(e) {
        const point=e.target.closest?.('.ag-point');
        if(point&&point.dataset.id.includes(',')){expand(point);e.preventDefault();e.stopImmediatePropagation();return;}
        if(active&&!active.fan.contains(e.target)&&!e.target.closest?.('.ag-tooltip'))close();
    }
    function key(e) {
        if(e.key==='Escape'&&active){close(true);e.preventDefault();return;}
        const point=e.target.closest?.('.ag-point');
        if(point?.dataset.id.includes(',')&&(e.key==='Enter'||e.key===' ')){expand(point);active.fan.querySelector('.ag-fan-point')?.focus({preventScroll:true});e.preventDefault();e.stopImmediatePropagation();}
        else if(e.key===' '&&e.target.closest?.('.ag-fan-point'))e.preventDefault();
    }
    function navigate(){close();}
    root.addEventListener('pointerover',enter);root.addEventListener('pointerout',leave);root.addEventListener('focusin',enter);root.addEventListener('focusout',leave);
    svg.addEventListener('click',click,true);svg.addEventListener('keydown',key,true);svg.addEventListener('ag-navigation-start',navigate);
    window.addEventListener('resize',navigate);document.addEventListener('pointerdown',outside);
    function outside(e){if(active&&!svg.contains(e.target)&&!e.target.closest?.('.ag-tooltip'))close();}
    return {svg,sync(){if(!active)return;if(!active.origin.isConnected||active.origin.dataset.id!==active.key||!active.fan.isConnected)close();else layout();},destroy(){close();root.removeEventListener('pointerover',enter);root.removeEventListener('pointerout',leave);root.removeEventListener('focusin',enter);root.removeEventListener('focusout',leave);svg.removeEventListener('click',click,true);svg.removeEventListener('keydown',key,true);svg.removeEventListener('ag-navigation-start',navigate);window.removeEventListener('resize',navigate);document.removeEventListener('pointerdown',outside);}};
}
export function syncFans(){const svg=document.querySelector('.ag-chart');if(!svg){destroyFans();return;}if(controller?.svg!==svg){destroyFans();controller=create(svg);}controller.sync();}
export function destroyFans(){controller?.destroy();controller=undefined;}
