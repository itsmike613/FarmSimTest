// index.js
// Browser-based Minecraft-like farming sandbox (static hosting friendly)
// ============================================================
// REQUIRED STRUCTURE SECTIONS
// ============================================================

// ============================================================
// IMPORTS (CDN ES MODULES ONLY)
// ============================================================
import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";

// ============================================================
// CONSTANTS
// ============================================================
const WORLD_SIZE = 64;           // 64x64 island
const WORLD_HEIGHT = 2;          // EXACTLY 2 layers: y=0 and y=1
const Y_SUBSOIL = 0;
const Y_TOP = 1;

const BLOCK_SIZE = 1;

const REACH_DISTANCE = 5.0;

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.30;      // AABB half-width ~0.30
const PLAYER_EYE = 1.62;

const GRAVITY = 24;              // tuned to feel Minecraft-ish
const JUMP_VELOCITY = 8.5;
const WALK_SPEED = 4.3;
const SPRINT_SPEED = 6.2;
const AIR_CONTROL = 0.35;
const FRICTION_GROUND = 12.0;
const FRICTION_AIR = 1.5;

const FARMLAND_HYDRATION_RADIUS = 4; // within 4 blocks of ANY water
const FARMLAND_DRY_REVERT_SECONDS = 3.0;

const GRASS_REGROW_MIN = 10.0;
const GRASS_REGROW_MAX = 20.0;

const CROP_TOTAL_GROW_MIN = 30.0;
const CROP_TOTAL_GROW_MAX = 60.0;

const EDGE_WATER_SOURCE = { x: Math.floor(WORLD_SIZE / 2), z: 0, y: 1 }; // center of north edge

// ============================================================
// TEXTURES
// ============================================================
const TEX_PATH = "./assets/textures/";

const textureLoader = new THREE.TextureLoader();
function loadTex(name) {
  const t = textureLoader.load(TEX_PATH + name);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const TEX = {
  grassTop: loadTex("grass_top.png"),
  dirt: loadTex("dirt.png"),
  subsoil: loadTex("subsoil.png"),
  farmland: loadTex("farmland.png"),
  water: loadTex("water.png"),

  // Items
  bucketEmpty: loadTex("bucket_empty.png"),
  bucketWater: loadTex("bucket_water.png"),
  hoe: loadTex("hoe.png"),
  shovel: loadTex("shovel.png"),
  seeds: loadTex("seeds.png"),
  dirtItem: loadTex("dirt_item.png"),
  wheat: loadTex("wheat.png"),

  // Crops
  crop0: loadTex("crop_wheat_0.png"),
  crop1: loadTex("crop_wheat_1.png"),
  crop2: loadTex("crop_wheat_2.png"),
  crop3: loadTex("crop_wheat_3.png"),
};

// ============================================================
// BLOCK DEFINITIONS
// ============================================================
const BLOCK = {
  AIR: 0,
  SUBSOIL: 1,
  GRASS: 2,       // dirt sides + grass top
  DIRT: 3,
  FARMLAND: 4,
  WATER_SOURCE: 5, // infinite, indestructible
  WATER: 6,
};

const BlockDefs = {
  [BLOCK.SUBSOIL]: { id: "subsoil", breakable: false, pickable: false },
  [BLOCK.GRASS]:   { id: "grass", breakable: true,  pickable: true  },
  [BLOCK.DIRT]:    { id: "dirt", breakable: true,  pickable: true  },
  [BLOCK.FARMLAND]:{ id: "farmland", breakable: true, pickable: true },
  [BLOCK.WATER_SOURCE]: { id: "water_source", breakable: false, pickable: false },
  [BLOCK.WATER]:   { id: "water", breakable: true,  pickable: true  },
};

// ============================================================
// ITEM DEFINITIONS
// ============================================================
const ITEM = {
  BUCKET_EMPTY: "bucket_empty",
  BUCKET_WATER: "bucket_water",
  HOE: "hoe",
  SHOVEL: "shovel",
  SEEDS: "seeds",
  DIRT_ITEM: "dirt_item",
  WHEAT: "wheat",
};

const ItemDefs = {
  [ITEM.BUCKET_EMPTY]: { name: "Empty Bucket", icon: TEX.bucketEmpty, stack: 1 },
  [ITEM.BUCKET_WATER]: { name: "Water Bucket", icon: TEX.bucketWater, stack: 1 },
  [ITEM.HOE]: { name: "Wooden Hoe", icon: TEX.hoe, stack: 1 },
  [ITEM.SHOVEL]: { name: "Wooden Shovel", icon: TEX.shovel, stack: 1 },
  [ITEM.SEEDS]: { name: "Wheat Seeds", icon: TEX.seeds, stack: 64 },
  [ITEM.DIRT_ITEM]: { name: "Dirt", icon: TEX.dirtItem, stack: 64 },
  [ITEM.WHEAT]: { name: "Wheat", icon: TEX.wheat, stack: 64 },
};

// ============================================================
// CROP DEFINITIONS
// ============================================================
const CropDefs = {
  wheat: {
    stages: [
      { tex: TEX.crop0 },
      { tex: TEX.crop1 },
      { tex: TEX.crop2 },
      { tex: TEX.crop3 },
    ],
    maxStage: 3,
  },
};

// ============================================================
// WORLD DATA
// ============================================================
// World is a flat island: 64x64 blocks, height 2.
// Store only y=1 mutable layer as 2D array; y=0 is always SUBSOIL.
const worldTop = new Uint8Array(WORLD_SIZE * WORLD_SIZE); // y=1
// y=0 is implicit SUBSOIL everywhere in-bounds.

function idx(x, z) { return z * WORLD_SIZE + x; }
function inBounds(x, z) { return x >= 0 && z >= 0 && x < WORLD_SIZE && z < WORLD_SIZE; }

function getBlock(x, y, z) {
  if (!inBounds(x, z)) return BLOCK.AIR;
  if (y === 0) return BLOCK.SUBSOIL;
  if (y === 1) return worldTop[idx(x, z)];
  return BLOCK.AIR;
}

function setBlock(x, y, z, type) {
  if (!inBounds(x, z)) return;
  if (y !== 1) return; // only y=1 mutable
  worldTop[idx(x, z)] = type;
  markWorldDirty();
}

// Timers/extra state for y=1 blocks
const farmlandDryTimer = new Float32Array(WORLD_SIZE * WORLD_SIZE);  // seconds dry (not hydrated)
const grassRegrowTimer = new Float32Array(WORLD_SIZE * WORLD_SIZE);  // countdown seconds to regrow; 0 means inactive

// Crops: map "x,z" -> { stage, elapsed, total, mesh }
const crops = new Map();

// Dropped items: array of { itemId, count, pos, vel, mesh }
const drops = [];

// ============================================================
// SCENE / RENDERER
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87b7ff);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 250);

