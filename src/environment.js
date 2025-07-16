// environment.js
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';

export let terrainMesh;
export let oceanMesh;

// Export updateMinimapAircraft at top level (will be assigned later)
export let updateMinimapAircraft;

export function setupEnvironment(scene) {
  scene.background = new THREE.Color(0xcce0ff);
  scene.fog = new THREE.Fog(0xcce0ff, 1000, 50000);

  const manager = new THREE.LoadingManager();
  const loader = new THREE.TextureLoader(manager);

  const diffuseMap = loader.load('/himalaya_diffuse.jpg');
  const waterNormals = loader.load('/waternormals.jpg');

  diffuseMap.encoding = THREE.sRGBEncoding;
  diffuseMap.wrapS = diffuseMap.wrapT = THREE.RepeatWrapping;
  diffuseMap.repeat.set(50, 50);

  waterNormals.encoding = THREE.LinearEncoding;
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;

  const createWaterPatch = (x, z, size = 3000, y = 10, sunPos) => {
    const waterGeom = new THREE.PlaneGeometry(size, size);
    const water = new Water(waterGeom, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: waterNormals,
      sunDirection: sunPos.clone().normalize(),
      sunColor: 0xffffff,
      waterColor: 0x001e0f,
      distortionScale: 3.7,
      fog: true,
    });
    water.rotation.x = -Math.PI / 2;
    water.position.set(x, y, z);
    scene.add(water);
    return water;
  };

  manager.onLoad = () => {
    const sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);

    const sunPos = new THREE.Vector3();
    const uniforms = sky.material.uniforms;
    uniforms.turbidity.value = 10;
    uniforms.rayleigh.value = 2;
    uniforms.mieCoefficient.value = 0.005;
    uniforms.mieDirectionalG.value = 0.8;
    sunPos.setFromSphericalCoords(1, THREE.MathUtils.degToRad(60), THREE.MathUtils.degToRad(180));
    uniforms.sunPosition.value.copy(sunPos);

    const width = 50000;
    const depth = 50000;
    const segments = 256;
    const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
    const noise = new ImprovedNoise();
    const scale = 0.0005;
    const heightScale = 3000;
    const octaves = 5;
    const persistence = 0.5;
    const lacunarity = 2.0;
    const vertices = geometry.attributes.position.array;

    // --- Realistic mountain generation ---
    // Generate base elevation with layered noise
    const baseElevationFn = (x, y) => {
      let elevation = 0;
      let frequency = scale * 0.5;
      let amplitude = 1.5;
      for (let o = 0; o < octaves + 3; o++) {
        elevation += noise.noise(x * frequency, y * frequency, 0) * amplitude;
        frequency *= 1.7;
        amplitude *= 0.55;
      }
      return elevation;
    };

    // Generate dispersed mountain peaks with minimum distance
    const mountainPeaks = [];
    const minPeakDist = 6000;
    let attempts = 0;
    while (mountainPeaks.length < 18 && attempts < 200) {
      const angle = Math.random() * Math.PI * 2;
      const radius = 8000 + Math.random() * 12000;
      const px = Math.cos(angle) * radius + Math.random() * 4000;
      const py = Math.sin(angle) * radius + Math.random() * 4000;
      let tooClose = false;
      for (const p of mountainPeaks) {
        const d = Math.sqrt((px - p.x) ** 2 + (py - p.y) ** 2);
        if (d < minPeakDist) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        mountainPeaks.push({
          x: px,
          y: py,
          height: 2.0 + Math.random() * 1.2, // Lowered peak height
          radius: 3500 + Math.random() * 1200
        });
      }
      attempts++;
    }
    // Always add a few peaks near spawn
    mountainPeaks.push({ x: 0, y: 0, height: 2.8, radius: 4200 });
    mountainPeaks.push({ x: 4000, y: -4000, height: 2.2, radius: 3200 });
    mountainPeaks.push({ x: -4000, y: 4000, height: 2.2, radius: 3200 });

    // --- Realistic terrain height function ---
    const customTerrainHeight = (x, y) => {
      // Base elevation (broad hills/valleys)
      let elevation = baseElevationFn(x, y) * 0.5; // Lowered base
      // Add sharp peaks and ridges
      for (const peak of mountainPeaks) {
        const dist = Math.sqrt((x - peak.x) ** 2 + (y - peak.y) ** 2);
        if (dist < peak.radius) {
          const normalizedDist = dist / peak.radius;
          // Steep falloff for sharp peaks
          const weight = Math.pow(Math.max(0, Math.cos(normalizedDist * Math.PI / 2)), 2.5);
          elevation += peak.height * weight;
        }
      }
      // Add some fine noise for rocky detail
      let fineNoise = 0;
      let freq = scale * 2.5;
      let amp = 0.7;
      for (let o = 0; o < 3; o++) {
        fineNoise += noise.noise(x * freq, y * freq, 0) * amp;
        freq *= 2.2;
        amp *= 0.5;
      }
      elevation += fineNoise * 0.2; // Lowered fine noise
      // Clamp elevation to a reasonable range
      elevation = Math.max(elevation, -0.1); // Raise minimum base
      elevation = Math.min(elevation, 3.5);  // Lower max height
      return elevation;
    };

    // --- Terrain height assignment and smoothing ---
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const y = vertices[i + 1];
      vertices[i + 2] = customTerrainHeight(x, y) * 1200; // Lowered heightScale
    }
    // Smooth terrain
    const smoothed = smoothTerrain(vertices);
    for (let i = 0; i < vertices.length; i += 3) {
      vertices[i + 2] = smoothed[i + 2];
    }
    geometry.computeVertexNormals();
    geometry.attributes.position.needsUpdate = true;
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    // --- Optionally add a solid base to the mesh (extrude downward) ---
    // This makes the terrain visually solid from the sides if needed
    // (Uncomment if you want a solid base)
    // const baseVertices = [];
    // for (let i = 0; i < vertices.length; i += 3) {
    //   baseVertices.push(vertices[i], vertices[i + 1], -2000); // Extrude down
    // }
    // // Add faces to connect base and top (not shown for brevity)
    // // ...

    const material = new THREE.MeshStandardMaterial({
      map: diffuseMap,
      roughness: 1,
      metalness: 0,
    });

    terrainMesh = new THREE.Mesh(geometry, material);
    terrainMesh.rotation.x = -Math.PI / 2;
    terrainMesh.position.y = -200;
    terrainMesh.receiveShadow = true;
    scene.add(terrainMesh);

    const oceanGeom = new THREE.PlaneGeometry(100000, 100000);
    oceanMesh = new Water(oceanGeom, {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: waterNormals,
      sunDirection: sunPos.clone().normalize(),
      sunColor: 0xffffff,
      waterColor: 0x001e0f,
      distortionScale: 2.0,
      fog: true,
    });
    oceanMesh.rotation.x = -Math.PI / 2;
    oceanMesh.position.y = -100;
    scene.add(oceanMesh);

    createWaterPatch(0, 0, 8000, 10, sunPos);
    createWaterPatch(12000, -5000, 4000, 12, sunPos);
    createWaterPatch(-15000, 8000, 3000, 8, sunPos);

    scene.add(new THREE.GridHelper(10000, 100));
    scene.add(new THREE.AxesHelper(5000));

    // --- Minimap globals and functions (module scope) ---
    let minimap, minimapCtx;
    const minimapWidth = 120, minimapHeight = 120; // Higher res for contours
    let minimapDrawn = false;
    let minimapReady = false;
    let minimapWidthWorld = 12000; // Zoomed in
    let minimapDepthWorld = 12000;
    let minimapCustomTerrainHeight = null;
    let minimapBaseImage = null;
    let minimapCenter = { x: 0, y: 0 };

    function drawMinimapBase(centerX = 0, centerY = 0) {
      // Always redraw for new center
      const offscreen = document.createElement('canvas');
      offscreen.width = minimapWidth;
      offscreen.height = minimapHeight;
      const ctx = offscreen.getContext('2d');
      const imgData = ctx.createImageData(minimapWidth, minimapHeight);
      for (let px = 0; px < minimapWidth; px++) {
        for (let py = 0; py < minimapHeight; py++) {
          // Centered on minimapCenter
          const tx = (px / minimapWidth - 0.5) * minimapWidthWorld + centerX;
          const ty = (py / minimapHeight - 0.5) * minimapDepthWorld + centerY;
          let h = minimapCustomTerrainHeight ? minimapCustomTerrainHeight(tx, ty) : 0;
          // Normalize for color: use the same clamp as terrain
          h = Math.max(Math.min(h, 3.5), -0.1);
          // Map -0.1..3.5 to 0..1
          const norm = (h + 0.1) / (3.6);
          let shade = Math.floor(120 + 100 * norm);
          // Debug: show sea level as blue
          if (h <= 0.01) {
            imgData.data[(py * minimapWidth + px) * 4 + 0] = 60;
            imgData.data[(py * minimapWidth + px) * 4 + 1] = 100;
            imgData.data[(py * minimapWidth + px) * 4 + 2] = 180;
            imgData.data[(py * minimapWidth + px) * 4 + 3] = 255;
            continue;
          }
          // Fallback for out-of-range
          if (isNaN(shade) || shade < 0 || shade > 255) shade = 180;
          const idx = (py * minimapWidth + px) * 4;
          imgData.data[idx] = shade;
          imgData.data[idx+1] = shade;
          imgData.data[idx+2] = shade;
          imgData.data[idx+3] = 255;
        }
      }
      ctx.putImageData(imgData, 0, 0);
      // Draw mountain contours as filled shapes
      ctx.save();
      ctx.globalAlpha = 0.8;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      for (const peak of mountainPeaks) {
        // Draw contour lines for each peak
        for (let r = 0.5; r < 1.0; r += 0.2) {
          ctx.beginPath();
          for (let a = 0; a <= Math.PI * 2 + 0.1; a += 0.12) {
            const rx = peak.x + Math.cos(a) * peak.radius * r;
            const ry = peak.y + Math.sin(a) * peak.radius * r;
            // Project to minimap
            const px = Math.floor(((rx - centerX) / minimapWidthWorld + 0.5) * minimapWidth);
            const py = minimapHeight - Math.floor(((ry - centerY) / minimapDepthWorld + 0.5) * minimapHeight);
            if (a === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
        }
      }
      ctx.restore();
      minimapBaseImage = offscreen;
      minimapDrawn = true;
    }

    // --- Add a clear 3D finish line at the goal ---
    // Place a tall flag at the goal position
    const goalFlagHeight = 600;
    const goalFlag = new THREE.Group();
    const poleGeom = new THREE.CylinderGeometry(30, 30, goalFlagHeight, 16);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.7, roughness: 0.3 });
    const pole = new THREE.Mesh(poleGeom, poleMat);
    pole.position.y = goalFlagHeight / 2;
    goalFlag.add(pole);
    const flagGeom = new THREE.PlaneGeometry(180, 120);
    const flagMat = new THREE.MeshStandardMaterial({ color: 0xff2222, side: THREE.DoubleSide });
    const flag = new THREE.Mesh(flagGeom, flagMat);
    flag.position.set(90, goalFlagHeight - 60, 0);
    flag.rotation.y = Math.PI / 2;
    goalFlag.add(flag);
    // Place at mazeGoal (assume mazeGoal is defined globally)
    if (typeof mazeGoal !== 'undefined') {
      goalFlag.position.set(mazeGoal.x, 0, mazeGoal.y);
      scene.add(goalFlag);
    }

    // --- Minimap: draw a big flag for the finish line ---
    function drawMinimapStatic(centerX = 0, centerY = 0) {
      if (!minimapCtx || !minimapBaseImage) return;
      minimapCtx.clearRect(0, 0, minimapWidth, minimapHeight);
      minimapCtx.drawImage(minimapBaseImage, 0, 0);
      // Draw goal flag (if in view)
      const flagPx = Math.floor(((mazeGoal.x - centerX) / minimapWidthWorld + 0.5) * minimapWidth);
      const flagPy = minimapHeight - Math.floor(((mazeGoal.y - centerY) / minimapDepthWorld + 0.5) * minimapHeight);
      if (flagPx >= 0 && flagPx < minimapWidth && flagPy >= 0 && flagPy < minimapHeight) {
        minimapCtx.font = 'bold 24px sans-serif';
        minimapCtx.fillStyle = '#ff2222';
        minimapCtx.strokeStyle = '#fff';
        minimapCtx.lineWidth = 2;
        minimapCtx.fillText('🏁', flagPx, flagPy - 10);
        minimapCtx.strokeText('🏁', flagPx, flagPy - 10);
      }
    }

    function updateMinimapAircraftImpl(aircraft) {
      if (!minimapReady) return;
      if (!aircraft || !aircraft.position || typeof aircraft.position.x !== 'number' || typeof aircraft.position.z !== 'number') return;
      // Center minimap on aircraft chunk by chunk
      const chunkSize = 2000;
      const cx = Math.round(aircraft.position.x / chunkSize) * chunkSize;
      const cy = Math.round(aircraft.position.z / chunkSize) * chunkSize;
      if (!minimapCenter || minimapCenter.x !== cx || minimapCenter.y !== cy) {
        minimapCenter = { x: cx, y: cy };
        drawMinimapBase(cx, cy);
      }
      drawMinimapStatic(cx, cy);
      // Draw aircraft as an arrow
      const px = Math.floor(((aircraft.position.x - cx) / minimapWidthWorld + 0.5) * minimapWidth);
      const py = minimapHeight - Math.floor(((aircraft.position.z - cy) / minimapDepthWorld + 0.5) * minimapHeight);
      minimapCtx.save();
      minimapCtx.translate(px, py);
      // Aircraft heading (rotation.y is yaw in radians)
      const heading = aircraft.rotation && typeof aircraft.rotation.y === 'number' ? -aircraft.rotation.y : 0;
      minimapCtx.rotate(heading);
      minimapCtx.beginPath();
      minimapCtx.moveTo(0, -8); // Arrow tip
      minimapCtx.lineTo(-5, 6);
      minimapCtx.lineTo(0, 3);
      minimapCtx.lineTo(5, 6);
      minimapCtx.closePath();
      minimapCtx.fillStyle = '#ff3333';
      minimapCtx.shadowColor = '#fff';
      minimapCtx.shadowBlur = 4;
      minimapCtx.fill();
      minimapCtx.restore();
    }
    updateMinimapAircraft = updateMinimapAircraftImpl;

    // --- Minimap setup (inside manager.onLoad) ---
    minimapWidthWorld = 12000; // Zoomed in
    minimapDepthWorld = 12000;
    minimapCustomTerrainHeight = customTerrainHeight;
    if (!document.getElementById('minimap-canvas')) {
      minimap = document.createElement('canvas');
      minimap.id = 'minimap-canvas';
      minimap.width = minimapWidth;
      minimap.height = minimapHeight;
      minimap.className = 'minimap-canvas'; // Use CSS class only
      document.body.appendChild(minimap);
      minimapCtx = minimap.getContext('2d');
      drawMinimapBase(0, 0);
      minimapReady = true;
    }
  };
}

