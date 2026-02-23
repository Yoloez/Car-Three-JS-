import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

// ============================================================
//  1. SCENE — night circuit atmosphere
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0a1a);
scene.fog = new THREE.FogExp2(0x0a0a1a, 0.003);

const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.1, 2000);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

// ============================================================
//  2. LIGHTING — night race with strong spots
// ============================================================
scene.add(new THREE.AmbientLight(0x223344, 0.5));
scene.add(new THREE.HemisphereLight(0x112233, 0x0a0a1a, 0.3));

const dirLight = new THREE.DirectionalLight(0xddeeff, 2.0);
dirLight.position.set(60, 80, 40);
dirLight.castShadow = true;
dirLight.shadow.mapSize.set(4096, 4096);
dirLight.shadow.camera.near = 1;
dirLight.shadow.camera.far = 400;
dirLight.shadow.camera.left = -120;
dirLight.shadow.camera.right = 120;
dirLight.shadow.camera.top = 120;
dirLight.shadow.camera.bottom = -120;
dirLight.shadow.bias = -0.001;
scene.add(dirLight);
scene.add(dirLight.target);

// ============================================================
//  3. PROCEDURAL RACE TRACK
// ============================================================

// --- 3a. Track spline (circuit loop) ---
const trackPoints = [
  new THREE.Vector3(0, 0, 0),
  new THREE.Vector3(50, 0, -15),
  new THREE.Vector3(80, 0, -50),
  new THREE.Vector3(90, 0, -100),
  new THREE.Vector3(65, 0, -145),
  new THREE.Vector3(20, 0, -170),
  new THREE.Vector3(-35, 0, -155),
  new THREE.Vector3(-75, 0, -120),
  new THREE.Vector3(-95, 0, -70),
  new THREE.Vector3(-80, 0, -20),
  new THREE.Vector3(-50, 0, 15),
  new THREE.Vector3(-20, 0, 25),
];

const trackCurve = new THREE.CatmullRomCurve3(trackPoints, true, "catmullrom", 0.5);
const TRACK_SEGMENTS = 600;
const TRACK_WIDTH = 14;

// --- 3b. Build road mesh ---
function buildTrackMesh() {
  const pts = trackCurve.getSpacedPoints(TRACK_SEGMENTS);
  const frames = trackCurve.computeFrenetFrames(TRACK_SEGMENTS, true);

  const positions = [];
  const uvs = [];
  const normals = [];

  for (let i = 0; i <= TRACK_SEGMENTS; i++) {
    const p = pts[i];
    const b = frames.binormals[i];
    const right = new THREE.Vector3(b.x, 0, b.z).normalize();

    const left = p.clone().add(right.clone().multiplyScalar(-TRACK_WIDTH / 2));
    const rightPt = p.clone().add(right.clone().multiplyScalar(TRACK_WIDTH / 2));

    positions.push(left.x, 0.01, left.z);
    positions.push(rightPt.x, 0.01, rightPt.z);
    uvs.push(0, (i / TRACK_SEGMENTS) * 60);
    uvs.push(1, (i / TRACK_SEGMENTS) * 60);
    normals.push(0, 1, 0, 0, 1, 0);
  }

  const indices = [];
  for (let i = 0; i < TRACK_SEGMENTS; i++) {
    const a = i * 2,
      b = i * 2 + 1,
      c = (i + 1) * 2,
      d = (i + 1) * 2 + 1;
    indices.push(a, c, b, b, c, d);
  }

  const roadGeo = new THREE.BufferGeometry();
  roadGeo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  roadGeo.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  roadGeo.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  roadGeo.setIndex(indices);

  // Procedural asphalt texture
  const roadCanvas = document.createElement("canvas");
  roadCanvas.width = 512;
  roadCanvas.height = 512;
  const ctx = roadCanvas.getContext("2d");
  ctx.fillStyle = "#222222";
  ctx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 10000; i++) {
    const g = Math.random() * 25 + 28;
    ctx.fillStyle = `rgba(${g},${g},${g},0.3)`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
  }
  // Center dashed line
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 4;
  ctx.setLineDash([30, 20]);
  ctx.beginPath();
  ctx.moveTo(256, 0);
  ctx.lineTo(256, 512);
  ctx.stroke();
  // Edge lines
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 6;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(18, 0);
  ctx.lineTo(18, 512);
  ctx.moveTo(494, 0);
  ctx.lineTo(494, 512);
  ctx.stroke();

  const roadTex = new THREE.CanvasTexture(roadCanvas);
  roadTex.wrapS = roadTex.wrapT = THREE.RepeatWrapping;
  roadTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    roughness: 0.85,
    metalness: 0.0,
    color: 0x888888,
  });

  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = true;
  scene.add(roadMesh);

  return { pts, frames };
}

