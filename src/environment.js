// environment.js
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';

export let terrainMesh;
export let oceanMesh;

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

    // --- Maze mountain peaks (module scope) ---
    const mazePeaks = [];
    const mazeRows = 6, mazeCols = 6;
    const mazeSpacingX = 14000 / (mazeCols - 1);
    const mazeSpacingY = 14000 / (mazeRows - 1);
    const mazeStartX = -7000, mazeStartY = -7000;
    for (let i = 0; i < mazeRows; i++) {
      for (let j = 0; j < mazeCols; j++) {
        // Create a maze-like pattern: skip some cells for "paths"
        if ((i + j) % 2 === 0 && !(i === 0 && j === 0) && !(i === mazeRows-1 && j === mazeCols-1)) {
          mazePeaks.push({
            x: mazeStartX + j * mazeSpacingX,
            y: mazeStartY + i * mazeSpacingY,
            radius: 1800 + Math.random() * 800,
            height: 1.7 + Math.random() * 0.5
          });
        }
      }
    }
    const mazeGoal = { x: mazeStartX + (mazeCols-1) * mazeSpacingX, y: mazeStartY + (mazeRows-1) * mazeSpacingY };

    const customTerrainHeight = (x, y) => {
      let elevation = 0;
      // Maze mountains
      for (const peak of mazePeaks) {
        const dist = Math.sqrt((x - peak.x) ** 2 + (y - peak.y) ** 2);
        if (dist < peak.radius) {
          elevation += peak.height * Math.cos((Math.PI * dist) / (2 * peak.radius));
        }
      }
      // Add some noise for realism
      let noiseElevation = 0;
      let frequency = scale;
      let amplitude = 1;
      for (let o = 0; o < octaves; o++) {
        noiseElevation += noise.noise(x * frequency, y * frequency, 0) * amplitude;
        frequency *= lacunarity;
        amplitude *= persistence;
      }
      elevation += 0.3 * noiseElevation;
      return elevation;
    };

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const y = vertices[i + 1];
      vertices[i + 2] = customTerrainHeight(x, y) * heightScale;
    }

    geometry.computeVertexNormals();

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
    const minimapWidth = 180, minimapHeight = 180;
    let minimapDrawn = false;
    let minimapReady = false;
    let minimapWidthWorld = 50000;
    let minimapDepthWorld = 50000;
    let minimapCustomTerrainHeight = null;

    function drawMinimapBase() {
      if (!minimap || !minimapCustomTerrainHeight) return;
      // Draw heightmap
      for (let px = 0; px < minimapWidth; px++) {
        for (let py = 0; py < minimapHeight; py++) {
          const tx = (px / minimapWidth - 0.5) * minimapWidthWorld;
          const ty = (py / minimapHeight - 0.5) * minimapDepthWorld;
          let h = minimapCustomTerrainHeight ? minimapCustomTerrainHeight(tx, ty) : 0;
          h = (h + 1.5) / 3.5;
          const shade = Math.floor(80 + 160 * h);
          minimapCtx.fillStyle = `rgb(${shade},${shade},${shade})`;
          minimapCtx.fillRect(px, minimapHeight - py - 1, 1, 1);
        }
      }
      // Draw mountain peaks as triangles
      minimapCtx.save();
      minimapCtx.font = 'bold 16px sans-serif';
      minimapCtx.textAlign = 'center';
      minimapCtx.textBaseline = 'middle';
      for (const peak of mazePeaks) {
        const px = Math.floor(((peak.x / minimapWidthWorld) + 0.5) * minimapWidth);
        const py = minimapHeight - Math.floor(((peak.y / minimapDepthWorld) + 0.5) * minimapHeight);
        minimapCtx.fillStyle = '#222';
        minimapCtx.strokeStyle = '#fff';
        minimapCtx.lineWidth = 2;
        minimapCtx.beginPath();
        minimapCtx.moveTo(px, py - 8);
        minimapCtx.lineTo(px - 7, py + 7);
        minimapCtx.lineTo(px + 7, py + 7);
        minimapCtx.closePath();
        minimapCtx.fillStyle = '#fff';
        minimapCtx.fill();
        minimapCtx.stroke();
      }
      // Draw goal flag
      const flagPx = Math.floor(((mazeGoal.x / minimapWidthWorld) + 0.5) * minimapWidth);
      const flagPy = minimapHeight - Math.floor(((mazeGoal.y / minimapDepthWorld) + 0.5) * minimapHeight);
      minimapCtx.font = 'bold 18px sans-serif';
      minimapCtx.fillStyle = '#0c0';
      minimapCtx.fillText('🏁', flagPx, flagPy - 10);
      minimapCtx.restore();
      minimapDrawn = true;
    }

    function updateMinimapAircraft(aircraft) {
      if (!minimapDrawn || !minimapReady) return;
      drawMinimapBase();
      const x = aircraft.position.x;
      const y = aircraft.position.z;
      const px = Math.floor(((x / minimapWidthWorld) + 0.5) * minimapWidth);
      const py = minimapHeight - Math.floor(((y / minimapDepthWorld) + 0.5) * minimapHeight);
      minimapCtx.save();
      minimapCtx.beginPath();
      minimapCtx.arc(px, py, 6, 0, 2 * Math.PI);
      minimapCtx.fillStyle = '#ff3333';
      minimapCtx.shadowColor = '#fff';
      minimapCtx.shadowBlur = 6;
      minimapCtx.fill();
      minimapCtx.restore();
    }

    // --- Minimap setup (inside manager.onLoad) ---
    minimapWidthWorld = width;
    minimapDepthWorld = depth;
    minimapCustomTerrainHeight = customTerrainHeight;
    if (!document.getElementById('minimap-canvas')) {
      minimap = document.createElement('canvas');
      minimap.id = 'minimap-canvas';
      minimap.width = minimapWidth;
      minimap.height = minimapHeight;
      minimap.style.position = 'fixed';
      minimap.style.right = '24px';
      minimap.style.bottom = '24px';
      minimap.style.zIndex = '1001';
      minimap.style.background = '#222';
      minimap.style.border = '2px solid #fff';
      minimap.style.borderRadius = '12px';
      minimap.style.boxShadow = '0 2px 8px rgba(0,0,0,0.3)';
      document.body.appendChild(minimap);
      minimapCtx = minimap.getContext('2d');
      drawMinimapBase();
      minimapReady = true;
    }
  };
}