const renderer = new THREE.WebGLRenderer({ antialias: false });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.body.appendChild(renderer.domElement);

// Lights (simple, readable)
const hemi = new THREE.HemisphereLight(0xffffff, 0x5577aa, 0.9);
scene.add(hemi);

const dir = new THREE.DirectionalLight(0xffffff, 0.8);
dir.position.set(30, 60, 20);
scene.add(dir);

// Controls (pointer lock first-person)
const controls = new PointerLockControls(camera, renderer.domElement);
scene.add(controls.getObject());

// Block highlight
const highlightMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 });
const highlightGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
const highlight = new THREE.LineSegments(highlightGeo, highlightMat);
highlight.visible = false;
scene.add(highlight);

// Raycaster
const raycaster = new THREE.Raycaster();
raycaster.far = REACH_DISTANCE;

// ============================================================
// MATERIALS / GEOMETRY
// ============================================================
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);

// Grass: top grass, sides dirt, bottom dirt
const matGrass = [
  new THREE.MeshLambertMaterial({ map: TEX.dirt }),      // +X
  new THREE.MeshLambertMaterial({ map: TEX.dirt }),      // -X
  new THREE.MeshLambertMaterial({ map: TEX.grassTop }),  // +Y (top)
  new THREE.MeshLambertMaterial({ map: TEX.dirt }),      // -Y (bottom)
  new THREE.MeshLambertMaterial({ map: TEX.dirt }),      // +Z
  new THREE.MeshLambertMaterial({ map: TEX.dirt }),      // -Z
];

const matDirt = new THREE.MeshLambertMaterial({ map: TEX.dirt });
const matSubsoil = new THREE.MeshLambertMaterial({ map: TEX.subsoil });
const matFarmland = new THREE.MeshLambertMaterial({ map: TEX.farmland });

const matWater = new THREE.MeshLambertMaterial({
  map: TEX.water,
  transparent: true,
  opacity: 0.85,
});

function makeCropMaterial(tex) {
  return new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
}

// ============================================================
// WORLD RENDERING
// ============================================================
let worldDirty = true;

const worldGroup = new THREE.Group();
scene.add(worldGroup);

let subsoilMeshes = []; // static, but we still build once
let topMeshes = [];     // y=1 blocks
let waterSourceMesh = null;

function markWorldDirty() { worldDirty = true; }

function clearMeshes(arr) {
  for (const m of arr) {
    if (m && m.parent) m.parent.remove(m);
    if (m && m.geometry) m.geometry.dispose?.();
    // materials are shared; do not dispose shared mats
  }
  arr.length = 0;
}