// --- 3c. Red-white curbs ---
function buildCurbs(pts, frames) {
  const curbWidth = 1.2;
  ["left", "right"].forEach((side) => {
    const geo = new THREE.BufferGeometry();
    const pos = [],
      uv = [],
      norm = [];

    for (let i = 0; i <= TRACK_SEGMENTS; i++) {
      const p = pts[i];
      const b = frames.binormals[i];
      const right = new THREE.Vector3(b.x, 0, b.z).normalize();
      const offset = TRACK_WIDTH / 2;
      const dir = side === "right" ? 1 : -1;

      const inner = p.clone().add(right.clone().multiplyScalar(dir * offset));
      const outer = inner.clone().add(right.clone().multiplyScalar(dir * curbWidth));

      pos.push(inner.x, 0.025, inner.z, outer.x, 0.025, outer.z);
      uv.push(0, i * 0.5, 1, i * 0.5);
      norm.push(0, 1, 0, 0, 1, 0);
    }

    const idx = [];
    for (let i = 0; i < TRACK_SEGMENTS; i++) {
      const a = i * 2,
        b = i * 2 + 1,
        c = (i + 1) * 2,
        d = (i + 1) * 2 + 1;
      idx.push(a, c, b, b, c, d);
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
    geo.setIndex(idx);

    const cCanvas = document.createElement("canvas");
    cCanvas.width = 64;
    cCanvas.height = 64;
    const cctx = cCanvas.getContext("2d");
    for (let y = 0; y < 64; y += 16) {
      cctx.fillStyle = (y / 16) % 2 === 0 ? "#cc0000" : "#ffffff";
      cctx.fillRect(0, y, 64, 16);
    }
    const cTex = new THREE.CanvasTexture(cCanvas);
    cTex.wrapS = cTex.wrapT = THREE.RepeatWrapping;

    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: cTex, roughness: 0.6 }));
    mesh.receiveShadow = true;
    scene.add(mesh);
  });
}

// --- 3d. Barriers ---
function buildBarriers(pts, frames) {
  const barrierH = 1.4;
  const barrierOff = TRACK_WIDTH / 2 + 2.2;

  ["left", "right"].forEach((side) => {
    const geo = new THREE.BufferGeometry();
    const pos = [],
      norm = [],
      uv = [];
    const dir = side === "right" ? 1 : -1;

    for (let i = 0; i <= TRACK_SEGMENTS; i++) {
      const p = pts[i];
      const b = frames.binormals[i];
      const right = new THREE.Vector3(b.x, 0, b.z).normalize();
      const base = p.clone().add(right.clone().multiplyScalar(dir * barrierOff));

      pos.push(base.x, 0, base.z, base.x, barrierH, base.z);
      uv.push(i * 0.3, 0, i * 0.3, 1);
      const n = right.clone().multiplyScalar(-dir);
      norm.push(n.x, 0, n.z, n.x, 0, n.z);
    }

    const idx = [];
    for (let i = 0; i < TRACK_SEGMENTS; i++) {
      const a = i * 2,
        b = i * 2 + 1,
        c = (i + 1) * 2,
        d = (i + 1) * 2 + 1;
      idx.push(a, b, c, b, d, c);
    }
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute("normal", new THREE.Float32BufferAttribute(norm, 3));
    geo.setIndex(idx);

    const bCanvas = document.createElement("canvas");
    bCanvas.width = 128;
    bCanvas.height = 64;
    const bctx = bCanvas.getContext("2d");
    for (let x = 0; x < 128; x += 32) {
      bctx.fillStyle = (x / 32) % 2 === 0 ? "#1565c0" : "#e0e0e0";
      bctx.fillRect(x, 0, 32, 64);
    }
    const bTex = new THREE.CanvasTexture(bCanvas);
    bTex.wrapS = bTex.wrapT = THREE.RepeatWrapping;

    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: bTex, roughness: 0.5, metalness: 0.1 }));
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
  });
}