/**
 * Smooths the terrain by averaging each vertex's height with its neighbors.
 * @param {Float32Array} vertices - The position array from PlaneGeometry.
 * @returns {Float32Array} - The smoothed position array.
 */
function smoothTerrain(vertices) {
  // Assume vertices is a flat array [x0, y0, z0, x1, y1, z1, ...]
  const smoothed = new Float32Array(vertices.length);
  const stride = 3;
  const side = Math.round(Math.sqrt(vertices.length / stride));
  for (let i = 0; i < vertices.length; i += stride) {
    let sum = 0, count = 0;
    const idx = i / stride;
    const x = idx % side;
    const y = Math.floor(idx / side);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < side && ny >= 0 && ny < side) {
          const nIdx = (ny * side + nx) * stride + 2;
          sum += vertices[nIdx];
          count++;
        }
      }
    }
    smoothed[i] = vertices[i];
    smoothed[i + 1] = vertices[i + 1];
    smoothed[i + 2] = sum / count;
  }
  return smoothed;
}

// --- Altitude/fire effect hook ---
// Usage: in your aircraft/physics update, call checkAltitudeLimit(aircraft)
const ALTITUDE_LIMIT = 3200; // meters above sea level
export function checkAltitudeLimit(aircraft) {
  if (!aircraft || !aircraft.position) return;
  if (aircraft.position.y > ALTITUDE_LIMIT && !aircraft.isOnFire) {
    // Trigger fire effect
    aircraft.isOnFire = true;
    // Show fire sprite/overlay (implement in your render loop)
    // Disable controls (implement in controls.js)
    // Start falling
    aircraft.velocity.y = -100;
    // Optionally play sound, etc.
  }
  // Reset fire if below limit (optional)
  if (aircraft.position.y <= ALTITUDE_LIMIT && aircraft.isOnFire) {
    aircraft.isOnFire = false;
  }
}

