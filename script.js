'use strict';

// Planetary impact: educational visualisation, not a hydrodynamic impact solver.
const $ = id => document.getElementById(id);
const ui = {
  designer: $('designer-view'), setup: $('impact-setup-view'), container: $('simulation-container'),
  pColor: $('p_color'), pDiameter: $('p_diameter'), pAtmosphere: $('p_atmosphere'), pType: $('p_type'),
  confirm: $('confirm-planet-btn'), earth: $('default-earth-btn'), start: $('start-button'),
  size: $('size'), speed: $('speed'), angle: $('angle'), target: $('target-name'),
  overlay: $('data-overlay'), report: $('impact-report'), restart: $('restart-button'),
  altitude: $('altitude-val'), velocity: $('velocity-val')
};
const R = 10;
const EARTH_DIAMETER_KM = 12742;
const rhoImpactor = 3000; // kg/m^3 (illustrative stony asteroid)
const constants = { G: 6.67430e-11, J_PER_MT: 4.184e15 };
const clamp = (x,a,b) => Math.min(b,Math.max(a,x));
const config = { planet: { type:'earth', color:'#4682b4', diameter:EARTH_DIAMETER_KM, atmosphere:10 },
                 impactor: { size:500, speed:25, angle:45 } };
let scene, camera, renderer, controls, planet, clouds, atmosphere, meteor, halo, shockwave, flash;
let trajectory, impactNormal, stars;
let started = false, state = 'idle', progress = 0, elapsed = 0, impactAge = 0, lastFrame = 0;
const clock = new THREE.Clock();
let particles = [];

