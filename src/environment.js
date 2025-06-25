//environment.js
import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Water } from 'three/examples/jsm/objects/Water.js';

// Debuggable environment setup with step-by-step logging
export function setupEnvironment(scene) {
  console.log('--- setupEnvironment START ---');

  // 0. BACKGROUND & FOG
  console.log('Setting background and fog');
  scene.background = new THREE.Color(0xcce0ff);
  scene.fog = new THREE.Fog(0xcce0ff, 1000, 50000);

  // Ensure your assets (heightmap.png, himalaya_diffuse.jpg, waternormals.jpg)
  // are located in the 'public/' folder at the project root.

  // Loading manager to sync texture loads
  const manager = new THREE.LoadingManager();
  manager.onStart = () => console.log('LoadingManager: load started');
  manager.onLoad = () => console.log('LoadingManager: all textures loaded');
  manager.onError = url => console.error('LoadingManager: error loading', url);

  const loader = new THREE.TextureLoader(manager);

  // 1. LOAD TEXTURES from public folder
  console.log('Loading textures');
  const heightMap = loader.load('/heightmap.png', () => console.log('heightMap loaded'));
  const diffuseMap = loader.load('/himalaya_diffuse.jpg', () => console.log('diffuseMap loaded'));
  const waterNormals = loader.load('/waternormals.jpg', () => console.log('waterNormals loaded'));

  // 2. CONFIGURE DIFFUSE MAP
  console.log('Configuring diffuseMap encoding and repeat');
  diffuseMap.encoding = THREE.sRGBEncoding;
  diffuseMap.wrapS = diffuseMap.wrapT = THREE.RepeatWrapping;
  diffuseMap.repeat.set(50, 50);

  // 3. CONFIGURE WATER NORMALS
  console.log('Configuring waterNormals encoding');
  waterNormals.encoding = THREE.LinearEncoding;
  waterNormals.wrapS = waterNormals.wrapT = THREE.RepeatWrapping;

  // After textures loaded run setup
  manager.onLoad = () => {
    console.log('--- Textures loaded, building scene features ---');

    // 4. CREATE TERRAIN
    console.log('Creating terrain mesh');
    const terrainGeom = new THREE.PlaneGeometry(50000, 50000, 256, 256);
    const terrainMat = new THREE.MeshStandardMaterial({
      map: diffuseMap,
      displacementMap: heightMap,
      displacementScale: 400,
      roughness: 1,
      metalness: 0,
    });
    const terrain = new THREE.Mesh(terrainGeom, terrainMat);
    terrain.rotation.x = -Math.PI / 2;
    terrain.position.y = -200;
    terrain.receiveShadow = true;
    scene.add(terrain);
    console.log('Terrain added at y =', terrain.position.y);

    // 5. SKY
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

    // 6. WATER
    console.log('Creating water plane');
    const waterGeom = new THREE.PlaneGeometry(8000, 8000);
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
    water.position.set(0, 10, 0);
    scene.add(water);
    console.log('Water added at', water.position.toArray());

    // 7. DEBUG HELPERS
    console.log('Adding debug helpers');
    scene.add(new THREE.GridHelper(10000, 100));
    scene.add(new THREE.AxesHelper(5000));
    console.log('GridHelper and AxesHelper added');

    console.log('--- setupEnvironment COMPLETE ---');
  };
}