// --- 3e. Ground (grass) ---
function buildGround() {
  const gC = document.createElement("canvas");
  gC.width = 512;
  gC.height = 512;
  const gx = gC.getContext("2d");
  gx.fillStyle = "#0f2a0f";
  gx.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 15000; i++) {
    const g = Math.random() * 25 + 15;
    gx.fillStyle = `rgba(${g},${g + 28},${g},0.35)`;
    gx.fillRect(Math.random() * 512, Math.random() * 512, 1, 3);
  }
  const grassTex = new THREE.CanvasTexture(gC);
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping;
  grassTex.repeat.set(80, 80);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(800, 800), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1, color: 0x1a4a1a }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);
}

// --- 3f. Track lights ---
function buildTrackLights(pts, frames) {
  const interval = 18;
  const lOff = TRACK_WIDTH / 2 + 3.8;

  for (let i = 0; i < TRACK_SEGMENTS; i += interval) {
    const p = pts[i];
    const b = frames.binormals[i];
    const right = new THREE.Vector3(b.x, 0, b.z).normalize();

    [-1, 1].forEach((side) => {
      const base = p.clone().add(right.clone().multiplyScalar(side * lOff));

      // Pole
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 7, 6), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.3 }));
      pole.position.set(base.x, 3.5, base.z);
      pole.castShadow = true;
      scene.add(pole);

      // Bulb glow
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 8), new THREE.MeshBasicMaterial({ color: 0xffeeaa }));
      bulb.position.set(base.x, 7.1, base.z);
      scene.add(bulb);

      // Point light
      const pl = new THREE.PointLight(0xffddaa, 18, 30, 2);
      pl.position.set(base.x, 7, base.z);
      scene.add(pl);
    });
  }
}

// --- 3g. Start line (checkered) ---
function buildStartLine(pts, frames) {
  const p = pts[0];
  const lineC = document.createElement("canvas");
  lineC.width = 128;
  lineC.height = 128;
  const lx = lineC.getContext("2d");
  const sz = 16;
  for (let x = 0; x < 128; x += sz) {
    for (let y = 0; y < 128; y += sz) {
      lx.fillStyle = ((x + y) / sz) % 2 === 0 ? "#ffffff" : "#111111";
      lx.fillRect(x, y, sz, sz);
    }
  }
  const lineTex = new THREE.CanvasTexture(lineC);
  const startLine = new THREE.Mesh(new THREE.PlaneGeometry(TRACK_WIDTH, 3), new THREE.MeshStandardMaterial({ map: lineTex, roughness: 0.5 }));
  startLine.rotation.x = -Math.PI / 2;
  startLine.position.set(p.x, 0.025, p.z);

  const tang = trackCurve.getTangentAt(0);
  startLine.rotation.z = -Math.atan2(tang.x, tang.z);
  startLine.receiveShadow = true;
  scene.add(startLine);
}

// --- 3h. Grandstands ---
function buildGrandstands(pts, frames) {
  const indices = [0, Math.floor(TRACK_SEGMENTS * 0.25), Math.floor(TRACK_SEGMENTS * 0.5), Math.floor(TRACK_SEGMENTS * 0.75)];
  const mat = new THREE.MeshStandardMaterial({ color: 0x444466, roughness: 0.7 });

  indices.forEach((idx) => {
    const p = pts[idx];
    const b = frames.binormals[idx];
    const right = new THREE.Vector3(b.x, 0, b.z).normalize();
    const t = trackCurve.getTangentAt(idx / TRACK_SEGMENTS);

    [-1, 1].forEach((side) => {
      const pos = p.clone().add(right.clone().multiplyScalar(side * (TRACK_WIDTH / 2 + 10)));
      const stand = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 5), mat);
      stand.position.set(pos.x, 2.5, pos.z);
      stand.rotation.y = Math.atan2(t.x, t.z);
      stand.castShadow = true;
      stand.receiveShadow = true;
      scene.add(stand);

      const seats = new THREE.Mesh(new THREE.BoxGeometry(13, 0.3, 4.5), new THREE.MeshStandardMaterial({ color: side > 0 ? 0xe53935 : 0x1e88e5 }));
      seats.position.set(pos.x, 5.15, pos.z);
      seats.rotation.y = Math.atan2(t.x, t.z);
      scene.add(seats);
    });
  });
}

