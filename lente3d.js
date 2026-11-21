// Longitudes en mm. Potencias de superficie y de vértice posterior en dioptrías.
const lensViewer = (() => {
  const el = id => document.getElementById(id);
  const fields = ['solidMaterial','solidFrame','solidDistance','solidTilt','solidWrap','solidX','solidY'].map(el);
  const slots = {};
  const gaze = [.5,.5];
  const shift = [0,0];
  const action = el('solidAction');
  const buffer = document.createElement('canvas');
  let activeSlot = '', textures = [];
  const sectors = 96, rings = 12;
  const panel = document.getElementById('lens3d');
  const canvas = document.getElementById('solidCanvas');
  const ctx = canvas.getContext('2d');
  const part = document.getElementById('solidPart');
  const scene = document.getElementById('solidScene');
  const mode = document.getElementById('solidMode');
  const reference = document.getElementById('solidReference');
  const help = document.getElementById('solidHelp');
  const exploreHelp = help.textContent;
  const measures = document.getElementById('solidMeasures');
  let rx = [0, 0, 0], model, modelKey, yaw = .65, pitch = -.18;
  let pointer, pending = false;
  const chart = document.createElement('canvas');
  let chartKey;

  function drawPlate(g, unit, reach) {
    g.scale(unit,unit);
    const limit = reach/unit;
    g.fillStyle = scene.value === 'reading' ? '#f6efdf' : '#eef2ed';
    g.fillRect(-limit,-limit,2*limit,2*limit);
    if (scene.value === 'reading') {
      g.textAlign = 'left';
      g.fillStyle = '#805343';
      g.font = '600 0.036px sans-serif';
      g.fillText('CUADERNO DE ÓPTICA',-.48,-.32);
      g.fillStyle = '#243732';
      g.font = 'bold 0.10px Georgia, serif';
      g.fillText('La luz del día',-.48,-.16);
      g.fillRect(-.48,-.11,.96,.004);
      g.font = '0.057px Georgia, serif';
      ['La luz entra por la ventana.', 'En la mesa, un libro abierto', 'recoge la sombra de las hojas.'].forEach((line,i)=>{
        g.fillText(line,-.48,.01+i*.09);
      });
      g.font = 'italic 0.043px Georgia, serif';
      g.fillText('Al pasar la página, la sombra cambia.',-.48,.34);
      return;
    }
    g.lineWidth = .004;
    if (scene.value === 'grid') {
      g.strokeStyle = '#849e9b';
      g.beginPath();
      for (let i=-Math.ceil(limit*12); i<=Math.ceil(limit*12); i++) {
        g.moveTo(i/12,-limit); g.lineTo(i/12,limit);
        g.moveTo(-limit,i/12); g.lineTo(limit,i/12);
      }
      g.stroke();
      g.strokeStyle = '#aa5937';
      for (const r of [.12,.25,.38]) {
        g.beginPath(); g.arc(0,0,r,0,2*Math.PI); g.stroke();
      }
      return;
    }
    g.strokeStyle = g.fillStyle = '#223e40';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 0.05px sans-serif';
    for (let hour=1; hour<=12; hour++) {
      const angle = hour*Math.PI/6;
      g.save();
      g.rotate(angle);
      for (const x of [-.012,0,.012]) {
        g.beginPath(); g.moveTo(x,-.065); g.lineTo(x,-.35); g.stroke();
      }
      g.restore();
      g.fillText(String(hour),.41*Math.sin(angle),-.41*Math.cos(angle));
    }
  }

  function deskLayer(g,w,h,layer) {
    const u=Math.min(w/1.25,h);
    g.translate(w/2,h/2); g.scale(u,u);
    const rect=(x,y,a,b,color)=>{g.fillStyle=color;g.fillRect(x,y,a,b);};
    const label=(str,x,y,size,color)=>{g.fillStyle=color;g.font=size+'px Georgia,serif';g.fillText(str,x,y);};
    if(layer===2) {
      rect(-10,-10,20,20,'#ded9c8');
      rect(.21,-.48,.41,.96,'#896b52');rect(.23,-.46,.37,.92,'#c4aa88');
      rect(.26,-.42,.3,.43,'#ddc8a7');rect(.26,.07,.3,.33,'#d7c09f');
      rect(.27,.03,.07,.012,'#554a43');rect(-10,.4,20,.03,'#877863');
    } else if(layer===1) {
      rect(-.7,-.33,.78,.49,'#263b40');rect(-.675,-.305,.73,.425,'#d2e7df');
      label('Agenda',-.60,-.18,.08,'#254743');
      for(let i=0;i<3;i++) {
        rect(-.59,-.12+i*.07,.035,.035,'#789a8f');
        rect(-.52,-.111+i*.07,.39-i*.05,.012,'#71938a');
      }
      rect(-.37,.16,.09,.07,'#546769');rect(-.48,.22,.31,.019,'#34484a');
    } else {
      rect(-10,.24,20,10,'#a9815d');
      g.rotate(-.07);
      rect(-.49,.244,1.02,.36,'#f3eddb');
      label('Notas de taller',-.42,.32,.065,'#354642');
      label('Medir la altura y el centrado.',-.41,.40,.043,'#425854');
      label('Revisar la montura.',-.41,.47,.041,'#425854');
    }
  }

  function prepareChart(w, h, dpr) {
    const key = [scene.value,w,h,dpr].join(',');
    if (chartKey === key) return;
    chartKey = key;
    chart.width = canvas.width;
    chart.height = canvas.height;
    const base = chart.getContext('2d');
    base.scale(dpr,dpr);
    const desk = scene.value==='desk';
    const depths = desk ? [400,750,3000] : [scene.value==='reading'?400:6000];
    textures=depths.map((depth,i)=>{
      const src=document.createElement('canvas');
      const scale=Math.min(dpr,1.5,1500/w);
      const padX=Math.ceil(w*scale*.35),padY=Math.ceil(h*scale*.5);
      src.width=Math.ceil(w*scale)+2*padX; src.height=Math.ceil(h*scale)+2*padY;
      const g=src.getContext('2d',{willReadFrequently:true});
      g.setTransform(scale,0,0,scale,padX,padY);
      if(desk) deskLayer(g,w,h,i);
      else drawBackground(g,w,h);
      return {src,depth,scale,padX,padY,w:src.width,h:src.height,data:g.getImageData(0,0,src.width,src.height).data};
    });
    for(const l of [...textures].reverse()) base.drawImage(l.src,l.padX,l.padY,w*l.scale,h*l.scale,0,0,w,h);
  }

  function drawBackground(g,w,h) {
    g.translate(w/2,h/2);
    const unit = Math.min(h,w/1.15);
    const reach = Math.hypot(w,h);
    if (scene.value !== 'chart') {
      drawPlate(g,unit,reach);
      return;
    }
    const wall = g.createLinearGradient(-w/2,-h/2,w/2,h/2);
    wall.addColorStop(0,'#27464a');
    wall.addColorStop(1,'#10292e');
    g.fillStyle = wall;
    g.fillRect(-reach,-reach,2*reach,2*reach);
    const grid = unit/12;
    g.strokeStyle = '#426065';
    g.lineWidth = 1;
    g.beginPath();
    for (let p = -Math.ceil(reach/grid); p <= Math.ceil(reach/grid); p++) {
      g.moveTo(p*grid,-reach); g.lineTo(p*grid,reach);
      g.moveTo(-reach,p*grid); g.lineTo(reach,p*grid);
    }
    g.stroke();
    g.scale(unit,unit);
    g.fillStyle = '#eae9df';
    g.shadowColor = '#0c2026';
    g.shadowBlur = unit*.035;
    g.fillRect(-.52,-.465,1.04,.93);
    g.shadowBlur = 0;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#1d3335';
    const rows = [
      ['E',.17,-.34], ['F P',.14,-.17], ['T O Z',.115,-.02],
      ['L P E D',.092,.11], ['P E C F D',.071,.22], ['E D F C Z P',.056,.35]
    ];
    for (const [letters,size,y] of rows) {
      g.font = 'bold '+size*unit+'px Arial, sans-serif';
      g.save();
      g.scale(1/unit,1/unit);
      g.fillText(letters,0,y*unit);
      g.restore();
    }
    g.fillStyle = '#ae5545';
    g.fillRect(-.36,.276,.72,.008);
    g.fillStyle = '#558572';
    g.fillRect(-.36,.40,.72,.008);
  }

  function build(sphere, cyl, axis, n, a, b, dx, dy) {
    const power = [sphere, sphere + cyl];
    const angle = axis * Math.PI / 180;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const base = Math.min(12, Math.max(.5, 4 + (power[0] + power[1]) / 4));
    const kf = base / (1000 * (n - 1));
    const sag = (k, r2) => k * r2 / (1 + Math.sqrt(1 - k*k*r2));
    const front = (x,y) => sag(kf, x*x + y*y);

    function backSurface(t) {
      const vertexFront = base / (1 - t * base / (1000 * n));
      const ks = power.map(p => (vertexFront - p) / (1000 * (n - 1)));
      // El mismo toro para las dos notaciones transpuestas de una receta.
      const swap = Math.abs(ks[1]) > Math.abs(ks[0]) ||
        (Math.abs(ks[1]) === Math.abs(ks[0]) && ks[1] > ks[0]);
      const [ku,kv] = swap ? [ks[1],ks[0]] : ks;
      return (x,y) => {
        if (!cyl) return sag(ku, x*x + y*y);
        const along = x*cos + y*sin, across = -x*sin + y*cos;
        const [u,v] = swap ? [across,along] : [along,across];
        // Rotación del arco generador. La forma racional admite curvatura cero.
        const s = sag(ku,u*u), d = 1 - kv*s;
        return s + kv*v*v / (d + Math.sqrt(d*d - kv*kv*v*v));
      };
    }

    const points = [];
    for (let ring = 0; ring <= rings; ring++) {
      for (let j = 0; j < sectors; j++) {
        const theta = 2*Math.PI*j/sectors;
        const x = a * ring/rings * Math.cos(theta)-dx, y = b * ring/rings * Math.sin(theta)-dy;
        points.push([x,y,front(x,y)]);
      }
    }
    let t = 2, back;
    for (let i = 0; i < 16; i++) {
      back = backSurface(t);
      const minimum = Math.min(...points.map(([x,y,f]) => t + back(x,y) - f));
      if (minimum >= 2 - .00001) break;
      t += 2 - minimum;
    }
    back = backSurface(t);
    const surfaces = [points.map(([x,y,f]) => [x,y,-f]), points.map(([x,y]) => [x,y,-t-back(x,y)])];
    const rim = points.slice(-sectors).map(([x,y,f]) => t + back(x,y) - f);
    const guide = [];
    const A=(cos/a)**2+(sin/b)**2, B=dx*cos/(a*a)+dy*sin/(b*b);
    const span=Math.sqrt(B*B-A*((dx/a)**2+(dy/b)**2-1))/A;
    if (cyl) for (let i = -20; i <= 20; i++) {
      const r=-B/A+span*i/20, x=r*cos, y=r*sin;
      guide.push([x,y,-front(x,y)]);
    }
    return { surfaces, guide, t, base, rim, n,a,b,dx,dy,
      z:[(x,y)=>-front(x,y),(x,y)=>-t-back(x,y)],
      inside:([x,y])=>((x+dx)/a)**2+((y+dy)/b)**2<=1.00001 };
  }

  function render() {
    pending = false;
    if (!panel.open || !canvas.clientWidth) return;
    const [s,c,axis] = rx;
    const sphere = part.value === 'cylinder' ? 0 : s;
    const cyl = part.value === 'sphere' ? 0 : c;
    const [material,frame,distance,tilt,wrap,offsetX,offsetY]=fields;
    const [width,height]=frame.value.split(' × ').map(Number);
    const geometry=[+material.value,width/2,height/2,+offsetX.value,+offsetY.value];
    const key=[sphere,cyl,axis,...geometry].join(',');
    if(key!==modelKey) {model=build(sphere,cyl,axis,...geometry);modelKey=key;}
    const w=canvas.clientWidth,h=canvas.clientHeight,dpr=Math.min(2,window.devicePixelRatio||1);
    if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){
      canvas.width=Math.round(w*dpr); canvas.height=Math.round(h*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    prepareChart(w,h,dpr);
    ctx.drawImage(chart,0,0,w,h);
    if(!Number.isFinite(model.t+Math.max(...model.rim))) {
      measures.textContent='La superficie estimada excede su radio de curvatura para esta combinación. Reducí el aro o el descentrado, o elegí un índice mayor.';
      return;
    }
    const wear=mode.value==='wear', radians=Math.PI/180;
    const cam=solidRays.camera(model,w,h,wear,(wear?0:yaw)+Number(wrap.value)*radians,
      (wear?0:pitch)+Number(tilt.value)*radians,Number(distance.value),shift);
    const project=cam.project;
    const layers=model.surfaces.map(layer=>layer.map(project));
    const rims=layers.flatMap(layer=>layer.slice(-sectors));
    const range=(i,fn)=>fn(...rims.map(p=>p[i]));
    const bounds=[range(0,Math.min)-2,range(1,Math.min)-2,range(0,Math.max)+2,range(1,Math.max)+2];
    if(!wear || !reference.checked) solidRays.paint(ctx,buffer,cam,textures,w,h,wear?[0,0,w,h]:bounds);
    const mm=x=>x.toLocaleString('es-AR',{maximumFractionDigits:2,minimumFractionDigits:2});
    const px=gaze[0]*w,py=gaze[1]*h;
    const hit=cam.ray(px,py);
    const looking=action.value!=='rotate' && !(wear && reference.checked);
    let caption=(activeSlot?'['+activeSlot+'] ':'')+formatRecipe(sphere,cyl,axis)+' · '+material.selectedOptions[0].text+
      ' · Aro '+frame.value+' mm · Base +'+mm(model.base)+' D · Centro '+mm(model.t)+' mm · Borde '+
      mm(Math.min(...model.rim))+' a '+mm(Math.max(...model.rim))+' mm';
    if(looking){
      caption+=hit?' · Mirada a '+mm(Math.hypot(hit.enter[0],hit.enter[1]))+' mm del centro óptico':' · Mirada sin paso por ambas caras';
    }
    measures.textContent=caption;
    function markGaze(){
      if(!looking) return;
      ctx.save();ctx.beginPath();ctx.arc(px,py,7,0,2*Math.PI);
      ctx.moveTo(px-11,py);ctx.lineTo(px-4,py);ctx.moveTo(px+4,py);ctx.lineTo(px+11,py);
      ctx.moveTo(px,py-11);ctx.lineTo(px,py-4);ctx.moveTo(px,py+4);ctx.lineTo(px,py+11);
      ctx.strokeStyle='#fff';ctx.lineWidth=3;ctx.stroke();ctx.strokeStyle='#234047';ctx.lineWidth=1;ctx.stroke();ctx.restore();
    }
    if(wear){markGaze();return;}
    const scale=Math.min(w/72,h/56);
    const faces = [];
    function face(points, material) {
      const [p,q,r] = points;
      // Normal en coordenadas de cámara con las tres dimensiones en mm.
      const u = [(q[0]-p[0])/scale,(p[1]-q[1])/scale,q[2]-p[2]];
      const v = [(r[0]-p[0])/scale,(p[1]-r[1])/scale,r[2]-p[2]];
      const nx=u[1]*v[2]-u[2]*v[1], ny=u[2]*v[0]-u[0]*v[2], nz=u[0]*v[1]-u[1]*v[0];
      const length=Math.hypot(nx,ny,nz);
      if (length < 1e-9) return;
      const light=Math.abs((-.42*nx+.65*ny+.63*nz)/length);
      const shade=Math.round((material===2 ? 38 : 25)+light*32);
      faces.push({points,depth:points.reduce((sum,p)=>sum+p[2],0)/points.length,
        fill:`hsla(${material===2 ? 184 : 194},42%,${shade}%,${material===2 ? .78 : .075})`});
    }
    for (let j=0;j<sectors;j++) {
      const next=(j+1)%sectors;
      for (const [side,layer] of layers.entries()) {
        for (let i=0;i<rings;i++) {
          const k=i*sectors, l=k+sectors;
          face([layer[k+j],layer[l+j],layer[l+next],layer[k+next]],side);
        }
      }
      const k=rings*sectors;
      face([layers[0][k+j],layers[1][k+j],layers[1][k+next],layers[0][k+next]],2);
    }
    function trace(points) {
      ctx.beginPath(); ctx.moveTo(points[0][0],points[0][1]);
      for (let i=1;i<points.length;i++) ctx.lineTo(points[i][0],points[i][1]);
    }
    faces.sort((a,b)=>a.depth-b.depth);
    for (const f of faces) {
      trace(f.points); ctx.closePath(); ctx.fillStyle=f.fill; ctx.fill();
    }
    for (const layer of layers) {
      trace(layer.slice(-sectors)); ctx.closePath(); ctx.strokeStyle='#aecbd6'; ctx.lineWidth=1; ctx.stroke();
    }
    const sheen=ctx.createLinearGradient(bounds[0],bounds[1],bounds[2],bounds[3]);
    sheen.addColorStop(0,'#ffffff00');sheen.addColorStop(.28,'#ffffff03');
    sheen.addColorStop(.34,'#ffffff38');sheen.addColorStop(.41,'#ffffff00');
    trace(layers[0].slice(-sectors));ctx.closePath();ctx.fillStyle=sheen;ctx.fill();
    if (model.guide.length) {
      trace(model.guide.map(project)); ctx.strokeStyle='#ffca70'; ctx.lineWidth=2; ctx.stroke();
    }
    markGaze();
  }

  function refresh() {
    if (!pending && panel.open) { pending=true; requestAnimationFrame(render); }
  }
  function rotate(dx,dy) {
    if (mode.value === 'wear') return;
    yaw += dx; pitch = Math.max(-Math.PI/2,Math.min(Math.PI/2,pitch+dy)); refresh();
  }
  panel.addEventListener('toggle',refresh);
  scene.addEventListener('change',syncMode);
  reference.addEventListener('change',refresh);
  function syncMode() {
    const wear = mode.value === 'wear';
    panel.querySelectorAll('[data-camera]').forEach(button => { button.hidden = wear; });
    reference.parentElement.hidden = !wear;
    if(wear && action.value==='rotate') action.value='gaze';
    action.querySelector('[value="rotate"]').disabled=wear;
    canvas.setAttribute('aria-label', wear ? 'Escena vista con el anteojo' : 'Modelo tridimensional de la lente');
    canvas.style.cursor=action.value==='gaze'?'crosshair':'grab';
    help.textContent=action.value==='gaze'
      ? 'Señalá por dónde mirar con el puntero o las flechas. La distancia al centro óptico se mide en la cara de entrada del rayo.'
      : action.value==='move' ? 'Arrastrá el cristal o usá las flechas. La mira y el fondo quedan fijos para comparar el paso por el centro y por el borde.' : exploreHelp;
    help.textContent += scene.value==='desk' ? ' Papel a 40 cm, monitor a 75 cm y puerta a 3 m del observador.' :
      (scene.value==='reading'?' Página a 40 cm.':' Fondo a 6 m.');
    refresh();
  }
  mode.addEventListener('change',syncMode);
  syncMode();
  new ResizeObserver(refresh).observe(canvas);
  panel.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>{
    const view = button.dataset.camera;
    yaw = view==='side' ? Math.PI/2 : view==='front' ? 0 : .65;
    pitch = view==='oblique' ? -.18 : 0;
    refresh();
  }));
  canvas.addEventListener('pointerdown',e=>{
    if (!e.isPrimary || e.button!==0) return;
    if(action.value==='gaze') pointAt(e);
    pointer=[e.clientX,e.clientY]; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if (!pointer || !canvas.hasPointerCapture(e.pointerId)) return;
    if(action.value==='gaze') pointAt(e);
    else if(action.value==='move'){
      const scale=mode.value==='wear'?Math.min(canvas.clientWidth*.75,canvas.clientHeight*.68)/Number(fields[2].value):
        Math.min(canvas.clientWidth/72,canvas.clientHeight/56);
      moveLens((e.clientX-pointer[0])/scale,(pointer[1]-e.clientY)/scale);
    }
    else rotate((e.clientX-pointer[0])*.012,(pointer[1]-e.clientY)*.012);
    pointer=[e.clientX,e.clientY];
  });
  canvas.addEventListener('lostpointercapture',()=>{pointer=null;});
  canvas.addEventListener('keydown',e=>{
    const step={ArrowLeft:[-.12,0],ArrowRight:[.12,0],ArrowUp:[0,.12],ArrowDown:[0,-.12]}[e.key];
    if (step) { e.preventDefault();
      if(action.value==='rotate') rotate(...step);
      else if(action.value==='move') moveLens(step[0]/.12,step[1]/.12);
      else {gaze[0]=clamp(gaze[0]+step[0]/6);gaze[1]=clamp(gaze[1]-step[1]/6);refresh();} }
  });
  const clamp=x=>Math.max(0,Math.min(1,x));
  function moveLens(dx,dy){
    shift[0]=Math.max(-30,Math.min(30,shift[0]+dx));
    shift[1]=Math.max(-24,Math.min(24,shift[1]+dy));
    refresh();
  }
  function pointAt(e){
    const r=canvas.getBoundingClientRect();
    gaze[0]=clamp((e.clientX-r.left)/r.width); gaze[1]=clamp((e.clientY-r.top)/r.height);
    refresh();
  }
  action.addEventListener('change',syncMode);
  el('solidCenter').onclick=()=>{shift.fill(0);gaze.fill(.5);action.value='gaze';syncMode();};
  const full=el('solidFull');
  full.onclick=async()=>{
    if(panel.classList.contains('solid-expanded')){panel.classList.remove('solid-expanded');syncFull();return;}
    try {
      if(document.fullscreenElement===panel) await document.exitFullscreen();
      else await panel.requestFullscreen();
    } catch {panel.classList.toggle('solid-expanded');syncFull();}
  };
  function syncFull(){full.textContent=document.fullscreenElement===panel || panel.classList.contains('solid-expanded')?'Salir de pantalla completa':'Pantalla completa';refresh();}
  document.addEventListener('fullscreenchange',syncFull);
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){panel.classList.remove('solid-expanded');syncFull();}});
  function edited(){activeSlot='';refresh();}
  for(const field of fields) field.addEventListener('change',()=>{
    if(field.type==='number') field.value=Number.isFinite(field.valueAsNumber)?Math.max(+field.min,Math.min(+field.max,field.valueAsNumber)):field.defaultValue;
    edited();
  });
  part.addEventListener('change',edited);
  function showProfiles(){
    if(!slots.A||!slots.B)return;
    el('solidProfiles').hidden=false;
    const cv=el('profileCanvas'),g=cv.getContext('2d');
    cv.width=720;cv.height=120;
    const notes=[];
    const maxDepth=Math.max(...[slots.A,slots.B].flatMap(s=>s.model.surfaces.flatMap(layer=>layer.map(p=>Math.abs(p[2])))));
    const k=Math.min(5.1,84/maxDepth);
    for(const [i,name] of ['A','B'].entries()){
      const m=slots[name].model,cx=180+360*i;
      g.fillStyle='#203e42';g.font='16px sans-serif';g.fillText(name,cx-158,22);
      const radius=m.a*Math.sqrt(1-(m.dy/m.b)**2);
      g.beginPath();
      for(let side=0;side<2;side++)for(let j=0;j<=100;j++){
        const u=side?1-j/100:j/100,x=-m.dx+radius*(2*u-1);
        const y=28-m.z[side](x,0)*k;
        if(!side&&!j)g.moveTo(cx+(x+m.dx)*k,y);else g.lineTo(cx+(x+m.dx)*k,y);
      }
      g.closePath();g.fillStyle='#c9e1dd';g.fill();g.strokeStyle='#426c70';g.stroke();
      notes.push(name+' · '+slots[name].label+' · Centro '+m.t.toFixed(2)+' mm · Borde máximo '+Math.max(...m.rim).toFixed(2)+' mm');
    }
    el('profileText').textContent=notes.join('  |  ');
  }
  panel.querySelectorAll('[data-save]').forEach(btn=>btn.onclick=()=>{
    render();
    if(!Number.isFinite(model.t+Math.max(...model.rim))) return;
    const name=btn.dataset.save;
    slots[name]={rx:[...rx],part:part.value,fields:fields.map(f=>f.value),model,
      label:formatRecipe(part.value==='cylinder'?0:rx[0],part.value==='sphere'?0:rx[1],rx[2])+' · '+fields[0].selectedOptions[0].text+' · '+fields[1].value+' mm'};
    panel.querySelector('[data-load="'+name+'"]').disabled=false;
    activeSlot=name;showProfiles();refresh();
  });
  panel.querySelectorAll('[data-load]').forEach(btn=>btn.onclick=()=>{
    const name=btn.dataset.load,s=slots[name];
    fields.forEach((f,i)=>{f.value=s.fields[i];});part.value=s.part;
    ['sphereInput','cylInput','axisInput'].forEach((id,i)=>{
      const input=el(id);input.value=s.rx[i];input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    activeSlot=name;refresh();
  });
  return {update(s,c,axis){if(rx[0]!==s||rx[1]!==c||rx[2]!==axis)activeSlot='';rx=[s,c,axis];refresh();}};
})();
