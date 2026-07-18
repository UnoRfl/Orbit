/* Orbit — feature module. See GUIDE.md for the full map of what lives where. */
import { Fragment, h, html, render, useEffect, useState } from './lib.js';
import { B, sb } from './core.js';
import { AuthScreen, SolarLoader } from './components.js';
import { ConfirmHost, Shell } from './shell.js';
import { Settings } from './settings.js';

function App() {
  const [session, setSession] = useState(undefined);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data:sub } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);
  const view = session === undefined ? html`<${SolarLoader}/>`
    : !session ? html`<${AuthScreen}/>`
    : html`<${Shell} key=${session.user.id} session=${session}/>`;
  return html`<${Fragment}><${ConfirmHost}/>${view}</${Fragment}>`;
}

try {
  render(html`<${App}/>`, document.getElementById('app'));
} catch (e) {
  document.getElementById('app').innerHTML =
    '<div class="authcol"><div class="boot">Orbit could not start — check your internet connection and reload.</div></div>';
}

/* ============================================================
   ambient background — interactive, themed, switchable
   ------------------------------------------------------------
   Six pointer-reactive variants (Ambient Waves = default, then
   Topographic, Starfield, Orbits, Constellation, Aurora). Every
   variant reads the ACTIVE theme's accents (--major -> --ge) each
   frame, so it recolours on every colourway and greys out on the
   Monochrome theme. Reads window.__orbit each frame, so the style
   picker + "Flying asteroids" toggle in Settings apply live.

   Mobile performance: a quality tier (qlv 0/1/2) caps DPR + frame
   rate and thins particle/grid counts; phones start at tier 1, and
   if a device still can't hold framerate it auto-drops to tier 2.
   Constellation links + nodes are batched into a handful of draw
   calls instead of hundreds. Contour technique adapted from the
   "Topography" background on 21st.dev / shadcn.io.
   ============================================================ */