// --- BUILD EVERYTHING ---
const { pts: trackPts, frames: trackFrames } = buildTrackMesh();
buildCurbs(trackPts, trackFrames);
buildBarriers(trackPts, trackFrames);
buildGround();
buildTrackLights(trackPts, trackFrames);
buildStartLine(trackPts, trackFrames);
buildGrandstands(trackPts, trackFrames);

// --- Stars (night sky) ---
const starGeo = new THREE.BufferGeometry();
const starPos = [];
for (let i = 0; i < 3000; i++) {
  const r = 350 + Math.random() * 400;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.random() * Math.PI * 0.45 + 0.05;
  starPos.push(r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi) + 40, r * Math.sin(phi) * Math.sin(theta));
}
starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
scene.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, sizeAttenuation: true })));

// ============================================================
//  4. LOAD F1 CAR
// ============================================================
const loader = new GLTFLoader();
let carModel = null;
let carBottomOffset = 0;

loader.load(
  "/small_price_car.glb",
  (gltf) => {
    const raw = gltf.scene;

    // Normalize to ~4 units long
    const box = new THREE.Box3().setFromObject(raw);
    const size = box.getSize(new THREE.Vector3());
    const scale = 4 / Math.max(size.x, size.y, size.z);
    raw.scale.multiplyScalar(scale);

    // Recenter
    box.setFromObject(raw);
    const center = box.getCenter(new THREE.Vector3());
    raw.position.sub(center);
    raw.position.y += box.getSize(new THREE.Vector3()).y / 2;

    const pivot = new THREE.Group();
    raw.rotation.y = Math.PI;
    pivot.add(raw);
    // pivot.rotation.y = Math.PI;
    pivot.rotation.y = (3 * Math.PI) / 2;
    scene.add(pivot);

    const finalBox = new THREE.Box3().setFromObject(pivot);
    carBottomOffset = -finalBox.min.y;
    carModel = pivot;

    raw.traverse((c) => {
      if (c.isMesh) {
        c.castShadow = true;
        c.receiveShadow = true;
      }
    });

    placeCarOnTrack();
    console.log("F1 loaded!", finalBox.getSize(new THREE.Vector3()));

    // Hide loading, show GO!
    hideLoading();
    setTimeout(() => showMessage("GO!", 2500), 400);
  },
  (progress) => {
    const bar = document.getElementById("load-progress-fill");
    if (!bar) return;
    if (progress.total > 0) {
      bar.style.width = Math.round((progress.loaded / progress.total) * 100) + "%";
    } else {
      // Unknown total (local dev) — animate with loaded bytes
      bar.style.width = Math.min(90, (progress.loaded / 800000) * 100) + "%";
    }
  },
  (e) => {
    console.error("F1 error:", e);
    hideLoading();
    showMessage("⚠️ Model load failed", 4000);
  },
);

// Safety fallback — hide loading after 8s no matter what
setTimeout(hideLoading, 8000);

function hideLoading() {
  const el = document.getElementById("loading");
  if (!el || el._hidden) return;
  el._hidden = true;
  el.style.transition = "opacity 0.6s ease";
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
  setTimeout(() => {
    if (el.parentNode) el.parentNode.removeChild(el);
  }, 700);
}

function placeCarOnTrack() {
  if (!carModel) return;
  const startPt = trackCurve.getPointAt(0);
  const tangent = trackCurve.getTangentAt(0);
  const angle = Math.atan2(tangent.x, tangent.z);

  carModel.position.set(startPt.x, carBottomOffset + 0.01, startPt.z);
  //   carModel.rotation.y = angle;/
  carModel.rotation.y = angle + Math.PI;

  camState.currentPos.set(startPt.x - tangent.x * 8, 2.5, startPt.z - tangent.z * 8);
  camState.currentLookAt.copy(carModel.position);
}