function buildWorldMeshes() {
  // Rebuild y=1 meshes (and y=0 once if empty)
  if (subsoilMeshes.length === 0) {
    // y=0: unbreakable subsoil everywhere
    for (let z = 0; z < WORLD_SIZE; z++) {
      for (let x = 0; x < WORLD_SIZE; x++) {
        const m = new THREE.Mesh(cubeGeo, matSubsoil);
        m.position.set(x + 0.5, 0.5, z + 0.5);
        m.userData = { x, y: 0, z, block: BLOCK.SUBSOIL };
        worldGroup.add(m);
        subsoilMeshes.push(m);
      }
    }
  }

  // Remove previous y=1 meshes and water source (we rebuild them too for simplicity)
  for (const m of topMeshes) worldGroup.remove(m);
  topMeshes = [];

  if (waterSourceMesh) {
    worldGroup.remove(waterSourceMesh);
    waterSourceMesh = null;
  }

  // y=1 meshes
  for (let z = 0; z < WORLD_SIZE; z++) {
    for (let x = 0; x < WORLD_SIZE; x++) {
      const b = worldTop[idx(x, z)];
      if (b === BLOCK.AIR) continue;

      let mesh = null;
      if (b === BLOCK.GRASS) mesh = new THREE.Mesh(cubeGeo, matGrass);
      else if (b === BLOCK.DIRT) mesh = new THREE.Mesh(cubeGeo, matDirt);
      else if (b === BLOCK.FARMLAND) mesh = new THREE.Mesh(cubeGeo, matFarmland);
      else if (b === BLOCK.WATER) mesh = new THREE.Mesh(cubeGeo, matWater);
      else if (b === BLOCK.WATER_SOURCE) {
        // water source is separate handle (still a cube)
        mesh = new THREE.Mesh(cubeGeo, matWater);
      }

      if (!mesh) continue;
      mesh.position.set(x + 0.5, 1.5, z + 0.5);
      mesh.userData = { x, y: 1, z, block: b };
      worldGroup.add(mesh);

      if (b === BLOCK.WATER_SOURCE) waterSourceMesh = mesh;
      else topMeshes.push(mesh);
    }
  }

  // Ensure crop meshes are on top (they live in their own group below)
  rebuildCropMeshes();

  worldDirty = false;
}

// ============================================================
// CROPS (render + logic)
// ============================================================
const cropGroup = new THREE.Group();
scene.add(cropGroup);

function cropKey(x, z) { return `${x},${z}`; }

function removeCropAt(x, z) {
  const key = cropKey(x, z);
  const c = crops.get(key);
  if (!c) return;
  if (c.mesh && c.mesh.parent) c.mesh.parent.remove(c.mesh);
  crops.delete(key);
}

function createCropMesh(stageTex) {
  const mat = makeCropMaterial(stageTex);

  // Two crossed planes
  const plane = new THREE.PlaneGeometry(0.9, 0.9);
  const a = new THREE.Mesh(plane, mat);
  const b = new THREE.Mesh(plane, mat);

  a.rotation.y = Math.PI / 4;
  b.rotation.y = -Math.PI / 4;

  const g = new THREE.Group();
  g.add(a, b);
  return g;
}

function setCropStageMesh(crop, stage) {
  const def = CropDefs.wheat;
  const tex = def.stages[stage].tex;

  if (crop.mesh) cropGroup.remove(crop.mesh);
  crop.mesh = createCropMesh(tex);
  crop.mesh.position.set(crop.x + 0.5, 1.01, crop.z + 0.5); // sit on farmland top
  crop.mesh.userData = { isCrop: true, x: crop.x, z: crop.z };
  cropGroup.add(crop.mesh);
}

function rebuildCropMeshes() {
  // Called after world rebuild to ensure crops match farmland state
  for (const [key, c] of crops.entries()) {
    const b = getBlock(c.x, 1, c.z);
    if (b !== BLOCK.FARMLAND) {
      removeCropAt(c.x, c.z);
      continue;
    }
    setCropStageMesh(c, c.stage);
  }
}

function plantWheat(x, z) {
  const key = cropKey(x, z);
  if (crops.has(key)) return false;

  const total = THREE.MathUtils.lerp(CROP_TOTAL_GROW_MIN, CROP_TOTAL_GROW_MAX, Math.random());
  const crop = { type: "wheat", x, z, stage: 0, elapsed: 0, total, mesh: null };
  crops.set(key, crop);
  setCropStageMesh(crop, 0);
  return true;
}

function updateCrops(dt) {
  for (const c of crops.values()) {
    // If farmland disappears, remove crop
    if (getBlock(c.x, 1, c.z) !== BLOCK.FARMLAND) {
      removeCropAt(c.x, c.z);
      continue;
    }

    c.elapsed += dt;
    const stageFloat = (c.elapsed / c.total) * 4; // 0..4
    const newStage = Math.min(3, Math.floor(stageFloat));
    if (newStage !== c.stage) {
      c.stage = newStage;
      setCropStageMesh(c, c.stage);
    }
  }
}