function show(view) {
  ui.designer.style.display = view === 'designer' ? 'flex' : 'none';
  ui.setup.style.display = view === 'setup' ? 'flex' : 'none';
  ui.overlay.style.display = view === 'simulation' ? 'block' : 'none';
  ui.restart.style.display = view === 'simulation' ? 'flex' : 'none';
}
function disposeObject(obj) {
  if (!obj) return;
  obj.parent?.remove(obj);
  obj.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
  });
}
function init() {
  if (typeof THREE === 'undefined') { alert('Three.js failed to load. Check your connection.'); return; }
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x020611);
  renderer = new THREE.WebGLRenderer({ antialias:true, alpha:false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  ui.container.appendChild(renderer.domElement);
  camera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, .1, 1500);
  camera.position.set(0,18,42);
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minDistance = 14;
  controls.maxDistance = 150;
  scene.add(new THREE.AmbientLight(0x657baf, 0.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.55);
  sun.position.set(-35, 20, 40);
  scene.add(sun);
  createStars();
  window.addEventListener('resize', resize);
  show('designer');
  requestAnimationFrame(tick);
}
function createStars() {
  const n=1800, data = new Float32Array(n*3);
  for(let i=0; i<n; i++) {
    const theta=Math.acos(2*Math.random()-1), phi=2*Math.PI*Math.random(), r=280+Math.random()*450;
    data[i*3]=r*Math.sin(theta)*Math.cos(phi);
    data[i*3+1]=r*Math.sin(theta)*Math.sin(phi);
    data[i*3+2]=r*Math.cos(theta);
  }
  const g=new THREE.BufferGeometry(); g.setAttribute('position',new THREE.BufferAttribute(data,3));
  stars=new THREE.Points(g,new THREE.PointsMaterial({color:0xb7d6ff,size:0.85,sizeAttenuation:false}));
  scene.add(stars);
}
function createPlanet() {
  disposeObject(planet); disposeObject(clouds); disposeObject(atmosphere);
  const p=config.planet;
  const colors={rocky:p.color,gaseous:'#c79b70',icy:'#bedffd',lava:'#d44a18',earth:'#4b8bcb'};
  const color=colors[p.type] || p.color;
  const mat = new THREE.MeshStandardMaterial({color,roughness:p.type==='icy'?.62:.91,metalness:0.0});
  const sphere=new THREE.SphereGeometry(R,96,64);
  planet=new THREE.Mesh(sphere,mat); scene.add(planet);
  // Earth map is an optional enhancement: the simulation still works if it cannot load.
  if(p.type==='earth') {
    new THREE.TextureLoader().load('https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg', tex=>{
      if (planet && planet.material===mat) { mat.map=tex; mat.color.set('#ffffff'); mat.needsUpdate=true; }
      else tex.dispose();
    }, undefined, ()=>{});
  }
  if(p.type==='earth' || p.atmosphere>0) {
    const a=clamp(p.atmosphere,0,100);
    atmosphere=new THREE.Mesh(new THREE.SphereGeometry(R+0.20+0.015*a,64,48),
      new THREE.MeshBasicMaterial({color:p.type==='earth'?0x4d9fff:0x82cfff,transparent:true,opacity:.035 + a*.0011,side:THREE.BackSide,depthWrite:false}));
    scene.add(atmosphere);
  }
  controls.target.set(0,0,0); controls.update();
}
function readPlanet() {
  const diameter=Number(ui.pDiameter.value), atmosphereDensity=Number(ui.pAtmosphere.value);
  if(!Number.isFinite(diameter) || diameter<1000 || diameter>50000 ||
     !Number.isFinite(atmosphereDensity) || atmosphereDensity<0 || atmosphereDensity>100) {
    alert('Enter a planet diameter between 1,000 and 50,000 km and atmosphere value between 0 and 100.'); return false;
  }
  config.planet={type:ui.pType.value,color:ui.pColor.value,diameter,atmosphere:atmosphereDensity};
  return true;
}
function readImpactor() {
  config.impactor = {size:Number(ui.size.value),speed:Number(ui.speed.value),angle:Number(ui.angle.value)};
}
function makeTrajectory() {
  // An incidence angle is measured above the local horizontal. For 90° the path is radial.
  const angle=THREE.MathUtils.degToRad(config.impactor.angle);
  impactNormal=new THREE.Vector3(0.88,0.08,0.47).normalize();
  const tangent=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),impactNormal).normalize();
  const inward=impactNormal.clone().multiplyScalar(-Math.sin(angle)).addScaledVector(tangent,Math.cos(angle)).normalize();
  const hit=impactNormal.clone().multiplyScalar(R);
  const start=hit.clone().addScaledVector(inward,-34);
  // Straight-line trajectory through space to the point of contact.
  trajectory={start,hit,inward};
  return start;
}
function createMeteor() {
  disposeObject(meteor);
  const radius=clamp((config.impactor.size/1000)/config.planet.diameter*2*R,0.16,1.3);
  meteor=new THREE.Group();
  const core=new THREE.Mesh(new THREE.DodecahedronGeometry(radius,2),
    new THREE.MeshStandardMaterial({color:0x94887d,roughness:1,flatShading:true}));
  meteor.add(core);
  halo=new THREE.Mesh(new THREE.SphereGeometry(radius*1.45,20,12),
    new THREE.MeshBasicMaterial({color:0xff8b33,transparent:true,opacity:0,depthWrite:false,blending:THREE.AdditiveBlending}));
  meteor.add(halo);
  meteor.position.copy(makeTrajectory());
  scene.add(meteor);
}
function resetEffects() {
  disposeObject(shockwave); disposeObject(flash); shockwave=null;flash=null;
  particles.forEach(disposeObject);particles=[];
  ui.report.style.display='none';
  impactAge=0;
}
function start() {
  if(started && state==='approach') return;
  readImpactor(); createPlanet(); createMeteor();resetEffects();
  started=true; state='approach'; progress=0; elapsed=0;
  camera.position.set(0,18,42); controls.target.set(0,0,0);
  ui.altitude.textContent='--';ui.velocity.textContent=config.impactor.speed.toFixed(1);
  show('simulation');
}
function estimatedEnergy() {
  const {size,speed,angle}=config.impactor;
  const m=rhoImpactor * Math.PI/6*Math.pow(size,3);
  const joules=0.5*m*Math.pow(speed*1000,2);
  // Illustrative power-law scaling; not site calibrated or physically validated.
  const craterKm = 1.3*Math.pow(joules/constants.J_PER_MT,0.29)*Math.pow(Math.sin(angle*Math.PI/180),1/3);
  return {joules,mt:joules/constants.J_PER_MT,craterKm};
}
function impact() {
  state='impact'; impactAge=0;
  disposeObject(meteor);meteor=null;
  const pos=impactNormal.clone().multiplyScalar(R+0.03);
  shockwave=new THREE.Mesh(new THREE.RingGeometry(0.05,0.20,72),
    new THREE.MeshBasicMaterial({color:0xffb665,transparent:true,opacity:1,side:THREE.DoubleSide,depthWrite:false}));
  shockwave.position.copy(pos); shockwave.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),impactNormal);
  scene.add(shockwave);
  flash=new THREE.PointLight(0xffa04a,0,50); flash.position.copy(pos);scene.add(flash);
  for(let i=0;i<32;i++) {
    const bead=new THREE.Mesh(new THREE.IcosahedronGeometry(.045+Math.random()*.085,0),
      new THREE.MeshBasicMaterial({color:i%2?0xffa64b:0xf7dba8,transparent:true,opacity:1}));
    bead.position.copy(pos);
    const dir=new THREE.Vector3(Math.random()-.5,Math.random()-.5,Math.random()-.5).addScaledVector(impactNormal,1).normalize();
    bead.userData.velocity=dir.multiplyScalar(3+Math.random()*7);
    scene.add(bead);particles.push(bead);
  }
  const e=estimatedEnergy();
  ui.report.innerHTML=`<h2>Impact Analysis</h2>
    <p>Energy <span>${e.joules.toExponential(2)} J</span></p>
    <p>Equivalent <span>${e.mt.toFixed(1)} Mt TNT</span></p>
    <p>Illustrative crater <span>${e.craterKm.toFixed(2)} km</span></p>
    <small>Idealized solid-body collision. No fragmentation, ablation, detailed atmosphere or validated crater model.</small>`;
  ui.report.style.display='block';
  ui.altitude.textContent='0';
}
function tick() {
  requestAnimationFrame(tick);
  if(!renderer) return;
  const dt=Math.min(clock.getDelta(),0.05);
  if(state==='approach' && meteor) {
    elapsed+=dt;
    // The input velocity controls playback speed. Visible distance is not a real-world timescale.
    const duration=clamp(9*25/config.impactor.speed,3.1,16);
    progress=clamp(elapsed/duration,0,1);
    const eased=progress*progress*(3-2*progress);
    meteor.position.copy(trajectory.start).lerp(trajectory.hit,eased);
    meteor.rotation.x+=dt*.95;meteor.rotation.y+=dt*.6;
    const kmPerUnit=config.planet.diameter/(2*R);
    const altitude=Math.max(0,meteor.position.length()-R)*kmPerUnit;
    ui.altitude.textContent=altitude.toFixed(0);
    if(halo) {
      const atmoKm=clamp(config.planet.atmosphere,0,100)*3.0+35;
      const glow=config.planet.type==='earth' || config.planet.atmosphere>0 ? clamp(1-altitude/atmoKm,0,1) : 0;
      halo.material.opacity=.55*glow;
    }
    if(progress>=1) impact();
  }
  if(state==='impact') {
    impactAge+=dt;
    if(shockwave) { const k=1+impactAge*22;shockwave.scale.set(k,k,k);shockwave.material.opacity=Math.max(0,1-impactAge/1.8); }
    if(flash) flash.intensity=30*Math.exp(-impactAge*4);
    particles.forEach(p=>{p.position.addScaledVector(p.userData.velocity,dt);p.userData.velocity.multiplyScalar(Math.exp(-1.5*dt));p.material.opacity=Math.max(0,1-impactAge/2.5);});
    if(impactAge>3.2){disposeObject(shockwave);shockwave=null; if(flash){scene.remove(flash);flash.dispose();flash=null;}particles.forEach(disposeObject);particles=[];state='complete';}
  }
  if(planet) planet.rotation.y+=dt*0.015;
  controls.update();renderer.render(scene,camera);
}
function resize(){if(!camera||!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
ui.confirm.addEventListener('click',()=>{if(readPlanet()){ui.target.textContent=`Custom ${config.planet.type} planet`;show('setup');}});
ui.earth.addEventListener('click',()=>{config.planet={type:'earth',color:'#4682b4',diameter:EARTH_DIAMETER_KM,atmosphere:10};ui.target.textContent='Earth';show('setup');});
ui.start.addEventListener('click',start);
ui.restart.addEventListener('click',()=>{resetEffects();disposeObject(meteor);meteor=null;disposeObject(planet);planet=null;disposeObject(atmosphere);atmosphere=null;state='idle';started=false;show('setup');});
[['size','size-label',v=>v<1000?`${v} m`:`${(v/1000).toFixed(1)} km`],['speed','speed-label',v=>`${v} km/s`],['angle','angle-label',v=>`${v}°`]].forEach(([id,label,format])=>ui[id].addEventListener('input',e=>$(label).textContent=format(Number(e.target.value))));
init();