// ============================================================
//  5. TIRE SMOKE
// ============================================================
const smokeParticles = [];
const smokeGeo = new THREE.SphereGeometry(0.12, 5, 5);
const smokeMat = new THREE.MeshBasicMaterial({ color: 0xaaaaaa, transparent: true, opacity: 0.45, depthWrite: false });

function spawnSmoke(pos) {
  if (smokeParticles.length > 100) return;
  const m = new THREE.Mesh(smokeGeo, smokeMat.clone());
  m.position.copy(pos);
  m.position.y = 0.15;
  m.userData = {
    life: 0.7,
    vel: new THREE.Vector3((Math.random() - 0.5) * 1.2, Math.random() * 1.5 + 0.3, (Math.random() - 0.5) * 1.2),
  };
  scene.add(m);
  smokeParticles.push(m);
}

function updateSmoke(dt) {
  for (let i = smokeParticles.length - 1; i >= 0; i--) {
    const p = smokeParticles[i];
    p.userData.life -= dt;
    if (p.userData.life <= 0) {
      scene.remove(p);
      p.geometry?.dispose();
      p.material?.dispose();
      smokeParticles.splice(i, 1);
      continue;
    }
    p.position.addScaledVector(p.userData.vel, dt);
    p.scale.multiplyScalar(1 + dt * 2.8);
    p.material.opacity = p.userData.life * 0.5;
  }
}

// ============================================================
//  6. MOVEMENT — F1 physics
// ============================================================
const keys = {};
const state = { speed: 0, turn: 0, drift: false };

const PHY = {
  maxSpeed: 22,
  reverseMax: 10,
  accel: 22,
  brake: 42,
  drag: 7,
  maxTurn: 2.8,
  turnAccel: 9,
  turnDrag: 6,
  drsBoost: 1.55,
};

addEventListener("keydown", (e) => {
  keys[e.key.toLowerCase()] = true;
  if (e.key === "Shift") keys.shift = true;
  if (e.key.toLowerCase() === "r" && carModel) {
    state.speed = state.turn = 0;
    placeCarOnTrack();
    showMessage("🔄 RESET", 1200);
  }
});
addEventListener("keyup", (e) => {
  keys[e.key.toLowerCase()] = false;
  if (e.key === "Shift") keys.shift = false;
});

renderer.domElement.tabIndex = 0;
renderer.domElement.style.outline = "none";
renderer.domElement.addEventListener("click", () => renderer.domElement.focus());

let smokeT = 0;