// ============================================================
// INVENTORY / HOTBAR UI
// ============================================================
const hotbarEl = document.getElementById("hotbar");

const hotbar = new Array(9).fill(null).map(() => ({ id: null, count: 0 }));
let selectedSlot = 0;

function setSlot(i, id, count) {
  hotbar[i].id = id;
  hotbar[i].count = count;
}

function addItemToInventory(itemId, count) {
  const def = ItemDefs[itemId];
  if (!def) return count;

  // First, stack into existing
  for (let i = 0; i < hotbar.length; i++) {
    const s = hotbar[i];
    if (s.id === itemId && def.stack > 1 && s.count < def.stack) {
      const can = Math.min(count, def.stack - s.count);
      s.count += can;
      count -= can;
      if (count <= 0) return 0;
    }
  }

  // Then, place into empty slots
  for (let i = 0; i < hotbar.length; i++) {
    const s = hotbar[i];
    if (!s.id) {
      const put = Math.min(count, def.stack);
      s.id = itemId;
      s.count = put;
      count -= put;
      if (count <= 0) return 0;
    }
  }

  return count; // leftover
}

function consumeSelected(count) {
  const s = hotbar[selectedSlot];
  if (!s.id || s.count < count) return false;
  s.count -= count;
  if (s.count <= 0) { s.id = null; s.count = 0; }
  return true;
}

function setSelectedItem(itemId) {
  // For non-stack items (bucket swap)
  hotbar[selectedSlot].id = itemId;
  hotbar[selectedSlot].count = 1;
}

function getSelected() {
  return hotbar[selectedSlot];
}

function buildHotbarUI() {
  hotbarEl.innerHTML = "";
  for (let i = 0; i < 9; i++) {
    const s = document.createElement("div");
    s.className = "slot" + (i === selectedSlot ? " selected" : "");
    s.dataset.slot = String(i);

    const data = hotbar[i];
    if (data.id) {
      const img = document.createElement("img");
      img.draggable = false;
      img.src = ItemDefs[data.id].icon.image.currentSrc || (TEX_PATH + iconNameForItem(data.id));
      // Fallback: if texture image not ready yet, set after load tick
      s.appendChild(img);

      if (data.count > 1) {
        const c = document.createElement("div");
        c.className = "count";
        c.textContent = String(data.count);
        s.appendChild(c);
      }
    }

    hotbarEl.appendChild(s);
  }
}

function iconNameForItem(itemId) {
  // Used only as a fallback; primary is ItemDefs icons
  switch (itemId) {
    case ITEM.BUCKET_EMPTY: return "bucket_empty.png";
    case ITEM.BUCKET_WATER: return "bucket_water.png";
    case ITEM.HOE: return "hoe.png";
    case ITEM.SHOVEL: return "shovel.png";
    case ITEM.SEEDS: return "seeds.png";
    case ITEM.DIRT_ITEM: return "dirt_item.png";
    case ITEM.WHEAT: return "wheat.png";
    default: return "dirt_item.png";
  }
}

function updateHotbarUI() {
  // Rebuild (simple + robust)
  buildHotbarUI();
}

// Starting inventory
setSlot(0, ITEM.BUCKET_EMPTY, 1);
setSlot(1, ITEM.HOE, 1);
setSlot(2, ITEM.SHOVEL, 1);
setSlot(3, ITEM.SEEDS, 5);

// ============================================================
// PLAYER / PHYSICS
// ============================================================
let velocity = new THREE.Vector3(0, 0, 0);
let onGround = false;

const keys = {
  w: false, a: false, s: false, d: false,
  space: false, ctrl: false,
};

function playerAABB(pos) {
  // pos is player "feet" position? We'll treat controls object position as player base (feet) at y.
  // We'll store player position as feet (bottom) y.
  const min = new THREE.Vector3(pos.x - PLAYER_RADIUS, pos.y, pos.z - PLAYER_RADIUS);
  const max = new THREE.Vector3(pos.x + PLAYER_RADIUS, pos.y + PLAYER_HEIGHT, pos.z + PLAYER_RADIUS);
  return { min, max };
}

function isSolidBlock(b) {
  return b !== BLOCK.AIR && b !== BLOCK.WATER; // water is non-solid for collision (simple)
}

