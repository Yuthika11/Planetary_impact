// --- Global 3D and State Variables ---
let scene, camera, renderer, controls, meteor, plasmaSheath;
let planet, atmosphere, clouds; // Unified planet objects
let particles = { trail: [] };
let cameraShake = { active: false, intensity: 0, decay: 0.95 };
let simState = { running: false, stage: 'idle', frameCount: 0, progress: 0 };
let animationId;
let audio = { noise: null, impact: null };
let craterDecals = { lava: null, scorch: null };
let trajectory;

// --- Planet and Impactor Configuration ---
let planetConfig = {};
let impactorConfig = {};

// --- Texture URLs ---
const TEXTURES = {
    EARTH_MAP: 'https://threejs.org/examples/textures/planets/earth_atmos_2048.jpg',
    EARTH_BUMP: 'https://threejs.org/examples/textures/planets/earth_topology_512.jpg',
    EARTH_SPECULAR: 'https://threejs.org/examples/textures/planets/earth_specular_2048.jpg',
    CLOUDS: 'https://threejs.org/examples/textures/planets/earth_clouds_1024.png',
    LAVA: "https://threejs.org/examples/textures/lava/lavatile.jpg",
    ICY_BASE_MAP: "https://threejs.org/examples/textures/planets/earth_ice_4096.jpg",
    SPACE_PX: 'https://threejsfundamentals.org/threejs/resources/images/cubemaps/space/px.jpg',
    SPACE_NX: 'https://threejsfundamentals.org/threejs/resources/images/cubemaps/space/nx.jpg',
    SPACE_PY: 'https://threejsfundamentals.org/threejs/resources/images/cubemaps/space/py.jpg',
    SPACE_NY: 'https://threejsfundamentals.org/threejs/resources/images/cubemaps/space/ny.jpg',
    SPACE_PZ: 'https://threejsfundamentals.org/threejs/resources/images/cubemaps/space/pz.jpg',
    SPACE_NZ: 'https://threejsfundamentals.org/threejs/resources/images/cubemaps/space/nz.jpg'
};

// --- UI Element References ---
const ui = {
    designerView: document.getElementById('designer-view'),
    impactSetupView: document.getElementById('impact-setup-view'),
    simulationContainer: document.getElementById('simulation-container'),
    
    // Designer inputs
    pColor: document.getElementById('p_color'),
    pDiameter: document.getElementById('p_diameter'),
    pAtmosphere: document.getElementById('p_atmosphere'),
    pType: document.getElementById('p_type'),
    confirmPlanetBtn: document.getElementById('confirm-planet-btn'),
    defaultEarthBtn: document.getElementById('default-earth-btn'),
    
    // Impactor inputs
    startBtn: document.getElementById('start-button'),
    sizeSlider: document.getElementById('size'),
    speedSlider: document.getElementById('speed'),
    angleSlider: document.getElementById('angle'),
    targetName: document.getElementById('target-name'),

    // Simulation overlays
    restartBtn: document.getElementById('restart-button'),
    dataOverlay: document.getElementById('data-overlay'),
    impactReport: document.getElementById('impact-report'),
    altitudeVal: document.getElementById('altitude-val'),
    velocityVal: document.getElementById('velocity-val')
};

// --- Initial Setup and Scene Initialization ---
function init() {
    scene = new THREE.Scene();
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    ui.simulationContainer.appendChild(renderer.domElement);

    camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(-30, 20, 50);

    controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    const sunLight = new THREE.DirectionalLight(0xfffde8, 1.2);
    sunLight.position.set(50, 20, 30);
    scene.add(sunLight);
    scene.add(new THREE.AmbientLight(0x404040, 0.5));

    const cubeLoader = new THREE.CubeTextureLoader();
    scene.background = cubeLoader.load([TEXTURES.SPACE_PX, TEXTURES.SPACE_NX, TEXTURES.SPACE_PY, TEXTURES.SPACE_NY, TEXTURES.SPACE_PZ, TEXTURES.SPACE_NZ]);
    
    window.addEventListener('resize', onWindowResize);
    animate();
}

