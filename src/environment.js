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
  };
}