function updateCar(dt) {
  if (!carModel || dt <= 0) return;

  const boost = keys.shift ? PHY.drsBoost : 1;
  const maxS = PHY.maxSpeed * boost;

  // Throttle / brake
  if (keys.w) {
    if (state.speed < 0) state.speed = Math.min(state.speed + PHY.brake * dt, 0);
    else state.speed = Math.min(state.speed + PHY.accel * dt, maxS);
  } else if (keys.s) {
    if (state.speed > 0) state.speed = Math.max(state.speed - PHY.brake * dt, 0);
    else state.speed = Math.max(state.speed - PHY.accel * 0.4 * dt, -PHY.reverseMax);
  } else {
    if (state.speed > 0) state.speed = Math.max(state.speed - PHY.drag * dt, 0);
    else if (state.speed < 0) state.speed = Math.min(state.speed + PHY.drag * dt, 0);
  }

  // Steering with understeer
  const abs = Math.abs(state.speed);
  const sNorm = Math.min(abs / PHY.maxSpeed, 1);
  const steerMax = PHY.maxTurn * (1 - sNorm * 0.45);

  if (keys.a) state.turn = Math.min(state.turn + PHY.turnAccel * dt, steerMax);
  else if (keys.d) state.turn = Math.max(state.turn - PHY.turnAccel * dt, -steerMax);
  else {
    if (state.turn > 0) state.turn = Math.max(state.turn - PHY.turnDrag * dt, 0);
    else state.turn = Math.min(state.turn + PHY.turnDrag * dt, 0);
  }

  if (abs > 0.3) carModel.rotation.y += state.turn * (state.speed > 0 ? 1 : -1) * dt;

  // Drift
  state.drift = abs > 10 && Math.abs(state.turn) > 1.3;

  // Smoke
  smokeT += dt;
  if (smokeT > 0.035 && (state.drift || (keys.s && state.speed > 6))) {
    smokeT = 0;
    const behind = new THREE.Vector3(0, 0, 1.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), carModel.rotation.y).add(carModel.position);
    spawnSmoke(behind);
    // Second wheel
    const behind2 = new THREE.Vector3(Math.random() > 0.5 ? 0.7 : -0.7, 0, 1.3).applyAxisAngle(new THREE.Vector3(0, 1, 0), carModel.rotation.y).add(carModel.position);
    spawnSmoke(behind2);
  }

  // Move
  const dx = -Math.sin(carModel.rotation.y) * state.speed * dt;
  const dz = -Math.cos(carModel.rotation.y) * state.speed * dt;
  carModel.position.x += dx;
  carModel.position.z += dz;
  carModel.position.y = carBottomOffset + 0.01;

  // DRS
  const drs = document.getElementById("drs-indicator");
  if (drs) drs.classList.toggle("active", keys.shift && abs > 5);

  updateHUD();
}

// ============================================================
//  7. HUD
// ============================================================
function updateHUD() {
  const kmh = Math.abs(state.speed) * 12;
  const el = document.getElementById("speed-value");
  if (el) el.textContent = Math.round(kmh);

  const bar = document.getElementById("speed-bar-fill");
  if (bar) {
    const pct = Math.min((kmh / 420) * 100, 100);
    bar.style.width = pct + "%";
    bar.style.background = kmh < 120 ? "#4caf50" : kmh < 260 ? "#ff9800" : "#f44336";
  }

  const gear = document.getElementById("gear-indicator");
  if (gear) {
    if (state.speed < -0.3) gear.textContent = "R";
    else if (Math.abs(state.speed) < 0.3) gear.textContent = "N";
    else gear.textContent = Math.min(Math.floor(Math.abs(state.speed) / 6) + 1, 8);
  }

  const rpm = document.getElementById("rpm-bar-fill");
  if (rpm) {
    const r = ((Math.abs(state.speed) % 6) / 6) * 100;
    rpm.style.width = r + "%";
    rpm.style.background = r > 85 ? "#f44336" : r > 60 ? "#ff9800" : "#4caf50";
  }
}

// ============================================================
//  8. CAMERA — low behind-the-car POV
// ============================================================
const camState = {
  currentPos: new THREE.Vector3(0, 3, 8),
  currentLookAt: new THREE.Vector3(),
  shake: new THREE.Vector3(),
  fov: 105,
};

function updateCamera(dt) {
  if (!carModel) return;

  const abs = Math.abs(state.speed);
  const sN = Math.min(abs / PHY.maxSpeed, 1);

  // Dynamic FOV
  const targetFov = 65 + sN * 22;
  camState.fov = THREE.MathUtils.lerp(camState.fov, targetFov, 0.06);
  camera.fov = camState.fov;
  camera.updateProjectionMatrix();

  // Low & close behind car
  const dist = 5.5 + sN * 3.5; // 5.5 → 9
  const height = 1.5 + sN * 0.9; // 1.5 → 2.4 (very low = immersive)
  const lookAhead = 3 + sN * 5; // look further ahead at speed

  const offset = new THREE.Vector3(0, height, dist);
  offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), carModel.rotation.y);
  const targetPos = carModel.position.clone().add(offset);

  const forward = new THREE.Vector3(0, 0, -lookAhead);
  forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), carModel.rotation.y);
  const lookTarget = carModel.position
    .clone()
    .add(forward)
    .add(new THREE.Vector3(0, 0.5, 0));

  // Smooth follow
  const posLerp = 0.045 + sN * 0.05;
  const lookLerp = 0.08 + sN * 0.05;
  camState.currentPos.lerp(targetPos, posLerp);
  camState.currentLookAt.lerp(lookTarget, lookLerp);

  // Shake
  const shk = sN * 0.04;
  camState.shake.set((Math.random() - 0.5) * shk, (Math.random() - 0.5) * shk * 0.4, (Math.random() - 0.5) * shk);

  camera.position.copy(camState.currentPos).add(camState.shake);
  camera.lookAt(camState.currentLookAt);

  // Light follows car
  dirLight.position.set(carModel.position.x + 50, 80, carModel.position.z + 50);
  dirLight.target.position.copy(carModel.position);
  dirLight.target.updateMatrixWorld();
}