// --- Planet Creation Logic (Adapted from Designer) ---
function createPlanet(config) {
    const radius = 10; // Use a fixed radius for the simulation scene
    const geometry = new THREE.SphereGeometry(radius, 128, 128);
    const loader = new THREE.TextureLoader();
    let material;
    
    // Default Earth case
    if (config.type === 'earth') {
        material = new THREE.MeshPhongMaterial({
            map: loader.load(TEXTURES.EARTH_MAP),
            bumpMap: loader.load(TEXTURES.EARTH_BUMP),
            bumpScale: 0.05,
            specularMap: loader.load(TEXTURES.EARTH_SPECULAR),
            specular: new THREE.Color('grey'),
            shininess: 8
        });
        planet = new THREE.Mesh(geometry, material);
        
        // Atmosphere
        const atmoGeo = new THREE.SphereGeometry(radius + 0.25, 128, 128);
        const atmoMat = new THREE.ShaderMaterial({ vertexShader: `varying vec3 vNormal; void main() { vNormal = normalize( normalMatrix * normal ); gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`, fragmentShader: `varying vec3 vNormal; void main() { float intensity = pow( 0.5 - dot( vNormal, vec3( 0, 0, 1.0 ) ), 4.0 ); gl_FragColor = vec4( 0.5, 0.7, 1.0, 1.0 ) * intensity; }`, blending: THREE.AdditiveBlending, side: THREE.BackSide, transparent: true });
        atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
        scene.add(atmosphere);

        // Clouds
        const cloudGeo = new THREE.SphereGeometry(radius + 0.05, 128, 128);
        const cloudMat = new THREE.MeshPhongMaterial({ map: loader.load(TEXTURES.CLOUDS), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending });
        clouds = new THREE.Mesh(cloudGeo, cloudMat);
        scene.add(clouds);

    } else { // Custom designed planet
        material = new THREE.MeshStandardMaterial({ color: config.color, roughness: 0.7, metalness: 0.1 });
        
        switch (config.type) {
            case "rocky":
                material.map = loader.load(TEXTURES.EARTH_MAP);
                material.color.multiply(new THREE.Color(0x444444));
                break;
            case "gaseous":
                const gasTexture = loader.load(TEXTURES.LAVA);
                gasTexture.wrapS = gasTexture.wrapT = THREE.RepeatWrapping;
                gasTexture.repeat.set(4, 4);
                material.map = gasTexture;
                material.emissive = new THREE.Color(config.color).multiplyScalar(0.2);
                break;
            case "icy":
                material.map = loader.load(TEXTURES.ICY_BASE_MAP);
                material.roughness = 0.1;
                material.metalness = 0.8;
                material.emissive = new THREE.Color(0xaaeeff).multiplyScalar(0.15);
                break;
            case "lava":
                const lavaTexture = loader.load(TEXTURES.LAVA);
                lavaTexture.wrapS = lavaTexture.wrapT = THREE.RepeatWrapping;
                material.map = lavaTexture;
                material.emissiveMap = lavaTexture;
                material.emissive = new THREE.Color(0xff4500);
                material.emissiveIntensity = 0.8;
                break;
        }
        planet = new THREE.Mesh(geometry, material);

        // Custom atmosphere
        if (config.atmosphere > 0) {
            const atmoRadius = radius * (1.0 + (config.atmosphere / 200));
            const atmoGeo = new THREE.SphereGeometry(atmoRadius, 64, 64);
            const atmoMat = new THREE.MeshBasicMaterial({ color: 0x00aaff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, side: THREE.BackSide });
            atmosphere = new THREE.Mesh(atmoGeo, atmoMat);
            scene.add(atmosphere);
        }
    }
    
    scene.add(planet);
    controls.target.copy(planet.position);
}


