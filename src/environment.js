import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { ImprovedNoise } from 'three/examples/jsm/math/ImprovedNoise.js';

export function setupEnvironment(scene) {
  console.log('--- setupEnvironment START ---');

  // 0. BACKGROUND & FOG
  console.log('Setting background and fog');
  scene.background = new THREE.Color(0xcce0ff);
  scene.fog = new THREE.Fog(0xcce0ff, 1000, 50000);

  // Loading manager
  const manager = new THREE.LoadingManager();
  manager.onStart = () => console.log('LoadingManager: load started');
  manager.onLoad = () => console.log('LoadingManager: all textures loaded');
  manager.onError = url => console.error('LoadingManager: error loading', url);

  const loader = new THREE.TextureLoader(manager);

  // 1. LOAD TEXTURES
  console.log('Loading textures');
  const diffuseMap = loader.load('/himalaya_diffuse.jpg', () => console.log('diffuseMap loaded'));
  const waterNormals = loader.load('/waternormals.jpg', () => console.log('waterNormals loaded'));

  // 2. CONFIGURE TEXTURES
  console.log('Configuring textures');
  diffuseMap.encoding = THREE.sRGBEncoding;
  diffuseMap.wrapS = diffuseMap.wrapT = THREE.RepeatWrapping;
  diffuseMap.repeat.set(50, 50);

  waterNormals.encoding = THREE.LinearEncoding;
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;

  // 3. WATER PATCH HELPER
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
    console.log(`Water patch added at (${x}, ${y}, ${z}), size: ${size}`);
    return water;
  };

  // 4. TERRAIN + SKY SETUP AFTER TEXTURES LOAD
  manager.onLoad = () => {
    console.log('--- Textures loaded, building scene features ---');

    // SKY
    console.log('Creating sky dome');
    const sky = new Sky();
    sky.scale.setScalar(450000);
    scene.add(sky);
    const sunPos = new THREE.Vector3();
    const uni = sky.material.uniforms;
    uni.turbidity.value = 10;
    uni.rayleigh.value = 2;
    uni.mieCoefficient.value = 0.005;
    uni.mieDirectionalG.value = 0.8;
    const phi = THREE.MathUtils.degToRad(60);
    const theta = THREE.MathUtils.degToRad(180);
    sunPos.setFromSphericalCoords(1, phi, theta);
    uni.sunPosition.value.copy(sunPos);
    console.log('Sky and sunPosition set to', sunPos.toArray());

    // TERRAIN
    console.log('Creating procedural terrain with fractal noise');
    const width = 50000;
    const depth = 50000;
    const segments = 256;

    const terrainGeom = new THREE.PlaneGeometry(width, depth, segments, segments);
    const noise = new ImprovedNoise();

    const scale = 0.0005;           // Controls how stretched out the noise is
    const heightScale = 3000;       // Altitude max (you can increase carefully)
    const octaves = 5;
    const persistence = 0.5;
    const lacunarity = 2.0;

    const vertices = terrainGeom.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i];
      const y = vertices[i + 1];

      let elevation = 0;
      let frequency = scale;
      let amplitude = 1;

      for (let o = 0; o < octaves; o++) {
        elevation += noise.noise(x * frequency, y * frequency, 0) * amplitude;
        frequency *= lacunarity;
        amplitude *= persistence;
      }

      vertices[i + 2] = elevation * heightScale;
    }

    terrainGeom.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      map: diffuseMap,
      roughness: 1,
      metalness: 0,
    });

    const terrain = new THREE.Mesh(terrainGeom, terrainMat);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = -200;
    terrain.receiveShadow = true;
    scene.add(terrain);
    console.log('Procedural terrain added');

    // WATER PATCHES
    console.log('Creating multiple water patches');
    createWaterPatch(0, 0, 8000, 10, sunPos);           // Large central lake
    createWaterPatch(12000, -5000, 4000, 12, sunPos);   // Smaller pond #1
    createWaterPatch(-15000, 8000, 3000, 8, sunPos);    // Smaller pond #2
    createWaterPatch(5000, 15000, 3500, 11, sunPos);    // Smaller pond #3

    // DEBUG HELPERS
    console.log('Adding debug helpers');
    scene.add(new THREE.GridHelper(10000, 100));
    scene.add(new THREE.AxesHelper(5000));
    console.log('GridHelper and AxesHelper added');

    console.log('--- setupEnvironment COMPLETE ---');
  };
}
