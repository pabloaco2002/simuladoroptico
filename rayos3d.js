/* Rayos principales en mm. La cámara y los planos del fondo comparten
   coordenadas; la intersección y la ley de Snell se resuelven en el cristal. */
const solidRays = (() => {
  const dot = (a,b) => a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const unit = v => { const k = Math.hypot(...v); return v.map(x=>x/k); };

  function intersect(o,d,surface,vertex) {
    if (Math.abs(d[2]) < .0001) return null;
    let t = (vertex-o[2])/d[2];
    for (let i=0;i<12;i++) {
      const x=o[0]+t*d[0], y=o[1]+t*d[1], z=surface(x,y);
      const dx=(surface(x+.001,y)-surface(x-.001,y))/.002;
      const dy=(surface(x,y+.001)-surface(x,y-.001))/.002;
      const error=o[2]+t*d[2]-z;
      if (!Number.isFinite(error+dx+dy)) return null;
      if (Math.abs(error)<.0001) return t>=-.0001 ? {p:[x,y,z], normal:unit([-dx,-dy,1])} : null;
      const slope=d[2]-dx*d[0]-dy*d[1];
      if (Math.abs(slope)<.00001) return null;
      t-=error/slope;
    }
    return null;
  }
  function refract(d,n,ratio) {
    let cosine=-dot(d,n);
    if (cosine<0) { n=n.map(v=>-v); cosine=-cosine; }
    const k=1-ratio*ratio*(1-cosine*cosine);
    if(k<0) return null;
    return d.map((v,i)=>ratio*v+(ratio*cosine-Math.sqrt(k))*n[i]);
  }
  function camera(m,w,h,wear,yaw,pitch,distance,shift=[0,0]) {
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cp=Math.cos(pitch),sp=Math.sin(pitch);
    const rotate=([x,y,z])=>[cy*x+sy*z,cp*y+sp*sy*x-sp*cy*z,sp*y-cp*sy*x+cp*cy*z];
    const inverse=([x,y,z])=>[cy*x+sy*sp*y-sy*cp*z,cp*y+sp*z,sy*x-sp*cy*y+cp*cy*z];
    const sign=wear?1:-1, eyeZ=wear?-distance:180;
    const pivot=wear?m.t:m.t/2;
    const focal=wear?Math.min(w*.75,h*.68):180*Math.min(w/72,h/56);
    const eye=inverse([-shift[0],-shift[1],eyeZ]);
    eye[0]-=m.dx; eye[1]-=m.dy; eye[2]-=pivot;
    const world=p=>{
      const v=rotate([p[0]+m.dx,p[1]+m.dy,p[2]+pivot]);
      v[0]+=shift[0]; v[1]+=shift[1];
      return v;
    };
    function project(p) {
      const [x,y,z]=world(p), k=focal/(sign*(z-eyeZ));
      return [w/2+x*k,h/2-y*k,-sign*z];
    }
    function ray(px,py) {
      const d=unit(inverse([(px-w/2)/focal,(h/2-py)/focal,sign]));
      const first=d[2]<0?0:1, second=1-first;
      const enter=intersect(eye,d,m.z[first],first?-m.t:0);
      if(!enter || !m.inside(enter.p)) return null;
      const glass=refract(d,enter.normal,1/m.n);
      if(!glass) return null;
      const leave=intersect(enter.p,glass,m.z[second],second?-m.t:0);
      if(!leave || !m.inside(leave.p)) return null;
      const out=refract(glass,leave.normal,m.n);
      if(!out) return null;
      const dir=rotate(out),pos=world(leave.p);
      if(dir[2]*sign<=.001) return null;
      return {pos,dir,enter:enter.p};
    }
    function texture(ray,depth) {
      const t=(eyeZ+sign*depth-ray.pos[2])/ray.dir[2];
      const k=focal/depth;
      return [w/2+(ray.pos[0]+t*ray.dir[0])*k,h/2-(ray.pos[1]+t*ray.dir[1])*k];
    }
    return {project,ray,texture};
  }

  // Interpolar el mapa de coordenadas, nunca los colores entre objetos.
  // En el contorno se recalcula el rayo para conservar la abertura real.
  function paint(ctx,buffer,cam,layers,w,h,bounds) {
    const left=Math.max(0,Math.floor(bounds[0])), top=Math.max(0,Math.floor(bounds[1]));
    const right=Math.min(w,Math.ceil(bounds[2])), bottom=Math.min(h,Math.ceil(bounds[3]));
    if(right<=left || bottom<=top) return;
    const ratio=Math.min(1,900/(right-left),600/(bottom-top));
    const width=Math.max(1,Math.round((right-left)*ratio)),height=Math.max(1,Math.round((bottom-top)*ratio));
    buffer.width=width; buffer.height=height;
    const g=buffer.getContext('2d'), image=g.createImageData(width,height);
    const sx=(right-left)/width,sy=(bottom-top)/height,step=6;
    function sample(x,y) {
      const hit=cam.ray(left+(x+.5)*sx,top+(y+.5)*sy);
      return hit && layers.flatMap(layer=>cam.texture(hit,layer.depth));
    }
    const cols=Math.ceil(width/step)+1;
    function row(y){return Array.from({length:cols},(_,i)=>sample(i*step,y));}
    let prev=row(0);
    for(let y0=0;y0<height;y0+=step) {
      const next=row(y0+step);
      for(let x0=0,col=0;x0<width;x0+=step,col++) {
        const a=prev[col],b=prev[col+1],c=next[col],d=next[col+1];
        if(!a&&!b&&!c&&!d) continue;
        const full=a&&b&&c&&d;
        for(let y=y0;y<Math.min(height,y0+step);y++) {
          const v=(y-y0)/step;
          for(let x=x0;x<Math.min(width,x0+step);x++) {
            const u=(x-x0)/step;
            const edge=full?null:sample(x,y);
            if(!full&&!edge) continue;
            for(let j=0;j<layers.length;j++) {
              const l=layers[j],k=2*j;
              const coord=i=>full ? (1-v)*(a[i]+u*(b[i]-a[i]))+v*(c[i]+u*(d[i]-c[i])) : edge[i];
              const tx=Math.max(0,Math.min(l.w-1.001,coord(k)*l.scale+l.padX-.5));
              const ty=Math.max(0,Math.min(l.h-1.001,coord(k+1)*l.scale+l.padY-.5));
              const ix=Math.floor(tx),iy=Math.floor(ty),src=(iy*l.w+ix)*4;
              if(l.data[src+3]<128) continue;
              const dest=(y*width+x)*4,fx=tx-ix,fy=ty-iy,below=src+l.w*4;
              for(let channel=0;channel<3;channel++){
                const p=src+channel,q=below+channel;
                image.data[dest+channel]=(1-fy)*((1-fx)*l.data[p]+fx*l.data[p+4])+
                  fy*((1-fx)*l.data[q]+fx*l.data[q+4]);
              }
              image.data[dest+3]=255;
              break;
            }
          }
        }
      }
      prev=next;
    }
    g.putImageData(image,0,0);
    ctx.drawImage(buffer,left,top,right-left,bottom-top);
  }
  return {camera,paint};
})();