// --- Main Simulation Logic (Adapted from Impactor) ---
function startFinalSimulation() {
    // --- Step 1: Create the target planet based on config ---
    createPlanet(planetConfig);

    // --- Step 2: Set up the impactor and trajectory ---
    const impactPoint = new THREE.Vector3(10, 0, 0); // Simplified impact point
    const entryAngle = THREE.MathUtils.degToRad(impactorConfig.angle);
    const startDistance = 50;
    
    const normal = impactPoint.clone().normalize();
    const tangent = new THREE.Vector3().crossVectors(normal, new THREE.Vector3(0,1,0)).normalize();
    const entryDirection = tangent.clone().applyAxisAngle(normal, Math.PI * 2 * Math.random()).multiplyScalar(Math.cos(entryAngle)).add(normal.clone().multiplyScalar(-Math.sin(entryAngle)));
    const startPoint = impactPoint.clone().add(entryDirection.clone().multiplyScalar(-startDistance));
    const controlPoint = new THREE.Vector3().addVectors(startPoint, impactPoint).multiplyScalar(0.5);
    controlPoint.add(controlPoint.clone().normalize().multiplyScalar(-15));
    trajectory = new THREE.QuadraticBezierCurve3(startPoint, controlPoint, impactPoint);

    const meteorGeo = new THREE.DodecahedronGeometry(1, 2);
    // (Meteor mesh roughening logic)
    const meteorMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.8, metalness: 0.2 });
    meteor = new THREE.Mesh(meteorGeo, meteorMat);
    const meteorSize = impactorConfig.size / 10000;
    meteor.scale.set(meteorSize, meteorSize, meteorSize);
    scene.add(meteor);

    const plasmaGeo = new THREE.SphereGeometry(1.2, 16, 16);
    const plasmaMat = new THREE.MeshBasicMaterial({ color: 0xffa500, transparent: true, opacity: 0, blending: THREE.AdditiveBlending });
    plasmaSheath = new THREE.Mesh(plasmaGeo, plasmaMat);
    meteor.add(plasmaSheath);

    // --- Step 3: Initialize audio and start simulation state ---
    simState.running = true;
    simState.stage = 'approach';

    Tone.start();
    audio.noise = new Tone.Noise("brown").toDestination();
    audio.noise.volume.value = -60;
    audio.impact = new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 10, oscillator: { type: "sine" }, envelope: { attack: 0.001, decay: 0.8, sustain: 0.01, release: 2 } }).toDestination();
}


// --- Animation Loop ---
function animate() {
    animationId = requestAnimationFrame(animate);
    simState.frameCount++;

    controls.update();
    
    // Rotate planet and clouds if they exist
    if (planet) planet.rotation.y += 0.0005;
    if (clouds) clouds.rotation.y += 0.0007;
    if (atmosphere) atmosphere.rotation.y += 0.0005;

    // Meteor movement and effects logic...
    if (simState.running && simState.stage !== 'impact') {
        const speed = impactorConfig.speed / 4000;
        simState.progress = Math.min(1, simState.progress + speed);
        const newPos = trajectory.getPoint(simState.progress);
        meteor.position.copy(newPos);
        const tangent = trajectory.getTangent(simState.progress);
        if(tangent.length() > 0) meteor.lookAt(newPos.clone().add(tangent));
        
        const distance = meteor.position.distanceTo(planet.position);
        const altitude = Math.max(0, (distance - 10) * 637.1); // Assuming 10 units = planet radius
        ui.altitudeVal.textContent = altitude.toFixed(0);
        ui.velocityVal.textContent = impactorConfig.speed;

        if (distance < 10.3 && simState.stage === 'approach') {
            simState.stage = 'entry';
            audio.noise.start();
            audio.noise.volume.rampTo(-20, 1);
        }

        if (simState.stage === 'entry') {
            plasmaSheath.material.opacity = Math.min(0.9, plasmaSheath.material.opacity + 0.02);
            plasmaSheath.scale.multiplyScalar(1.03);
        }

        if (simState.progress >= 1) { onImpact(); }
    }
    
    // Camera shake logic...
     if (cameraShake.active && !controls.autoRotate) {
         const shake = new THREE.Vector3((Math.random() - 0.5) * cameraShake.intensity, (Math.random() - 0.5) * cameraShake.intensity, (Math.random() - 0.5) * cameraShake.intensity);
         camera.position.add(shake);
         cameraShake.intensity *= cameraShake.decay;
         if (cameraShake.intensity < 0.01) cameraShake.active = false;
    }
    
    renderer.render(scene, camera);
}