function collidesAt(pos) {
  const aabb = playerAABB(pos);

  // Check nearby blocks within AABB
  const minX = Math.floor(aabb.min.x);
  const maxX = Math.floor(aabb.max.x);
  const minY = Math.floor(aabb.min.y);
  const maxY = Math.floor(aabb.max.y);
  const minZ = Math.floor(aabb.min.z);
  const maxZ = Math.floor(aabb.max.z);

  for (let y = minY; y <= maxY; y++) {
    for (let z = minZ; z <= maxZ; z++) {
      for (let x = minX; x <= maxX; x++) {
        const b = getBlock(x, y, z);
        if (!isSolidBlock(b)) continue;

        // Block AABB is [x,x+1] etc
        const bMin = new THREE.Vector3(x, y, z);
        const bMax = new THREE.Vector3(x + 1, y + 1, z + 1);

        if (
          aabb.min.x < bMax.x && aabb.max.x > bMin.x &&
          aabb.min.y < bMax.y && aabb.max.y > bMin.y &&
          aabb.min.z < bMax.z && aabb.max.z > bMin.z
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function moveWithCollisions(dt, wishVel) {
  const obj = controls.getObject();
  const pos = obj.position.clone(); // pos.y is feet y

  // Apply acceleration towards wishVel (in XZ)
  const accel = onGround ? 40 : 40 * AIR_CONTROL;
  velocity.x += (wishVel.x - velocity.x) * Math.min(1, accel * dt);
  velocity.z += (wishVel.z - velocity.z) * Math.min(1, accel * dt);

  // Friction
  const friction = onGround ? FRICTION_GROUND : FRICTION_AIR;
  velocity.x *= Math.max(0, 1 - friction * dt);
  velocity.z *= Math.max(0, 1 - friction * dt);

  // Gravity
  velocity.y -= GRAVITY * dt;

  // Jump
  if (onGround && keys.space) {
    velocity.y = JUMP_VELOCITY;
    onGround = false;
  }

  // Step axis-by-axis
  const next = pos.clone();

  // X
  next.x += velocity.x * dt;
  if (collidesAt(next)) {
    next.x = pos.x;
    velocity.x = 0;
  }

  // Z
  next.z += velocity.z * dt;
  if (collidesAt(next)) {
    next.z = pos.z;
    velocity.z = 0;
  }

  // Y
  next.y += velocity.y * dt;
  if (collidesAt(next)) {
    // If falling, snap to ground
    if (velocity.y < 0) onGround = true;
    velocity.y = 0;
    next.y = pos.y;
  } else {
    onGround = false;
  }

  // Prevent falling below ground (subsoil top is y=1, grass top is y=2; player feet should never go below y=2)
  if (next.y < 2.0) {
    next.y = 2.0;
    velocity.y = 0;
    onGround = true;
  }

  obj.position.copy(next);
}

function getForwardRight() {
  const dir = new THREE.Vector3();
  camera.getWorldDirection(dir);
  dir.y = 0;
  dir.normalize();
  const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).multiplyScalar(-1);
  return { forward: dir, right };
}

// ============================================================
// INPUT
// ============================================================
const blocker = document.getElementById("blocker");

blocker.addEventListener("click", () => controls.lock());
controls.addEventListener("lock", () => blocker.style.display = "none");
controls.addEventListener("unlock", () => blocker.style.display = "grid");

window.addEventListener("keydown", (e) => {
  if (e.code === "KeyW") keys.w = true;
  if (e.code === "KeyA") keys.a = true;
  if (e.code === "KeyS") keys.s = true;
  if (e.code === "KeyD") keys.d = true;
  if (e.code === "Space") keys.space = true;
  if (e.code === "ControlLeft" || e.code === "ControlRight") keys.ctrl = true;

  // Hotbar select 1-9
  if (e.code.startsWith("Digit")) {
    const n = Number(e.code.replace("Digit", ""));
    if (n >= 1 && n <= 9) {
      selectedSlot = n - 1;
      updateHotbarUI();
    }
  }
});

window.addEventListener("keyup", (e) => {
  if (e.code === "KeyW") keys.w = false;
  if (e.code === "KeyA") keys.a = false;
  if (e.code === "KeyS") keys.s = false;
  if (e.code === "KeyD") keys.d = false;
  if (e.code === "Space") keys.space = false;
  if (e.code === "ControlLeft" || e.code === "ControlRight") keys.ctrl = false;
});

// Mouse wheel hotbar
window.addEventListener("wheel", (e) => {
  if (!controls.isLocked) return;
  if (e.deltaY > 0) selectedSlot = (selectedSlot + 1) % 9;
  else selectedSlot = (selectedSlot + 8) % 9;
  updateHotbarUI();
}, { passive: true });

// Disable context menu (we use RMB)
window.addEventListener("contextmenu", (e) => e.preventDefault());

// Mouse actions
window.addEventListener("mousedown", (e) => {
  if (!controls.isLocked) return;
  if (e.button === 0) handleLeftClick();
  if (e.button === 2) handleRightClick();
});

// ============================================================
// RAYCAST TARGETING + HIGHLIGHT
// ============================================================
let targetHit = null; // { x,y,z, block, point, normal, isCrop? }

function getIntersect() {
  const origin = camera.getWorldPosition(new THREE.Vector3());
  const dir = camera.getWorldDirection(new THREE.Vector3());

  raycaster.set(origin, dir);

  // Intersect top layer meshes + water source + crop meshes
  const candidates = [];
  for (const m of topMeshes) candidates.push(m);
  if (waterSourceMesh) candidates.push(waterSourceMesh);
  for (const c of crops.values()) if (c.mesh) candidates.push(c.mesh);

  const hits = raycaster.intersectObjects(candidates, true);

  if (hits.length === 0) return null;

  // Find first hit that maps to either crop mesh (userData.isCrop) or block mesh (userData.block)
  for (const h of hits) {
    let obj = h.object;
    // climb to group parent that carries metadata
    while (obj && !obj.userData) obj = obj.parent;

    if (h.object.userData?.isCrop || obj.userData?.isCrop) {
      const data = h.object.userData?.isCrop ? h.object.userData : obj.userData;
      return { isCrop: true, x: data.x, y: 1, z: data.z, point: h.point, normal: h.face?.normal?.clone() ?? new THREE.Vector3() };
    }

    if (obj.userData?.block) {
      const d = obj.userData;
      return { isCrop: false, x: d.x, y: d.y, z: d.z, block: d.block, point: h.point, normal: h.face?.normal?.clone() ?? new THREE.Vector3() };
    }
  }

  return null;
}

function updateHighlight() {
  targetHit = getIntersect();

  if (!targetHit) {
    highlight.visible = false;
    return;
  }

  // Crop highlight uses its block position
  highlight.visible = true;
  highlight.position.set(targetHit.x + 0.5, targetHit.y + 0.5, targetHit.z + 0.5);
}

// ============================================================
// WATER SYSTEM (STATIC)
// ============================================================
function isWaterBlock(b) {
  return b === BLOCK.WATER || b === BLOCK.WATER_SOURCE;
}

// ============================================================
// BLOCK / ITEM INTERACTIONS
// ============================================================
function dropItem(itemId, count, position) {
  const tex = ItemDefs[itemId].icon;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(0.5, 0.5, 0.5);
  spr.position.copy(position);

  scene.add(spr);

  drops.push({
    itemId,
    count,
    pos: spr.position,
    vel: new THREE.Vector3((Math.random() - 0.5) * 2, 3.5 + Math.random() * 1.5, (Math.random() - 0.5) * 2),
    mesh: spr,
  });
}

function tryPickupDrops(dt) {
  const p = controls.getObject().position;
  for (let i = drops.length - 1; i >= 0; i--) {
    const d = drops[i];

    // simple gravity + damping
    d.vel.y -= 12 * dt;
    d.vel.multiplyScalar(1 - 1.5 * dt);
    d.pos.addScaledVector(d.vel, dt);

    // don't fall through ground
    if (d.pos.y < 2.2) { d.pos.y = 2.2; d.vel.y = 0; }

    // pickup if close
    const dist = d.pos.distanceTo(p);
    if (dist < 1.4) {
      const leftover = addItemToInventory(d.itemId, d.count);
      if (leftover === 0) {
        scene.remove(d.mesh);
        drops.splice(i, 1);
        updateHotbarUI();
      } else {
        d.count = leftover;
      }
    }
  }
}

function breakTopBlock(x, z) {
  const b = getBlock(x, 1, z);
  if (b === BLOCK.AIR) return false;
  if (b === BLOCK.WATER_SOURCE) return false; // indestructible
  // Only y=1 blocks are breakable; enforced here
  const def = BlockDefs[b];
  if (!def?.breakable) return false;

  // If crop exists on farmland, remove it
  removeCropAt(x, z);

  // Drop dirt item for dirt-like blocks (grass/dirt/farmland)
  if (b === BLOCK.GRASS || b === BLOCK.DIRT || b === BLOCK.FARMLAND) {
    dropItem(ITEM.DIRT_ITEM, 1, new THREE.Vector3(x + 0.5, 2.4, z + 0.5));
    // Start grass regrow timer if we later place dirt; but broken is air.
  }

  // Water breaks to air (no drops)
  setBlock(x, 1, z, BLOCK.AIR);
  return true;
}

function placeTopBlock(x, z, type) {
  if (!inBounds(x, z)) return false;
  if (getBlock(x, 1, z) !== BLOCK.AIR) return false;

  setBlock(x, 1, z, type);

  // If placing dirt, schedule grass regrowth
  if (type === BLOCK.DIRT) {
    grassRegrowTimer[idx(x, z)] = THREE.MathUtils.lerp(GRASS_REGROW_MIN, GRASS_REGROW_MAX, Math.random());
  } else {
    grassRegrowTimer[idx(x, z)] = 0;
  }

  return true;
}

function hoeDirtToFarmland(x, z) {
  const b = getBlock(x, 1, z);
  if (b !== BLOCK.DIRT && b !== BLOCK.GRASS) return false;

  setBlock(x, 1, z, BLOCK.FARMLAND);
  grassRegrowTimer[idx(x, z)] = 0;
  farmlandDryTimer[idx(x, z)] = 0;
  return true;
}

function handleLeftClick() {
  if (!targetHit) return;

  // Harvest crop if fully grown
  if (targetHit.isCrop) {
    const key = cropKey(targetHit.x, targetHit.z);
    const c = crops.get(key);
    if (c && c.stage === 3) {
      // Remove crop
      removeCropAt(targetHit.x, targetHit.z);

      // Drop wheat (usually 1, rarely 2 ~10%)
      const count = (Math.random() < 0.10) ? 2 : 1;
      dropItem(ITEM.WHEAT, count, new THREE.Vector3(targetHit.x + 0.5, 2.4, targetHit.z + 0.5));
    }
    return;
  }

  // Break block (only y=1 allowed; y=0 unbreakable)
  if (targetHit.y !== 1) return;

  const b = getBlock(targetHit.x, 1, targetHit.z);

  // If it's farmland with a crop, breaking farmland also removes crop (handled in breakTopBlock)
  // Tools: shovel can be (optionally) faster, but we keep instant break for clarity.
  breakTopBlock(targetHit.x, targetHit.z);
}

function handleRightClick() {
  if (!targetHit) return;

  const sel = getSelected();
  const itemId = sel.id;

  // Helper: compute placement position adjacent to hit block face
  function getPlacePos() {
    // Normal is in local face space of cube (axis-aligned)
    const n = targetHit.normal.clone();
    // Snap normal to cardinal axis
    const ax = Math.round(n.x);
    const ay = Math.round(n.y);
    const az = Math.round(n.z);
    const px = targetHit.x + ax;
    const py = targetHit.y + ay;
    const pz = targetHit.z + az;
    return { x: px, y: py, z: pz };
  }

  // ----------------------------------------------------------
  // BUCKET BEHAVIOR
  // ----------------------------------------------------------
  if (itemId === ITEM.BUCKET_EMPTY) {
    // RMB water source -> becomes water bucket
    if (!targetHit.isCrop && targetHit.y === 1) {
      const b = getBlock(targetHit.x, 1, targetHit.z);
      if (b === BLOCK.WATER_SOURCE) {
        setSelectedItem(ITEM.BUCKET_WATER);
        updateHotbarUI();
        return;
      }
      // RMB placed water -> pick up (break / pick up)
      if (b === BLOCK.WATER) {
        setBlock(targetHit.x, 1, targetHit.z, BLOCK.AIR);
        setSelectedItem(ITEM.BUCKET_WATER);
        updateHotbarUI();
        return;
      }
    }
  }

  if (itemId === ITEM.BUCKET_WATER) {
    // RMB places water block (static), then bucket returns to empty
    const p = getPlacePos();

    // Only place on y=1
    if (p.y !== 1) return;
    if (!inBounds(p.x, p.z)) return;
    if (getBlock(p.x, 1, p.z) !== BLOCK.AIR) return;

    placeTopBlock(p.x, p.z, BLOCK.WATER);
    setSelectedItem(ITEM.BUCKET_EMPTY);
    updateHotbarUI();
    return;
  }

  // ----------------------------------------------------------
  // HOE -> FARMLAND
  // ----------------------------------------------------------
  if (itemId === ITEM.HOE) {
    if (!targetHit.isCrop && targetHit.y === 1) {
      if (hoeDirtToFarmland(targetHit.x, targetHit.z)) return;
    }
  }

  // ----------------------------------------------------------
  // PLANTING SEEDS (ONLY on farmland, RMB farmland)
  // ----------------------------------------------------------
  if (itemId === ITEM.SEEDS) {
    if (!targetHit.isCrop && targetHit.y === 1) {
      const b = getBlock(targetHit.x, 1, targetHit.z);
      if (b === BLOCK.FARMLAND) {
        const key = cropKey(targetHit.x, targetHit.z);
        if (crops.has(key)) return; // already planted
        if (consumeSelected(1)) {
          plantWheat(targetHit.x, targetHit.z);
          updateHotbarUI();
          return;
        }
      }
    }
  }

  // ----------------------------------------------------------
  // PLACE DIRT (from dirt item) at y=1
  // ----------------------------------------------------------
  if (itemId === ITEM.DIRT_ITEM) {
    const p = getPlacePos();
    if (p.y !== 1) return;
    if (!inBounds(p.x, p.z)) return;
    if (getBlock(p.x, 1, p.z) !== BLOCK.AIR) return;

    if (consumeSelected(1)) {
      placeTopBlock(p.x, p.z, BLOCK.DIRT);
      updateHotbarUI();
      return;
    }
  }

  // ----------------------------------------------------------
  // Fallback: no action
  // ----------------------------------------------------------
}

// ============================================================
// FARMLAND HYDRATION + GRASS REGROWTH
// ============================================================
function isHydrated(x, z) {
  // within radius (square radius) of ANY water (source or placed)
  for (let dz = -FARMLAND_HYDRATION_RADIUS; dz <= FARMLAND_HYDRATION_RADIUS; dz++) {
    for (let dx = -FARMLAND_HYDRATION_RADIUS; dx <= FARMLAND_HYDRATION_RADIUS; dx++) {
      const nx = x + dx;
      const nz = z + dz;
      if (!inBounds(nx, nz)) continue;
      const b = getBlock(nx, 1, nz);
      if (isWaterBlock(b)) return true;
    }
  }
  return false;
}

function updateFarmland(dt) {
  for (let z = 0; z < WORLD_SIZE; z++) {
    for (let x = 0; x < WORLD_SIZE; x++) {
      const i = idx(x, z);
      const b = worldTop[i];
      if (b !== BLOCK.FARMLAND) {
        farmlandDryTimer[i] = 0;
        continue;
      }

      const hydrated = isHydrated(x, z);
      if (hydrated) {
        farmlandDryTimer[i] = 0;
      } else {
        farmlandDryTimer[i] += dt;
        if (farmlandDryTimer[i] >= FARMLAND_DRY_REVERT_SECONDS) {
          // Revert to dirt and remove crop
          removeCropAt(x, z);
          setBlock(x, 1, z, BLOCK.DIRT);
          farmlandDryTimer[i] = 0;

          // Start grass regrowth timer (dirt -> grass)
          grassRegrowTimer[i] = THREE.MathUtils.lerp(GRASS_REGROW_MIN, GRASS_REGROW_MAX, Math.random());
        }
      }
    }
  }
}

function updateGrassRegrowth(dt) {
  for (let z = 0; z < WORLD_SIZE; z++) {
    for (let x = 0; x < WORLD_SIZE; x++) {
      const i = idx(x, z);
      if (worldTop[i] !== BLOCK.DIRT) {
        grassRegrowTimer[i] = 0;
        continue;
      }
      if (grassRegrowTimer[i] <= 0) continue;

      grassRegrowTimer[i] -= dt;
      if (grassRegrowTimer[i] <= 0) {
        setBlock(x, 1, z, BLOCK.GRASS);
        grassRegrowTimer[i] = 0;
      }
    }
  }
}

// ============================================================
// UI
// ============================================================
buildHotbarUI();

// ============================================================
// GAME LOOP
// ============================================================
function initWorld() {
  // y=1 initially dirt blocks with grass top (GRASS) everywhere
  for (let z = 0; z < WORLD_SIZE; z++) {
    for (let x = 0; x < WORLD_SIZE; x++) {
      worldTop[idx(x, z)] = BLOCK.GRASS;
      farmlandDryTimer[idx(x, z)] = 0;
      grassRegrowTimer[idx(x, z)] = 0;
    }
  }

  // One infinite water source block at the center of one island edge (y=1)
  worldTop[idx(EDGE_WATER_SOURCE.x, EDGE_WATER_SOURCE.z)] = BLOCK.WATER_SOURCE;

  markWorldDirty();

  // Player spawn: near center, standing on ground.
  const spawnX = WORLD_SIZE / 2 + 0.5;
  const spawnZ = WORLD_SIZE / 2 + 0.5;
  const spawnFeetY = 2.0; // ground top is y=2
  controls.getObject().position.set(spawnX, spawnFeetY, spawnZ);

  camera.position.set(0, PLAYER_EYE, 0); // camera is within controls object; PointerLockControls handles this
}

initWorld();

let last = performance.now();

function animate() {
  requestAnimationFrame(animate);

  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (worldDirty) buildWorldMeshes();

  if (controls.isLocked) {
    // Movement wish velocity in XZ
    const { forward, right } = getForwardRight();
    const wish = new THREE.Vector3();

    if (keys.w) wish.add(forward);
    if (keys.s) wish.sub(forward);
    if (keys.d) wish.add(right);
    if (keys.a) wish.sub(right);

    if (wish.lengthSq() > 0) wish.normalize();

    const speed = keys.ctrl ? SPRINT_SPEED : WALK_SPEED;
    wish.multiplyScalar(speed);

    moveWithCollisions(dt, wish);

    // Update highlight target
    updateHighlight();

    // Systems
    updateFarmland(dt);
    updateGrassRegrowth(dt);
    updateCrops(dt);
    tryPickupDrops(dt);
  }

  renderer.render(scene, camera);
}

animate();

// ============================================================
// RESIZE
// ============================================================
window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ============================================================
// FUTURE EXPANSION HOOKS
// ============================================================
// - Add new crops: extend CropDefs and planting/harvest rules in handleRightClick/handleLeftClick.
// - Add NPCs (villagers): create an entity system + simple AI update loop here.
// (NPCs NOT implemented per requirements.)
