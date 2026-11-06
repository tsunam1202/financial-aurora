/* Read-only cutout multiview animation; independent BOM explorer. */
(() => {
'use strict';
const scriptBase = new URL('.', document.currentScript.src);
const asset = n => window.AuroraAssetURL(`vehicle/view-${String(n).padStart(2,'0')}.png`);
const carAsset = n => window.AuroraAssetURL(`vehicle/cutout-${n}.png`);
// Horizontal camera order only: left front -> left -> rear -> right -> front.
const turns=[1033,1030,1040,1035,1029,1036,1031,1034,1041,1028];
const visuals={BR:{image:7,overlay:25,label:'制动盘、卡钳与液压管路',scale:1.55},MO:{image:10,overlay:20,label:'电驱与高压连接部件',scale:1.55},FR:{image:2,overlay:17,label:'单体壳与车身结构',scale:1.25},EL:{image:9,overlay:18,label:'电子控制与低压部件',scale:1.9},MS:{image:1,overlay:1,label:'整车装配示意',scale:1.05},ST:{image:6,overlay:26,label:'方向盘、转向柱与转向机构',scale:1.7},SU:{image:5,overlay:24,label:'悬架摇臂、推杆与减振器',scale:1},WT:{image:12,overlay:23,label:'轮胎与轮辋总成',scale:1.45}};
const names={BR:'制动系统',MO:'电机与传动',FR:'车架与车身',EL:'电子系统',MS:'杂项与装配',ST:'转向系统',SU:'悬架系统',WT:'轮辋与轮胎'};
const money=n=>Number.isFinite(n)?new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY',minimumFractionDigits:2,maximumFractionDigits:2}).format(n):'未填';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const systems=()=>window.AuroraBOM?.systems()||[], total=()=>window.AuroraBOM?.total();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let carInstance,bomInstance,pixelPromise;
function pixelsReady(){
 if(window.AuroraVehiclePixels)return Promise.resolve(window.AuroraVehiclePixels);
 if(!pixelPromise)pixelPromise=new Promise((resolve,reject)=>{const s=document.createElement('script');s.src=new URL('vehicle-pixels.js',scriptBase).href;s.onload=()=>resolve(window.AuroraVehiclePixels);s.onerror=()=>reject(Error('像素数据未加载'));document.head.append(s)});
 return pixelPromise;
}
const decoded=new Map();
function frame(n){
 if(decoded.has(n))return decoded.get(n);
 const raw=window.AuroraVehiclePixels?.frames[String(n)];if(!raw)return null;
 const bytes=Uint8Array.from(atob(raw.pixels),c=>c.charCodeAt(0)),pos=new Float32Array(raw.count*2),color=new Float32Array(raw.count*4);
 for(let i=0;i<raw.count;i++){const j=i*8;pos[i*2]=(bytes[j]+bytes[j+1]*256+.5)/raw.width;pos[i*2+1]=(bytes[j+2]+bytes[j+3]*256+.5)/raw.height;for(let k=0;k<4;k++)color[i*4+k]=bytes[j+4+k]/255}
 const f={pos,color,count:raw.count,width:raw.width,height:raw.height};decoded.set(n,f);return f;
}
const ease=t=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t)};
// Contact points calibrated against the 1920 x 1080 transparent renders.
// Physical tyre order stays FL, FR, RR, RL, so adjacent views share a footprint.
// The lighter points are occluded tyres; this is an inferred studio floor,
// not a claimed ray-traced shadow from unavailable 3D geometry.
const groundViews={
 1033:{p:[[1055,867],[660,755],[1201,692],[1596,804]],v:[1,.38,.38,1],r:63},
 1030:{p:[[690,852],[690,780],[1535,780],[1535,854]],v:[1,.28,.28,1],r:47},
 1040:{p:[[475,833],[1120,757],[1647,877],[1002,953]],v:[1,.35,1,1],r:64},
 1035:{p:[[461,837],[1159,787],[1587,886],[889,936]],v:[1,.35,1,1],r:65},
 1029:{p:[[580,815],[1340,815],[1434,950],[486,950]],v:[.25,.25,1,1],r:72},
 1036:{p:[[729,782],[1425,829],[995,923],[299,876]],v:[.35,1,1,1],r:65},
 1031:{p:[[1230,780],[1230,846],[384,846],[384,780]],v:[.28,1,1,.28],r:47},
 1034:{p:[[1325,760],[841,874],[295,811],[779,697]],v:[.35,1,1,.35],r:63},
 1041:{p:[[1378,795],[644,908],[265,802],[999,689]],v:[1,1,1,.35],r:65},
 1028:{p:[[1398,915],[521,915],[600,800],[1320,800]],v:[1,1,.25,.25],r:72}
};
function makeGroundShadow(canvas){
 const ctx=canvas.getContext('2d',{alpha:true});
 let W=1,H=1,dpr=1,snapshot={enabled:!!ctx,from:turns[0],to:turns[0],progress:0,draws:0,contacts:[],softness:1,opacity:1,bounds:{x:0,y:0,width:1,height:1}};
 const mix=(a,b,t)=>a+(b-a)*t;
 function ellipse(x,y,rx,ry,opacity){
  if(rx<=0||ry<=0)return;ctx.save();ctx.translate(x,y);ctx.scale(rx,ry);
  const g=ctx.createRadialGradient(0,0,0,0,0,1);g.addColorStop(0,`rgba(25,28,36,${opacity})`);g.addColorStop(.35,`rgba(25,28,36,${opacity*.66})`);g.addColorStop(1,'rgba(25,28,36,0)');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,1,0,Math.PI*2);ctx.fill();ctx.restore();
 }
 function polygon(points,blur,opacity,dx=0,dy=0){
  ctx.save();ctx.filter=`blur(${blur}px)`;ctx.fillStyle=`rgba(29,31,39,${opacity})`;ctx.beginPath();points.forEach((p,i)=>i?ctx.lineTo(p[0]+dx,p[1]+dy):ctx.moveTo(p[0]+dx,p[1]+dy));ctx.closePath();ctx.fill();ctx.restore();
 }
 return {
  resize(w,h,r){W=w;H=h;dpr=Math.min(r,2);canvas.width=Math.ceil(w*dpr);canvas.height=Math.ceil(h*dpr);if(ctx)ctx.setTransform(dpr,0,0,dpr,0,0)},
  draw(from,to,progress){
   if(!ctx)return;const a=groundViews[from],b=groundViews[to];if(!a||!b)return;
   const t=ease(progress),spread=from===to?0:Math.sin(Math.PI*progress),strength=1-.28*spread,softness=1+.05*spread;
   const w=Math.min(W,H*16/9),h=w*9/16,ox=(W-w)/2,oy=(H-h)/2,scale=w/1920;
   const points=a.p.map((p,i)=>[mix(p[0],b.p[i][0],t),mix(p[1],b.p[i][1],t)]);
   const p=points.map(q=>[ox+q[0]*scale,oy+q[1]*scale]);
   const front=[(p[0][0]+p[1][0])/2,(p[0][1]+p[1][1])/2],rear=[(p[3][0]+p[2][0])/2,(p[3][1]+p[2][1])/2];
   const frontAcross=[(p[0][0]-p[1][0])/2,(p[0][1]-p[1][1])/2],rearAcross=[(p[3][0]-p[2][0])/2,(p[3][1]-p[2][1])/2];
   // Perspective ground plane, narrower than the tyre track. Fixed screen-space
   // light offsets remain consistent while the car footprint changes heading.
   const plane=(along,across)=>[mix(rear[0],front[0],along)+mix(rearAcross[0],frontAcross[0],along)*across,mix(rear[1],front[1],along)+mix(rearAcross[1],frontAcross[1],along)*across];
   const body=[plane(-.10,-.55),plane(.80,-.61),plane(1.42,-.17),plane(1.42,.17),plane(.80,.61),plane(-.10,.55)];
   const frontWing=[plane(1.36,-1.08),plane(1.58,-1.08),plane(1.58,1.08),plane(1.36,1.08)];
   const rearWing=[plane(-.24,-.90),plane(-.08,-.90),plane(-.08,.90),plane(-.24,.90)];
   ctx.clearRect(0,0,W,H);
   polygon(body,Math.max(1.3,23*scale)*softness,.14*strength,20*scale,13*scale);
   polygon(frontWing,Math.max(1,14*scale)*softness,.10*strength,9*scale,6*scale);
   polygon(rearWing,Math.max(1.4,29*scale)*softness,.085*strength,30*scale,17*scale);
   polygon(body,Math.max(.7,9*scale)*softness,.13*strength,0,3*scale);
   for(let i=0;i<4;i++){
    const visibility=mix(a.v[i],b.v[i],t),radius=mix(a.r,b.r,t)*scale;
    ellipse(p[i][0]+4*scale,p[i][1]+3*scale,radius*1.45*softness,25*scale*softness,.21*strength*visibility);
    ellipse(p[i][0],p[i][1]+1.5*scale,radius*.79,8.5*scale,.48*strength*visibility);
   }
   snapshot={enabled:true,from,to,progress,draws:snapshot.draws+1,contacts:points.map(p=>[p[0]/1920,p[1]/1080]),softness,opacity:strength,bounds:{x:ox,y:oy,width:w,height:h}};
  },
  state:()=>({...snapshot,contacts:snapshot.contacts.map(p=>p.slice()),bounds:{...snapshot.bounds}}),
  destroy(){if(ctx)ctx.clearRect(0,0,W,H);canvas.width=canvas.height=1}
 };
}
const random=i=>{const x=Math.sin(i*127.1+311.7)*43758.5453123;return x-Math.floor(x)};
function element(input){return typeof input==='string'?document.querySelector(input):input}
function hidden(root){return document.hidden||!root.isConnected||!!root.closest('[hidden],[inert]')||!!document.querySelector('dialog[open]')||(root.closest('.dashboard-slide')&&!root.closest('.dashboard-slide').classList.contains('is-active'))}
function shader(gl,type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(s);gl.deleteShader(s);throw Error(message)}return s}
const vertexSource=`
precision highp float;
attribute vec2 aFrom;attribute vec2 aTo;attribute vec4 aColorFrom;attribute vec4 aColorTo;attribute vec4 aSeed;
uniform vec2 uViewport;uniform vec4 uBounds;uniform float uProgress;uniform float uPixel;uniform float uDirection;
varying vec4 vColor;
float ease(float t){t=clamp(t,0.,1.);return t*t*(3.-2.*t);}
void main(){
 float t=clamp((uProgress-aSeed.w*.045)/(1.-aSeed.w*.045),0.,1.);
 float blend=ease(t),spread=pow(sin(t*3.14159265),1.65);
 vec2 point=(mix(aFrom,aTo,blend)-.5)*uBounds.zw;
 point+=aSeed.xy*vec2(uBounds.z*.115,uBounds.w*.19)*spread;
 float z=aSeed.z*uBounds.z*.21*spread;
 float angle=sin(t*3.14159265)*.17*uDirection;
 float px=point.x*cos(angle)-z*sin(angle);z=point.x*sin(angle)+z*cos(angle);
 float perspective=900./(900.+z);
 vec2 screen=uBounds.xy+uBounds.zw*.5+vec2(px,point.y)*perspective;
 gl_Position=vec4(screen.x/uViewport.x*2.-1.,1.-screen.y/uViewport.y*2.,0.,1.);
 gl_PointSize=max(.85,uPixel*(1.16-.24*spread)*perspective);
 vColor=mix(aColorFrom,aColorTo,ease((t-.25)/.5));vColor.a*=1.-spread*.08;
}`;
const fragmentSource=`precision mediump float;varying vec4 vColor;void main(){gl_FragColor=vColor;}`;
function makeRenderer(canvas,forceCanvas=false){
 let gl=null;
 if(!forceCanvas)try{gl=canvas.getContext('webgl',{alpha:true,antialias:false,depth:false,stencil:false,premultipliedAlpha:true,preserveDrawingBuffer:true,powerPreference:'low-power'})}catch{}
 if(gl)try{
  const program=gl.createProgram(),vs=shader(gl,gl.VERTEX_SHADER,vertexSource),fs=shader(gl,gl.FRAGMENT_SHADER,fragmentSource);gl.attachShader(program,vs);gl.attachShader(program,fs);gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.deleteShader(vs);gl.deleteShader(fs);gl.useProgram(program);
  const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);const attrs=[['aFrom',2,0],['aTo',2,2],['aColorFrom',4,4],['aColorTo',4,8],['aSeed',4,12]];for(const [name,size,offset]of attrs){const loc=gl.getAttribLocation(program,name);gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,size,gl.FLOAT,false,64,offset*4)}
  const uniforms={};for(const name of ['uViewport','uBounds','uProgress','uPixel','uDirection'])uniforms[name]=gl.getUniformLocation(program,name);
  gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);gl.disable(gl.DEPTH_TEST);gl.clearColor(0,0,0,0);
  let count=0,W=1,H=1,dpr=1,pixelWidth=384;
  return{kind:'webgl',canvas,get count(){return count},prepare(a,b){count=Math.max(a.count,b.count);pixelWidth=a.width;const values=new Float32Array(count*16);for(let i=0;i<count;i++){const ai=Math.floor(i/count*a.count),bi=Math.floor(i/count*b.count),j=i*16;values[j]=a.pos[ai*2];values[j+1]=a.pos[ai*2+1];values[j+2]=b.pos[bi*2];values[j+3]=b.pos[bi*2+1];values.set(a.color.subarray(ai*4,ai*4+4),j+4);values.set(b.color.subarray(bi*4,bi*4+4),j+8);values[j+12]=random(i+11)*2-1;values[j+13]=random(i+67)*2-1;values[j+14]=random(i+113)*2-1;values[j+15]=random(i+191)}gl.bufferData(gl.ARRAY_BUFFER,values,gl.STATIC_DRAW)},resize(w,h,r){W=w;H=h;dpr=r;canvas.width=Math.ceil(W*r);canvas.height=Math.ceil(H*r);gl.viewport(0,0,canvas.width,canvas.height)},draw(t,direction){const w=Math.min(W,H*16/9),h=w*9/16;gl.clear(gl.COLOR_BUFFER_BIT);gl.uniform2f(uniforms.uViewport,W,H);gl.uniform4f(uniforms.uBounds,(W-w)/2,(H-h)/2,w,h);gl.uniform1f(uniforms.uProgress,t);gl.uniform1f(uniforms.uPixel,w/pixelWidth*dpr);gl.uniform1f(uniforms.uDirection,direction);gl.drawArrays(gl.POINTS,0,count)},clear(){gl.clear(gl.COLOR_BUFFER_BIT)},destroy(){gl.deleteBuffer(buffer);gl.deleteProgram(program)},info(){const ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):'WebGL'}};
 }catch{gl=null;const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement}
 const ctx=canvas.getContext('2d',{alpha:true});let W=1,H=1,count=0,tiles=[];
 if(!ctx)return{kind:'image',canvas,count:0,prepare(){},resize(){},draw(){},clear(){},destroy(){},info:()=> 'Static image fallback'};
 return{kind:'canvas',canvas,get count(){return count},prepare(a,b){count=Math.min(2200,Math.max(a.count,b.count));tiles=Array.from({length:count},(_,i)=>{const ai=Math.floor(i/count*a.count),bi=Math.floor(i/count*b.count);return{a:[a.pos[ai*2],a.pos[ai*2+1]],b:[b.pos[bi*2],b.pos[bi*2+1]],ca:`rgba(${a.color[ai*4]*255},${a.color[ai*4+1]*255},${a.color[ai*4+2]*255},${a.color[ai*4+3]})`,cb:`rgba(${b.color[bi*4]*255},${b.color[bi*4+1]*255},${b.color[bi*4+2]*255},${b.color[bi*4+3]})`,sx:random(i+11)*2-1,sy:random(i+67)*2-1,sz:random(i+113)*2-1}})},resize(w,h,r){W=w;H=h;canvas.width=Math.ceil(w*r);canvas.height=Math.ceil(h*r);ctx.setTransform(r,0,0,r,0,0)},draw(t){ctx.clearRect(0,0,W,H);const w=Math.min(W,H*16/9),h=w*9/16,ox=(W-w)/2,oy=(H-h)/2,v=ease(t),spread=Math.sin(t*Math.PI),size=Math.max(1.2,w/150);for(const p of tiles){const z=p.sz*w*.16*spread,persp=900/(900+z),x=(p.a[0]+(p.b[0]-p.a[0])*v-.5+p.sx*.10*spread)*w*persp,y=(p.a[1]+(p.b[1]-p.a[1])*v-.5+p.sy*.16*spread)*h*persp;ctx.fillStyle=t<.5?p.ca:p.cb;ctx.fillRect(ox+w*.5+x,oy+h*.5+y,size,size)}},clear(){ctx.clearRect(0,0,W,H)},destroy(){},info:()=> 'Canvas2D fallback, 2200 tiles maximum'};
}
function mount(container){
 const root=element(container);if(!root)return null;if(carInstance?.root===root&&root.querySelector('.vehicle-showcase'))return carInstance;carInstance?.destroy();
 root.innerHTML=`<section class="vehicle-showcase" aria-label="赛车多视角环绕展示"><header class="vehicle-heading"><div><span class="vehicle-kicker">AURORA ENGINEERING</span><h3>整车环绕展示</h3></div><span class="vehicle-orbit-badge">AR-26</span></header><div class="vehicle-stage" role="img" aria-label="赛车多视角环绕动画"><span class="vehicle-aura"></span><canvas class="vehicle-ground-shadow" aria-hidden="true"></canvas><img class="vehicle-render is-front" src="${carAsset(turns[0])}" alt="Aurora 赛车左前视角" decoding="async"><canvas class="vehicle-pixels" aria-hidden="true"></canvas></div><div class="vehicle-caption"><div><span class="vehicle-cost-label">整车源表已计价合计</span><strong class="vehicle-cost">${money(total())}</strong></div><span class="vehicle-image-label">多视角环绕</span></div><footer class="vehicle-controls"><span class="vehicle-basis">每一份投入，都驶向赛场。</span><div><button type="button" data-vehicle="previous" aria-label="上一个视角" title="上一个视角">‹</button><button type="button" data-vehicle="pause" aria-label="暂停环绕" title="暂停环绕">Ⅱ</button><button type="button" data-vehicle="next" aria-label="下一个视角" title="下一个视角">›</button></div></footer></section>`;
 const stage=root.querySelector('.vehicle-stage'),panel=root.querySelector('.vehicle-showcase'),image=stage.querySelector('img');let renderer=makeRenderer(stage.querySelector('.vehicle-pixels'));const groundShadow=makeGroundShadow(stage.querySelector('.vehicle-ground-shadow'));
 let index=0,nextIndex=1,direction=1,playing=!reduced.matches,visible=true,destroyed=false,raf=0,lastNow=0,hold=0,progress=0,transition=false,manualTransition=false,ready=false,preparing=false,W=1,H=1,dpr=1,job=0;
 const duration=1750,rest=650,loaded=new Map(),pending=new Map(),measurements={draws:[],shadowDraws:[],intervals:[],prepare:[],renderedFrames:0};
 function record(list,value){list.push(value);if(list.length>600)list.shift()}
 function load(n){if(pending.has(n))return pending.get(n);const im=new Image();im.decoding='async';im.src=carAsset(n);loaded.set(n,im);const promise=im.decode().catch(()=>new Promise((resolve,reject)=>{if(im.complete)return im.naturalWidth?resolve():reject(Error('车辆素材不可用'));im.onload=resolve;im.onerror=reject}));pending.set(n,promise);return promise}
 function controls(){const b=root.querySelector('[data-vehicle="pause"]');b.textContent=playing?'Ⅱ':'▶';b.title=playing?'暂停环绕':'播放环绕';b.setAttribute('aria-label',b.title);panel.classList.toggle('is-paused',!playing||hidden(root));stage.dataset.view=String(turns[index]);stage.dataset.phase=transition?(progress<.5?'disperse':'assemble'):'hold';stage.dataset.renderer=renderer.kind}
 function metadata(){root.querySelector('.vehicle-cost').textContent=money(total());root.querySelector('.vehicle-cost-label').textContent=window.AuroraBOM?.exportState().planActive?'整车方案测算合计':'整车源表已计价合计';controls()}
 function paint(){const start=performance.now();renderer.draw(progress,direction);const shadowStart=performance.now();groundShadow.draw(turns[index],turns[nextIndex],progress);record(measurements.shadowDraws,performance.now()-shadowStart);record(measurements.draws,performance.now()-start);measurements.renderedFrames++}
 function resize(){const b=stage.getBoundingClientRect();W=Math.max(1,b.width);H=Math.max(1,b.height);dpr=Math.min(devicePixelRatio||1,2);renderer.resize(W,H,dpr);groundShadow.resize(W,H,dpr);if(transition)paint();else groundShadow.draw(turns[index],turns[index],0)}
 function runnable(){return !destroyed&&ready&&visible&&!hidden(root)&&!reduced.matches&&(playing||manualTransition)}
 function wake(){if(raf||!runnable())return;lastNow=0;raf=requestAnimationFrame(tick)}
 function settle(){index=nextIndex;transition=false;manualTransition=false;progress=0;hold=0;image.src=carAsset(turns[index]);image.alt=`Aurora 赛车环绕视角 ${index+1}`;stage.classList.remove('is-pixel-transition');renderer.clear();groundShadow.draw(turns[index],turns[index],0);controls()}
 async function start(delta=1,manual=false){
  if(transition||preparing)return;nextIndex=(index+delta+turns.length)%turns.length;direction=delta;const token=++job;preparing=true;
  try{await load(turns[nextIndex]);if(destroyed||token!==job)return;
   if(reduced.matches||!ready||renderer.kind==='image'){settle();return}
   const a=frame(turns[index]),b=frame(turns[nextIndex]);if(!a||!b){settle();return}
   const before=performance.now();renderer.prepare(a,b);record(measurements.prepare,performance.now()-before);transition=true;manualTransition=manual;progress=0;stage.classList.add('is-pixel-transition');paint();controls();wake();
  }catch{root.querySelector('.vehicle-image-label').textContent='多视角展示';hold=0}finally{preparing=false}
 }
 function tick(now){
  raf=0;if(!runnable()){lastNow=0;controls();return}
  const dt=lastNow?Math.min(80,now-lastNow):0;lastNow=now;
  if(transition){if(dt)record(measurements.intervals,dt);progress=Math.min(1,progress+dt/duration);paint();stage.dataset.phase=progress<.5?'disperse':'assemble';if(progress>=1)settle()}
  else if(!preparing){hold+=dt;if(hold>=rest)start(1)}
  if(runnable())raf=requestAnimationFrame(tick);
 }
 function click(e){const action=e.target.closest('[data-vehicle]')?.dataset.vehicle;if(action==='pause'){playing=!playing;manualTransition=false;controls();wake()}if(action==='previous'||action==='next'){if(transition)settle();start(action==='next'?1:-1,true)}}
 function key(e){if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();if(transition)settle();start(e.key==='ArrowRight'?1:-1,true)}}
 root.addEventListener('click',click);stage.tabIndex=0;stage.addEventListener('keydown',key);
 const observer=new IntersectionObserver(e=>{visible=e[0]?.isIntersecting??true;wake()},{threshold:.05});observer.observe(root);
 const sizeObserver=new ResizeObserver(resize);sizeObserver.observe(stage);
 const visibility=()=>{controls();wake()};document.addEventListener('visibilitychange',visibility);
 const mutation=new MutationObserver(visibility);for(let e=root.parentElement;e;e=e.parentElement)mutation.observe(e,{attributes:true,attributeFilter:['class','hidden','inert']});for(const d of document.querySelectorAll('dialog'))mutation.observe(d,{attributes:true,attributeFilter:['open']});
 const motion=()=>{playing=!reduced.matches;if(transition)settle();controls();wake()};reduced.addEventListener('change',motion);
 function lost(e){e.preventDefault();const previous=renderer;const replacement=previous.canvas.cloneNode(false);previous.canvas.replaceWith(replacement);renderer=makeRenderer(replacement,true);if(transition){renderer.prepare(frame(turns[index]),frame(turns[nextIndex]))}resize();controls();wake()}
 renderer.canvas.addEventListener('webglcontextlost',lost);
 const data=()=>setTimeout(()=>!destroyed&&metadata(),0);document.addEventListener('aurora:bom-change',data);
 Promise.all([pixelsReady(),load(turns[0]),load(turns[1])]).then(()=>{if(destroyed)return;frame(turns[0]);frame(turns[1]);ready=true;wake();(async()=>{for(const n of turns.slice(2)){if(destroyed)return;await load(n).catch(()=>{});frame(n);await new Promise(resolve=>setTimeout(resolve,25))}})()}).catch(()=>{ready=true;root.querySelector('.vehicle-image-label').textContent='多视角展示';wake()});resize();metadata();
 carInstance={root,refresh:metadata,reset(){job++;preparing=false;index=0;nextIndex=0;settle();wake()},state:()=>({mode:'car',systemId:null,index,playing,image:String(turns[index]),total:total(),phase:transition?(progress<.5?'disperse':'assemble'):'hold',progress,particleCount:renderer.count,ready,renderer:renderer.kind,decodedViews:[...loaded.values()].filter(im=>im.complete&&im.naturalWidth>0).length,renderedFrames:measurements.renderedFrames,shadow:groundShadow.state()}),performance:()=>({...measurements,renderer:renderer.kind,device:renderer.info()}),destroy(){destroyed=true;job++;cancelAnimationFrame(raf);observer.disconnect();sizeObserver.disconnect();mutation.disconnect();renderer.destroy();groundShadow.destroy();renderer.canvas.removeEventListener('webglcontextlost',lost);root.removeEventListener('click',click);stage.removeEventListener('keydown',key);reduced.removeEventListener('change',motion);document.removeEventListener('visibilitychange',visibility);document.removeEventListener('aurora:bom-change',data)}};return carInstance;
}
function mountBOM(container){
 const root=element(container);if(!root)return null;if(bomInstance?.root===root&&root.querySelector('.bom-explorer'))return bomInstance;bomInstance?.destroy();
 const panel=root.closest('.bom-panel'),body=panel?.querySelector('.bom-body');
 let active=false,index=0,overlay=false,playing=!reduced.matches,last=performance.now(),raf=0,destroyed=false;
 root.innerHTML=`<section class="bom-explorer" aria-label="BOM系统部件展示"><div class="bom-explorer-focus"><header class="bom-explorer-head"><div><h3></h3></div><button type="button" data-bom-explorer="close" title="返回完整成本环图">返回环图 ↗</button></header><div class="bom-focus-chart"><svg class="bom-focus-ring" viewBox="0 0 160 160" role="group" aria-label="整车成本构成，选择系统查看"></svg></div><div class="bom-explorer-summary"><div><small>源表成本</small><strong></strong></div></div></div><button type="button" class="bom-explorer-image" data-bom-explorer="overlay"><img alt="" decoding="async"><span>查看整车位置 ↗</span></button><div class="bom-explorer-tabs"></div><footer><div><button type="button" data-bom-explorer="previous" aria-label="上一个系统">‹</button><button type="button" data-bom-explorer="pause" aria-label="暂停系统轮播">Ⅱ</button><button type="button" data-bom-explorer="next" aria-label="下一个系统">›</button></div></footer></section>`;
 root.hidden=true;
 const current=()=>systems()[index];
 function renderFocusChart(rows,selected,grandTotal){
  const svg=root.querySelector('.bom-focus-ring'),radius=62,circumference=2*Math.PI*radius;let offset=0;
  const arcs=rows.map(row=>{const value=Number.isFinite(row.total)&&row.total>0?row.total:0,fraction=grandTotal>0?value/grandTotal:0,length=fraction*circumference,gap=Math.min(2,length*.2),on=row.id===selected.id;const label=`${row.name} ${money(row.total)}，占比 ${(fraction*100).toFixed(1)}%`;const out=`<circle class="bom-focus-sector${on?' is-active':''}" data-bom-explorer-id="${esc(row.id)}" data-bom-focus-id="${esc(row.id)}" data-amount="${value}" data-fraction="${fraction}" role="button" tabindex="0" aria-pressed="${on}" aria-label="${esc(label)}" cx="80" cy="80" r="${radius}" fill="none" stroke="${on?esc(row.color||'#702d8d'):'#d6d0e2'}" stroke-opacity="${on?1:.43}" stroke-width="${on?20:17}" stroke-dasharray="${Math.max(0,length-gap)} ${Math.max(0,circumference-length+gap)}" stroke-dashoffset="${-offset-gap/2}" transform="rotate(-90 80 80)"><title>${esc(label)}</title></circle>`;offset+=length;return out}).join('');
  const percentage=grandTotal>0?selected.total/grandTotal*100:0;
  svg.innerHTML=`<circle cx="80" cy="80" r="62" fill="none" stroke="#eeeaf4" stroke-width="17"/>${arcs}<text class="bom-focus-percent" x="80" y="86" text-anchor="middle">${percentage.toFixed(1)}%</text>`;
  svg.setAttribute('aria-label',`整车成本构成，共 ${rows.length} 个系统；当前 ${selected.name}，占比 ${percentage.toFixed(1)}%`);
  root.querySelector('.bom-focus-chart').dataset.total=String(grandTotal);
 }
 function render(){
  const rows=systems(),s=rows[index];if(!s)return;const v=visuals[s.id]||visuals.MS,grandTotal=total();
  root.querySelector('h3').textContent=s.name;root.querySelector('.bom-explorer-summary strong').textContent=money(s.total);root.querySelector('.bom-explorer-summary small').textContent=window.AuroraBOM?.exportState().planActive?'方案成本':'源表成本';renderFocusChart(rows,s,grandTotal);
  const img=root.querySelector('img');img.src=asset(overlay?v.overlay:v.image);img.alt=s.name+' · '+v.label;img.style.setProperty('--component-scale',overlay?1:v.scale);root.querySelector('.bom-explorer-image').title=`${v.label}；显示金额为${s.name}系统合计`;root.querySelector('.bom-explorer-image span').textContent=overlay?'单独查看部件 ↗':'查看整车位置 ↗';
  root.querySelector('.bom-explorer-tabs').innerHTML=rows.map((r,i)=>`<button type="button" data-bom-explorer-id="${esc(r.id)}" aria-pressed="${i===index}" title="${esc(r.name)}">${esc(names[r.id]||r.name)}</button>`).join('');root.dataset.system=s.id;const pause=root.querySelector('[data-bom-explorer="pause"]');pause.textContent=playing?'Ⅱ':'▶';pause.setAttribute('aria-label',playing?'暂停系统轮播':'播放系统轮播');
 }
 function selectSystem(id){const rows=systems();const next=typeof id==='number'?id:rows.findIndex(r=>r.id===id||r.name===id);if(next<0||next>=rows.length)return false;index=next;active=true;overlay=true;last=performance.now();root.hidden=false;if(body)body.hidden=true;panel?.classList.add('is-bom-exploring');render();return true}
 function close(){active=false;root.hidden=true;if(body)body.hidden=false;panel?.classList.remove('is-bom-exploring');document.dispatchEvent(new Event('aurora:bom-explorer-close'))}
 function step(delta){selectSystem((index+delta+systems().length)%Math.max(1,systems().length))}
 function click(e){const id=e.target.closest('[data-bom-explorer-id]')?.dataset.bomExplorerId;if(id){selectSystem(id);return}const action=e.target.closest('[data-bom-explorer]')?.dataset.bomExplorer;if(action==='close')close();if(action==='previous')step(-1);if(action==='next')step(1);if(action==='overlay'){overlay=!overlay;last=performance.now();render()}if(action==='pause'){playing=!playing;last=performance.now();render()}}
 root.addEventListener('click',click);
 function key(e){const sector=e.target.closest('[data-bom-focus-id]');if(sector&&['Enter',' '].includes(e.key)){e.preventDefault();const id=sector.dataset.bomFocusId;selectSystem(id);root.querySelector(`[data-bom-focus-id="${id}"]`)?.focus();return}if(e.key==='Escape')close();if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();step(e.key==='ArrowRight'?1:-1);if(sector)root.querySelector('.bom-focus-sector.is-active')?.focus()}}root.addEventListener('keydown',key);
 function tick(now){if(destroyed)return;if(!active||hidden(root)||!playing||reduced.matches)last=now;else if(now-last>4800)step(1);raf=requestAnimationFrame(tick)}
 const data=()=>setTimeout(()=>{if(active&&!destroyed)render()},0);document.addEventListener('aurora:bom-change',data);raf=requestAnimationFrame(tick);
 bomInstance={root,selectSystem,reset:close,refresh:()=>{if(active)render()},state:()=>({active,index,systemId:active?current()?.id:null,total:active?current()?.total:null,playing,overlay}),destroy(){destroyed=true;cancelAnimationFrame(raf);root.removeEventListener('click',click);root.removeEventListener('keydown',key);document.removeEventListener('aurora:bom-change',data)}};return bomInstance;
}
function openFromChart(e){if(!bomInstance)return;const hit=e.target.closest('#home [data-suite-bom],#home #bomChart,#home .donut-wrap');if(!hit)return;if(e.type==='keydown'&&!['Enter',' '].includes(e.key))return;e.preventDefault();e.stopImmediatePropagation();bomInstance.selectSystem(hit.dataset.suiteBom!==undefined?Number(hit.dataset.suiteBom):0)}
window.addEventListener('click',openFromChart,true);window.addEventListener('keydown',openFromChart,true);
window.AuroraVehicle=Object.freeze({mount,mountBOM,selectSystem:id=>bomInstance?.selectSystem(id),reset:()=>carInstance?.reset(),resetBOM:()=>bomInstance?.reset(),refresh:()=>{carInstance?.refresh();bomInstance?.refresh()},state:()=>carInstance?.state(),performance:()=>carInstance?.performance(),bomState:()=>bomInstance?.state(),assets:{turns:[...turns],systems:structuredClone(visuals)}});
})();