// --- Timer mechanism (Trackmania-style) ---
let flightTimer = 0;
let timerRunning = false;
let timerStartTime = 0;
let timerDisplay = null;

export function startFlightTimer() {
  timerStartTime = performance.now();
  timerRunning = true;
}
export function stopFlightTimer() {
  timerRunning = false;
}
export function getFlightTime() {
  return timerRunning ? (performance.now() - timerStartTime) / 1000 : flightTimer;
}

// Add timer display to DOM
if (!document.getElementById('flight-timer')) {
  timerDisplay = document.createElement('div');
  timerDisplay.id = 'flight-timer';
  timerDisplay.style.position = 'fixed';
  timerDisplay.style.top = '24px';
  timerDisplay.style.left = '50%';
  timerDisplay.style.transform = 'translateX(-50%)';
  timerDisplay.style.fontSize = '2em';
  timerDisplay.style.fontWeight = 'bold';
  timerDisplay.style.color = '#fff';
  timerDisplay.style.textShadow = '0 0 8px #222';
  timerDisplay.style.zIndex = '1000';
  document.body.appendChild(timerDisplay);
}
// Update timer display in animation/render loop
export function updateFlightTimerDisplay() {
  if (timerDisplay) {
    const t = getFlightTime();
    timerDisplay.textContent = `Time: ${t.toFixed(2)}s`;
  }
}

// --- Fire overlay instructions ---
// In your render loop, if aircraft.isOnFire is true, draw the fire texture over the plane
// Example (pseudo-code):
// if (aircraft.isOnFire) {
//   // Use a THREE.Sprite or drawImage with textures/fire.png
//   // Optionally animate or flicker
// }