// ============================================================
//  9. MESSAGES
// ============================================================
function showMessage(text, dur = 2000) {
  const el = document.getElementById("center-msg");
  if (!el) return;
  el.textContent = text;
  el.style.opacity = "1";
  el.style.transform = "translate(-50%, -50%) scale(1)";
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translate(-50%, -50%) scale(0.8)";
  }, dur);
}

// ============================================================
//  10. LAP TIMER
// ============================================================
const lapState = {
  startTime: null, // ms timestamp of lap start
  bestTime: null, // best lap in seconds
  lapCount: 0,
  armed: false, // true after car has moved away from start line
  resultTimeout: null,
};

const LAP_START_PT = trackCurve.getPointAt(0); // start/finish position
const LAP_ARM_DIST = 20; // must drive this far before lap can trigger
const LAP_TRIGGER_DIST = 7; // crossing within this distance counts as finish

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  const cs = Math.floor((sec % 1) * 100);
  return `${m}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}

function checkLap() {
  if (!carModel) return;

  const dx = carModel.position.x - LAP_START_PT.x;
  const dz = carModel.position.z - LAP_START_PT.z;
  const dist = Math.sqrt(dx * dx + dz * dz);

  // Start timing on first movement away from start
  if (lapState.startTime === null && Math.abs(state.speed) > 0.5) {
    lapState.startTime = performance.now();
  }

  // Arm once car is far enough from start
  if (!lapState.armed && dist > LAP_ARM_DIST) {
    lapState.armed = true;
  }

  // Trigger finish when armed and back near start
  if (lapState.armed && dist < LAP_TRIGGER_DIST && lapState.startTime !== null) {
    const lapSec = (performance.now() - lapState.startTime) / 1000;
    const isBest = lapState.bestTime === null || lapSec < lapState.bestTime;
    if (isBest) lapState.bestTime = lapSec;
    lapState.lapCount++;
    lapState.startTime = performance.now();
    lapState.armed = false;
    showLapResult(lapSec, isBest);

    // Update best-lap HUD
    const bv = document.getElementById("best-lap-val");
    if (bv && lapState.bestTime !== null) bv.textContent = formatTime(lapState.bestTime);
  }
}

function updateTimerHUD() {
  if (lapState.startTime === null) return;
  const elapsed = (performance.now() - lapState.startTime) / 1000;
  const el = document.getElementById("lap-timer");
  if (el) el.textContent = formatTime(elapsed);
}

function showLapResult(lapSec, isBest) {
  const el = document.getElementById("lap-result");
  if (!el) return;

  const timeEl = document.getElementById("r-time");
  if (timeEl) {
    timeEl.textContent = formatTime(lapSec);
    timeEl.className = "r-time" + (isBest ? " purple" : "");
  }
  const bestEl = document.getElementById("r-best");
  if (bestEl) bestEl.textContent = isBest ? "NEW BEST LAP!" : `BEST  ${formatTime(lapState.bestTime)}`;
  const cntEl = document.getElementById("r-count");
  if (cntEl) cntEl.textContent = `LAP ${lapState.lapCount}`;

  el.classList.add("show");
  clearTimeout(lapState.resultTimeout);
  lapState.resultTimeout = setTimeout(() => el.classList.remove("show"), 5000);
}

// ============================================================
//  11. ANIMATION LOOP
// ============================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  updateCar(dt);
  updateSmoke(dt);
  updateCamera(dt);
  checkLap();
  updateTimerHUD();
  renderer.render(scene, camera);
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

animate();
