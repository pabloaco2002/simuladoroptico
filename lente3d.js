// Longitudes en mm. Potencias de superficie y de vértice posterior en dioptrías.
const lensViewer = (() => {
  const n = 1.498;
  const a = 22, b = 16;
  const sectors = 96, rings = 12;
  const panel = document.getElementById('lens3d');
  const canvas = document.getElementById('solidCanvas');
  const ctx = canvas.getContext('2d');
  const part = document.getElementById('solidPart');
  const measures = document.getElementById('solidMeasures');
  let rx = [0, 0, 0], model, modelKey, yaw = .65, pitch = -.18;
  let pointer, pending = false;

  function build(sphere, cyl, axis) {
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
        const x = a * ring/rings * Math.cos(theta), y = b * ring/rings * Math.sin(theta);
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
    const axisRadius = 1 / Math.hypot(cos/a, sin/b);
    const guide = [];
    if (cyl) for (let i = -20; i <= 20; i++) {
      const x = axisRadius * i/20 * cos, y = axisRadius * i/20 * sin;
      guide.push([x,y,-front(x,y)]);
    }
    return { surfaces, guide, t, base, rim };
  }

  function render() {
    pending = false;
    if (!panel.open || !canvas.clientWidth) return;
    const [s,c,axis] = rx;
    const sphere = part.value === 'cylinder' ? 0 : s;
    const cyl = part.value === 'sphere' ? 0 : c;
    const key = [sphere,cyl,cyl ? axis % 180 : 0].join(',');
    if (key !== modelKey) {
      model = build(sphere,cyl,axis);
      modelKey = key;
    }
    const mm = x => x.toLocaleString('es-AR',{minimumFractionDigits:2,maximumFractionDigits:2});
    const caption = formatRecipe(sphere,cyl,axis) + ' · Base +' + mm(model.base) + ' D · Centro ' + mm(model.t) +
      ' mm · Borde ' + mm(Math.min(...model.rim)) + ' a ' + mm(Math.max(...model.rim)) + ' mm';
    if (measures.textContent !== caption) measures.textContent = caption;
    const w = canvas.clientWidth, h = canvas.clientHeight, dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(w*dpr) || canvas.height !== Math.round(h*dpr)) {
      canvas.width = Math.round(w*dpr); canvas.height = Math.round(h*dpr);
    }
    ctx.setTransform(dpr,0,0,dpr,0,0);
    ctx.clearRect(0,0,w,h);
    const scale = Math.min(w/60,h/47);
    const cy=Math.cos(yaw), sy=Math.sin(yaw), cp=Math.cos(pitch), sp=Math.sin(pitch);
    function project([x,y,z]) {
      z += model.t/2 + 2;
      const depth = -x*sy + z*cy;
      return [w/2 + scale*(x*cy+z*sy), h/2 - scale*(y*cp-depth*sp), y*sp+depth*cp];
    }
    const layers = model.surfaces.map(layer => layer.map(project));
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
        fill:`hsla(${material===2 ? 184 : 194},42%,${shade}%,${material===2 ? .95 : .62})`});
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
    if (model.guide.length) {
      trace(model.guide.map(project)); ctx.strokeStyle='#ffca70'; ctx.lineWidth=2; ctx.stroke();
    }
  }

  function refresh() {
    if (!pending && panel.open) { pending=true; requestAnimationFrame(render); }
  }
  function rotate(dx,dy) {
    yaw += dx; pitch = Math.max(-Math.PI/2,Math.min(Math.PI/2,pitch+dy)); refresh();
  }
  panel.addEventListener('toggle',refresh);
  part.addEventListener('change',refresh);
  new ResizeObserver(refresh).observe(canvas);
  panel.querySelectorAll('[data-camera]').forEach(button=>button.addEventListener('click',()=>{
    const view = button.dataset.camera;
    yaw = view==='side' ? Math.PI/2 : view==='front' ? 0 : .65;
    pitch = view==='oblique' ? -.18 : 0;
    refresh();
  }));
  canvas.addEventListener('pointerdown',e=>{
    if (!e.isPrimary || e.button!==0) return;
    pointer=[e.clientX,e.clientY]; canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove',e=>{
    if (!pointer || !canvas.hasPointerCapture(e.pointerId)) return;
    rotate((e.clientX-pointer[0])*.012,(pointer[1]-e.clientY)*.012);
    pointer=[e.clientX,e.clientY];
  });
  canvas.addEventListener('lostpointercapture',()=>{pointer=null;});
  canvas.addEventListener('keydown',e=>{
    const step={ArrowLeft:[-.12,0],ArrowRight:[.12,0],ArrowUp:[0,.12],ArrowDown:[0,-.12]}[e.key];
    if (step) { e.preventDefault(); rotate(...step); }
  });
  return {update(s,c,axis){rx=[s,c,axis];refresh();}};
})();