(function(){
  const cv=document.getElementById('waves'); if(!cv) return;
  const ctx=cv.getContext('2d');
  const glow=document.getElementById('glow');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rootStyle=document.documentElement.style;
  const R=Math.random;

  /* ---------- device / quality tier ---------- */
  const COARSE=(()=>{ try{ return matchMedia('(pointer:coarse)').matches; }catch{ return false; } })();
  const DEVMEM=(typeof navigator!=='undefined' && navigator.deviceMemory) || 8;
  const CORES=(typeof navigator!=='undefined' && navigator.hardwareConcurrency) || 8;
  let qlv = (COARSE || innerWidth<760 || DEVMEM<=4 || CORES<=4) ? 1 : 0;   // 0=full 1=lite 2=min
  let OCT=3, Q=calcQ();
  function calcQ(){
    OCT = qlv>=1 ? 2 : 3;
    return {
      dprCap:   qlv>=1 ? 1.5 : 2,
      cell:     qlv>=2 ? 40 : (qlv>=1 ? 34 : 26),
      nlev:     qlv>=2 ? 6  : (qlv>=1 ? 7  : 9),
      nodeCap:  qlv>=2 ? 28 : (qlv>=1 ? 42 : 72),
      starDiv:  qlv>=2 ? 22000 : (qlv>=1 ? 15000 : 10000),
      aBands:   qlv>=1 ? 3 : 4,
      frameMin: qlv>=2 ? 28 : (qlv>=1 ? 22 : 0),   // ms between frames (0 = uncapped)
      liteDots: qlv>=1,
    };
  }

  let W=0,H=0,time=0,last=0,dt=16,glowHalf=280;
  let mx=-9999,my=-9999,tx=-9999,ty=-9999,pActive=false;
  const prefs=()=>window.__orbit||{ asteroids:true, bgStyle:'waves' };

  /* ---------- helpers ---------- */
  const lerp=(a,b,t)=>a+(b-a)*t;
  const lerpC=(A,B,t)=>[Math.round(lerp(A[0],B[0],t)),Math.round(lerp(A[1],B[1],t)),Math.round(lerp(A[2],B[2],t))];
  const rgba=(c,a)=>'rgba('+c[0]+','+c[1]+','+c[2]+','+a+')';
  const rnd=i=>{ const x=Math.sin(i*127.1+311.7)*43758.5453; return x-Math.floor(x); };

  /* ---------- theme colour read (hex OR hsl(), so 'auto' works) ---------- */
  function hslToRgb(h,s,l){ s/=100;l/=100; const a=s*Math.min(l,1-l);
    const k=n=>(n+h/30)%12, f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
    return [Math.round(f(0)*255),Math.round(f(8)*255),Math.round(f(4)*255)]; }
  function parseColor(str){ str=(str||'').trim();
    if(str[0]==='#'){ let h=str.slice(1); if(h.length===3) h=h[0]+h[0]+h[1]+h[1]+h[2]+h[2];
      const n=parseInt(h,16); return [(n>>16)&255,(n>>8)&255,n&255]; }
    let m=str.match(/hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/i); if(m) return hslToRgb(+m[1],+m[2],+m[3]);
    m=str.match(/(\d+)[\s,]+(\d+)[\s,]+(\d+)/); if(m) return [+m[1],+m[2],+m[3]];
    return [176,107,255]; }
  let c1=[176,107,255], c2=[45,212,191];
  function readTheme(){
    c1=parseColor(rootStyle.getPropertyValue('--major'));
    c2=parseColor(rootStyle.getPropertyValue('--ge'));
    glow.style.background='radial-gradient(circle, '+rgba(c1,'.16')+', '+rgba(c2,'.05')+' 46%, transparent 70%)';
  }

  /* ---------- procedural noise (topographic) ---------- */
  const hash=(i,j)=>{ const n=Math.sin(i*127.1+j*311.7)*43758.5453; return n-Math.floor(n); };
  function vnoise(x,y){ const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi;
    const u=xf*xf*(3-2*xf), v=yf*yf*(3-2*yf);
    const aa=hash(xi,yi),ba=hash(xi+1,yi),ab=hash(xi,yi+1),bb=hash(xi+1,yi+1);
    const x1=aa+(ba-aa)*u, x2=ab+(bb-ab)*u; return x1+(x2-x1)*v; }
  function fbm(x,y){ let a=0,amp=0.5,fr=1,norm=0; for(let o=0;o<OCT;o++){ a+=amp*vnoise(x*fr,y*fr); norm+=amp; amp*=0.5; fr*=2; } return a/norm; }
  const SEG={1:[3,2],2:[2,1],3:[3,1],4:[0,1],5:[0,1,3,2],6:[0,2],7:[0,3],8:[0,3],9:[0,2],10:[0,3,2,1],11:[0,1],12:[3,1],13:[2,1],14:[3,2]};

  /* ---------- per-variant state, all (re)built on resize ---------- */
  let wrows=[], stars=[], orings=[], nodes=[], abands=[], ast=[];
  let topoCell=28, topoCols=0, topoRows=0, topoField=null;
  const cbuf=[[],[],[],[]]; const cAlpha=[0.04,0.08,0.12,0.16];   // constellation link buckets

  function buildWaves(){ const n=Math.max(10,Math.min(18,Math.round(H/54))); wrows=[];
    for(let i=0;i<n;i++){ const p=n>1?i/(n-1):0;
      wrows.push({y:H*(0.04+0.92*p),p,ph:rnd(i)*Math.PI*2,sp:0.5+rnd(i+50)*0.9,amp:4+rnd(i+100)*7}); } }
  function buildTopo(){ topoCell=Q.cell; topoCols=Math.ceil(W/topoCell)+1; topoRows=Math.ceil(H/topoCell)+1;
    topoField=new Float32Array((topoCols+1)*(topoRows+1)); }
  function buildStars(){ const n=Math.round(W*H/Q.starDiv); stars=[];
    for(let i=0;i<n;i++){ const z=R(); stars.push({x:R()*W,y:R()*H,z,r:0.4+z*1.5,tw:R()*6.283,sp:0.15+z*0.55}); } }
  function buildOrbits(){ const R0=Math.min(W,H), N=5; orings=[];
    for(let k=0;k<N;k++){ const rad=R0*(0.16+0.52*(N>1?k/(N-1):0)), pc=1+((R()*2)|0), planets=[];
      for(let i=0;i<pc;i++) planets.push({ang:R()*6.283,spd:(0.4+R()*0.8)*(k%2?1:-1),size:1.6+R()*2.4});
      orings.push({rad,tilt:0.34,planets,mix:N>1?k/(N-1):0}); } }
  function buildNodes(){ const n=Math.min(Q.nodeCap,Math.max(20,Math.round(W*H/22000))); nodes=[];
    for(let i=0;i<n;i++) nodes.push({x:R()*W,y:R()*H,vx:(R()-0.5)*0.35,vy:(R()-0.5)*0.35}); }
  function buildAurora(){ const N=Q.aBands; abands=[];
    for(let k=0;k<N;k++) abands.push({y:H*(0.18+0.64*(N>1?k/(N-1):0)),amp:24+R()*26,sp:0.15+R()*0.25,ph:R()*6.283,mix:N>1?k/(N-1):0}); }

  function spawnAst(a,now,scatter){ const depth=Math.pow(R(),1.4);
    a.depth=depth; a.size=3+depth*11; a.alpha=0.05+depth*0.14; a.rot=R()*Math.PI*2; a.vrot=(R()-0.5)*0.35;
    const m=a.size+24, edge=(R()*4)|0; let sx,sy;
    if(edge===0){sx=-m;sy=R()*H;}else if(edge===1){sx=W+m;sy=R()*H;}else if(edge===2){sx=R()*W;sy=-m;}else{sx=R()*W;sy=H+m;}
    const dx=R()*W-sx,dy=R()*H-sy,len=Math.hypot(dx,dy)||1,spd=0.16+depth*0.5;
    a.x=sx;a.y=sy;a.vx=dx/len*spd;a.vy=dy/len*spd; a.n=7+((R()*3)|0); a.verts=[];
    for(let i=0;i<a.n;i++) a.verts.push(0.72+R()*0.44);
    a.wait=now+(scatter?R()*5000:1800+R()*7000); a.active=false; }
  function buildAst(now){ const n=Math.max(3,Math.min(qlv>=1?5:7,Math.round(W/320))); ast=[];
    for(let i=0;i<n;i++){ const a={}; spawnAst(a,now,true); ast.push(a); } }

  function resize(){
    const dpr=Math.min(window.devicePixelRatio||1, Q.dprCap);
    W=innerWidth; H=innerHeight;
    cv.width=Math.round(W*dpr); cv.height=Math.round(H*dpr);
    cv.style.width=W+'px'; cv.style.height=H+'px';
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.lineJoin='round'; ctx.lineCap='round';
    const g=Math.round(Math.min(560,Math.max(340,W*0.95)));
    glow.style.width=g+'px'; glow.style.height=g+'px'; glowHalf=g/2;
    buildWaves(); buildTopo(); buildStars(); buildOrbits(); buildNodes(); buildAurora();
    buildAst(performance.now());
  }

  /* ---------- shared asteroid overlay (themed) ---------- */
  function drawAsteroids(now){ const step=dt/16, col='rgba('+c1[0]+','+c1[1]+','+c1[2]+',';
    for(const a of ast){ if(!a.active){ if(now>=a.wait) a.active=true; else continue; }
      a.x+=a.vx*step; a.y+=a.vy*step; a.rot+=a.vrot*0.01*dt; const m=a.size+30;
      if(a.x<-m||a.x>W+m||a.y<-m||a.y>H+m){ spawnAst(a,now,false); continue; }
      ctx.save(); ctx.translate(a.x,a.y); ctx.rotate(a.rot); ctx.beginPath();
      for(let i=0;i<a.n;i++){ const ang=i/a.n*Math.PI*2,r=a.size*a.verts[i],vx=Math.cos(ang)*r,vy=Math.sin(ang)*r; i?ctx.lineTo(vx,vy):ctx.moveTo(vx,vy); }
      ctx.closePath(); ctx.fillStyle=col+a.alpha.toFixed(3)+')'; ctx.fill();
      if(a.depth>0.55){ ctx.strokeStyle=col+(a.alpha*0.7).toFixed(3)+')'; ctx.lineWidth=1; ctx.stroke(); }
      ctx.restore(); } }

  /* ---------- variant: Ambient Waves (original, themed) ---------- */
  function drawWaves(){ const step=W>760?9:12, span=W+360;
    for(const r of wrows){ const c=lerpC(c1,c2,r.p), dRow=Math.abs(r.y-my);
      const boost=pActive?Math.exp(-(dRow*dRow)/(2*140*140))*0.20:0;
      const alpha=0.075+0.055*Math.sin(r.ph+time*0.6)+boost;
      ctx.strokeStyle=rgba(c,Math.max(0.02,alpha).toFixed(3)); ctx.lineWidth=1; ctx.beginPath();
      const pX=(((time*70*r.sp+r.ph*140)%span)+span)%span-180;
      for(let x=0;x<=W;x+=step){
        let y=r.y+Math.sin(x*0.008+time*r.sp+r.ph)*r.amp+Math.sin(x*0.021-time*0.7+r.ph*2)*(r.amp*0.4);
        const dp=(x-pX)/70; y+=Math.exp(-dp*dp)*Math.sin(dp*2.5+time)*24;
        if(pActive){ const dx=x-mx,dy=r.y-my,dd=(dx*dx+dy*dy)/(2*120*120); if(dd<9) y+=Math.exp(-dd)*18*Math.sin(x*0.045+time*3); }
        x===0?ctx.moveTo(x,y):ctx.lineTo(x,y);
      } ctx.stroke(); } }

  /* ---------- variant: Topographic contours ---------- */
  function tedge(id,x,y,tl,tr,br,bl,L){ const t=(a,b)=>{ const d=b-a; return Math.abs(d)<1e-6?0.5:(L-a)/d; };
    if(id===0) return [x+topoCell*t(tl,tr),y];
    if(id===1) return [x+topoCell,y+topoCell*t(tr,br)];
    if(id===2) return [x+topoCell*t(bl,br),y+topoCell];
    return [x,y+topoCell*t(tl,bl)]; }
  function drawTopo(){ const W1=topoCols+1, ox=time*0.06, oy=-time*0.045, S=0.0032, NL=Q.nlev;
    for(let j=0;j<=topoRows;j++){ const py=j*topoCell, sy=py*S+oy;
      for(let i=0;i<=topoCols;i++){ const px=i*topoCell; let n=fbm(px*S+ox,sy);
        if(pActive){ const dx=px-mx,dy=py-my,d2=dx*dx+dy*dy; if(d2<230400) n+=0.42*Math.exp(-d2/51200); }
        topoField[j*W1+i]=n; } }
    for(let k=0;k<NL;k++){ const L=0.14+0.78*k/(NL-1), p=k/(NL-1), c=lerpC(c1,c2,p); ctx.beginPath();
      for(let j=0;j<topoRows;j++) for(let i=0;i<topoCols;i++){
        const tl=topoField[j*W1+i],tr=topoField[j*W1+i+1],br=topoField[(j+1)*W1+i+1],bl=topoField[(j+1)*W1+i];
        let idx=0; if(tl>L)idx|=8; if(tr>L)idx|=4; if(br>L)idx|=2; if(bl>L)idx|=1;
        const seg=SEG[idx]; if(!seg) continue; const x=i*topoCell,y=j*topoCell;
        for(let sgi=0;sgi<seg.length;sgi+=2){ const a=tedge(seg[sgi],x,y,tl,tr,br,bl,L),b=tedge(seg[sgi+1],x,y,tl,tr,br,bl,L);
          ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); } }
      ctx.strokeStyle=rgba(c,(0.06+0.10*p).toFixed(3)); ctx.lineWidth=k===NL-1?1.4:1; ctx.stroke(); } }

  /* ---------- variant: Starfield (parallax + twinkle) ---------- */
  function drawStars(animate){ const cx=W/2,cy=H/2, ox=pActive?-(mx-cx):0, oy=pActive?-(my-cy):0;
    for(const s of stars){ if(animate){ s.y+=s.sp*(dt/16)*0.4; if(s.y>H+4){ s.y=-4; s.x=R()*W; } }
      const par=0.012+s.z*0.05, x=s.x+ox*par, y=s.y+oy*par;
      const tw=0.5+0.5*Math.sin(time*1.6+s.tw), a=(0.22+0.6*s.z)*(0.45+0.55*tw), c=lerpC([228,230,240],c2,s.z*0.55);
      ctx.fillStyle=rgba(c,a.toFixed(3));
      if(s.r<1){ ctx.fillRect(x,y,1.2,1.2); }
      else { ctx.beginPath(); ctx.arc(x,y,s.r,0,6.283); ctx.fill(); } } }

  /* ---------- variant: Orbits (tilted rings + planets) ---------- */
  function drawOrbits(animate){ const cx=W/2+(pActive?(mx-W/2)*0.03:0), cy=H/2+(pActive?(my-H/2)*0.03:0);
    let g=ctx.createRadialGradient(cx,cy,0,cx,cy,64); g.addColorStop(0,rgba(c1,0.16)); g.addColorStop(1,rgba(c1,0));
    ctx.fillStyle=g; ctx.beginPath(); ctx.arc(cx,cy,64,0,6.283); ctx.fill();
    const lite=Q.liteDots;
    for(const ring of orings){ const c=lerpC(c1,c2,ring.mix);
      ctx.strokeStyle=rgba(c,0.12); ctx.lineWidth=1; ctx.beginPath(); ctx.ellipse(cx,cy,ring.rad,ring.rad*ring.tilt,0,0,6.283); ctx.stroke();
      for(const pl of ring.planets){ if(animate) pl.ang+=pl.spd*(dt/16)*0.008;
        const x=cx+Math.cos(pl.ang)*ring.rad, y=cy+Math.sin(pl.ang)*ring.rad*ring.tilt;
        if(lite){ ctx.fillStyle=rgba(c,0.26); ctx.beginPath(); ctx.arc(x,y,pl.size*2.4,0,6.283); ctx.fill(); }
        else { const gp=ctx.createRadialGradient(x,y,0,x,y,pl.size*4); gp.addColorStop(0,rgba(c,0.5)); gp.addColorStop(1,rgba(c,0));
          ctx.fillStyle=gp; ctx.beginPath(); ctx.arc(x,y,pl.size*4,0,6.283); ctx.fill(); }
        ctx.fillStyle=rgba(c,0.9); ctx.beginPath(); ctx.arc(x,y,pl.size,0,6.283); ctx.fill(); } } }

  /* ---------- variant: Constellation (batched link web) ---------- */
  function drawConstellation(animate){ const maxD=W<760?120:150, maxD2=maxD*maxD, N=nodes.length;
    if(animate) for(const p of nodes){ p.x+=p.vx*(dt/16); p.y+=p.vy*(dt/16);
      if(p.x<0){p.x=0;p.vx*=-1;} if(p.x>W){p.x=W;p.vx*=-1;} if(p.y<0){p.y=0;p.vy*=-1;} if(p.y>H){p.y=H;p.vy*=-1;} }
    for(let b=0;b<4;b++) cbuf[b].length=0;
    for(let i=0;i<N;i++){ const a=nodes[i];
      for(let j=i+1;j<N;j++){ const b=nodes[j], dx=a.x-b.x, dy=a.y-b.y, d2=dx*dx+dy*dy;
        if(d2<maxD2){ let bi=((1-Math.sqrt(d2)/maxD)*4)|0; if(bi>3)bi=3; const buf=cbuf[bi]; buf.push(a.x,a.y,b.x,b.y); } } }
    ctx.lineWidth=1;
    for(let b=0;b<4;b++){ const buf=cbuf[b]; if(!buf.length) continue;
      ctx.strokeStyle=rgba(c1,cAlpha[b]); ctx.beginPath();
      for(let k=0;k<buf.length;k+=4){ ctx.moveTo(buf[k],buf[k+1]); ctx.lineTo(buf[k+2],buf[k+3]); } ctx.stroke(); }
    if(pActive){ const cr=maxD*1.5, cr2=cr*cr; ctx.strokeStyle=rgba(c2,0.3); ctx.beginPath(); let any=false;
      for(const p of nodes){ const dx=p.x-mx,dy=p.y-my,d2=dx*dx+dy*dy;
        if(d2<cr2){ ctx.moveTo(p.x,p.y); ctx.lineTo(mx,my); any=true;
          if(animate){ p.vx+=(mx-p.x)*0.00004*dt; p.vy+=(my-p.y)*0.00004*dt; const sp=Math.hypot(p.vx,p.vy); if(sp>0.85){p.vx*=0.85/sp;p.vy*=0.85/sp;} } } }
      if(any) ctx.stroke(); }
    ctx.fillStyle=rgba(c2,0.55); ctx.beginPath();
    for(const p of nodes){ ctx.moveTo(p.x+1.5,p.y); ctx.arc(p.x,p.y,1.5,0,6.283); } ctx.fill(); }

  /* ---------- variant: Aurora (soft additive ribbons) ---------- */
  function drawAurora(){ ctx.globalCompositeOperation='lighter'; const step=W>760?14:22;
    for(const bd of abands){ const c=lerpC(c1,c2,bd.mix);
      const midY=bd.y+Math.sin(time*bd.sp+bd.ph)*40+(pActive?(my-bd.y)*0.03:0);
      const grad=ctx.createLinearGradient(0,midY-100,0,midY+100);
      grad.addColorStop(0,rgba(c,0)); grad.addColorStop(0.5,rgba(c,0.09)); grad.addColorStop(1,rgba(c,0));
      ctx.fillStyle=grad; ctx.beginPath(); let first=true;
      for(let x=0;x<=W;x+=step){ let y=midY+Math.sin(x*0.004+time*bd.sp+bd.ph)*bd.amp;
        if(pActive){ const dp=(x-mx)/170; y+=Math.exp(-dp*dp)*Math.sin(time*2+x*0.01)*26; }
        y-=70; if(first){ ctx.moveTo(x,y); first=false; } else ctx.lineTo(x,y); }
      for(let x=W;x>=0;x-=step){ let y=midY+Math.sin(x*0.004+time*bd.sp+bd.ph)*bd.amp;
        if(pActive){ const dp=(x-mx)/170; y+=Math.exp(-dp*dp)*Math.sin(time*2+x*0.01)*26; }
        y+=70; ctx.lineTo(x,y); }
      ctx.closePath(); ctx.fill(); }
    ctx.globalCompositeOperation='source-over'; }

  function render(style,animate){
    switch(style){
      case 'topo': drawTopo(); break;
      case 'starfield': drawStars(animate); break;
      case 'orbits': drawOrbits(animate); break;
      case 'constellation': drawConstellation(animate); break;
      case 'aurora': drawAurora(); break;
      default: drawWaves();
    }
  }

  const ct={v:0};
  function frame(now,animate){
    dt=Math.min(33,(now-last)||16); last=now;
    if(animate) time+=dt*0.001;
    mx+=(tx-mx)*0.09; my+=(ty-my)*0.09;
    const P=prefs();
    if(pActive){ glow.style.opacity=1; glow.style.transform='translate('+(mx-glowHalf)+'px,'+(my-glowHalf)+'px)'; }
    else glow.style.opacity=0;
    if(--ct.v<=0){ readTheme(); ct.v=18; }
    ctx.clearRect(0,0,W,H);
    render(P.bgStyle||'waves', animate);
    if(P.asteroids && animate) drawAsteroids(now);
  }

  /* ---------- adaptive downgrade if a device can't hold framerate ---------- */
  let accum=0,cnt=0,warm=0;
  function adapt(){
    if(qlv>=2) return;
    if(warm<40){ warm++; return; }           // ignore startup / first paints
    accum+=dt; if(++cnt<50) return;
    const avg=accum/cnt; accum=0; cnt=0;
    if(avg>27){ qlv++; Q=calcQ(); resize(); warm=0; }   // sustained <~37fps -> step down
  }

  let lastDraw=0;
  function loop(now){ requestAnimationFrame(loop);
    if(reduced){ if(now-lastDraw<220) return; lastDraw=now; frame(now,false); return; }
    if(Q.frameMin && now-lastDraw < Q.frameMin) return;
    lastDraw=now; frame(now,true); adapt();
  }

  addEventListener('resize',resize,{passive:true});
  addEventListener('pointermove',e=>{tx=e.clientX;ty=e.clientY;pActive=true;},{passive:true});
  addEventListener('touchmove',e=>{const c=e.touches[0];if(c){tx=c.clientX;ty=c.clientY;pActive=true;}},{passive:true});
  addEventListener('touchstart',e=>{const c=e.touches[0];if(c){tx=c.clientX;ty=c.clientY;mx=c.clientX;my=c.clientY;pActive=true;}},{passive:true});

  readTheme(); resize();
  requestAnimationFrame(n=>{ last=n; requestAnimationFrame(loop); });
})();