// --- Impact Event and Analysis ---
function onImpact() {
    simState.stage = 'impact';
    
    // (Calculation and UI update logic from impactor script)
    const mass = 1500 * (4/3) * Math.PI * Math.pow(impactorConfig.size / 2, 3);
    const velocity = impactorConfig.speed * 1000;
    const kineticEnergy = 0.5 * mass * Math.pow(velocity, 2);
    const megatons = kineticEnergy / 4.184e15;
    const craterDiameterKm = (25 * Math.pow(megatons, 1/3.4)) / 1000;

    ui.impactReport.innerHTML = `<h2>Impact Analysis</h2><p>Impact Energy (J): <span>${kineticEnergy.toExponential(2)}</span></p><p>Impact Energy (MT): <span>${megatons.toFixed(2)}</span></p><p>Est. Crater Diameter: <span>${craterDiameterKm.toFixed(2)} km</span></p>`;
    ui.impactReport.style.display = 'block';
    
    audio.noise.stop();
    audio.impact.triggerAttackRelease("C1", "2n");
    
    if(meteor && meteor.parent) scene.remove(meteor);

    cameraShake.active = true;
    cameraShake.intensity = (Math.log10(kineticEnergy) / 5) * 0.5;
    
    setTimeout(() => { ui.restartBtn.style.display = 'flex'; }, 3000);
}


// --- Event Listeners for UI Flow ---
function transitionView(hideView, showView) {
    hideView.style.opacity = '0';
    setTimeout(() => {
        hideView.style.display = 'none';
        showView.style.display = 'flex';
        showView.style.opacity = '1';
    }, 500);
}

ui.defaultEarthBtn.addEventListener('click', () => {
    planetConfig = { type: 'earth' };
    ui.targetName.textContent = 'Default Earth';
    transitionView(ui.designerView, ui.impactSetupView);
});

ui.confirmPlanetBtn.addEventListener('click', () => {
    planetConfig = {
        type: ui.pType.value,
        color: ui.pColor.value,
        diameter: parseFloat(ui.pDiameter.value),
        atmosphere: parseFloat(ui.pAtmosphere.value)
    };
    ui.targetName.textContent = `Custom ${ui.pType.value.charAt(0).toUpperCase() + ui.pType.value.slice(1)} Planet`;
    transitionView(ui.designerView, ui.impactSetupView);
});

ui.startBtn.addEventListener('click', () => {
    impactorConfig = {
        size: parseFloat(ui.sizeSlider.value),
        speed: parseFloat(ui.speedSlider.value),
        angle: parseFloat(ui.angleSlider.value)
    };
    transitionView(ui.impactSetupView, {}); // Hide only
    setTimeout(() => {
        ui.dataOverlay.style.display = 'block';
        startFinalSimulation();
    }, 500);
});

// Impactor slider labels
ui.sizeSlider.addEventListener('input', e => { document.getElementById('size-label').textContent = e.target.value < 1000 ? `${e.target.value} m` : `${(e.target.value/1000).toFixed(1)} km`; });
ui.speedSlider.addEventListener('input', e => { document.getElementById('speed-label').textContent = `${e.target.value} km/s`; });
ui.angleSlider.addEventListener('input', e => { document.getElementById('angle-label').textContent = `${e.target.value}°`; });

// General Listeners
ui.restartBtn.addEventListener('click', () => location.reload());
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Initialize the application ---
init();