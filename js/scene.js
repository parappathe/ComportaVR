// Cenário: dentro de um moinho d'água numa manhã de sol, paredes de pedra, sacas de farinha, mó de
// pedra e, pela janela larga, o riacho com a roda d'água girando. Na mesa, o tabuleiro em pé: funis no
// alto, 6 canaletas com 24 comportas de madeira que viram e 6 caixas embaixo.
import * as THREE from '../vendor/three/three.module.js';
import { W, R, LEVERS } from './rules.js';
import { makeAvatar } from './avatar.js';

export const TABLE = { x: 0, z: -0.42, top: 0.84, w: 1.2, d: 0.62 };
export const BOARD = { z: -0.42, lane: 0.085, row: 0.074, topY: 1.44, binTop: 0.97, binBottom: 0.85, funnelY: 1.52 };
export const BALL = { r: 0.017 };
export const TEAM_COLOR = [0x3ac85a, 0x9a4ad8];
export const laneX = (x) => (x - (W - 1) / 2) * BOARD.lane;
export const rowY = (r) => BOARD.topY - (r + 0.5) * BOARD.row;
export const TRAYS = [
  { team: 0, pos: new THREE.Vector3(0.42, TABLE.top, -0.22) },
  { team: 0, pos: new THREE.Vector3(-0.42, TABLE.top, -0.22) },
  { team: 1, pos: new THREE.Vector3(0.45, TABLE.top, -0.62) },
];

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, { repeat = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  return t;
}
function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
function woodCanvas(w, h, base, dark, seed = 1, planks = 0) {
  const c = canvas(w, h), g = c.getContext('2d'), r = rand(seed);
  g.fillStyle = base; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(${dark},${0.04 + r() * 0.1})`; g.lineWidth = 1 + r() * 3;
    const y = r() * h; g.beginPath(); g.moveTo(0, y);
    for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * 0.01 + i) * 5 + (r() - 0.5) * 3);
    g.stroke();
  }
  if (planks) { g.strokeStyle = `rgba(${dark},0.5)`; g.lineWidth = 3; for (let k = 0; k <= planks; k++) { const y = k * h / planks; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } }
  return c;
}
function stoneCanvas() {
  const c = canvas(512, 512), g = c.getContext('2d'), r = rand(4);
  g.fillStyle = '#b8ab98'; g.fillRect(0, 0, 512, 512);
  for (let y = 0; y < 512; y += 48) for (let x = (y / 48) % 2 * 40; x < 512; x += 80) {
    g.fillStyle = `rgb(${170 + r() * 40},${158 + r() * 36},${138 + r() * 30})`;
    g.fillRect(x + 3, y + 3, 74, 42);
  }
  return c;
}
function outsideCanvas() {
  const W2 = 1024, H = 512, c = canvas(W2, H), g = c.getContext('2d'), r = rand(9);
  const sky = g.createLinearGradient(0, 0, 0, H * 0.55); sky.addColorStop(0, '#7ab8ea'); sky.addColorStop(1, '#e8f4f8');
  g.fillStyle = sky; g.fillRect(0, 0, W2, H);
  g.fillStyle = 'rgba(255,248,220,0.95)'; g.beginPath(); g.arc(200, 90, 40, 0, Math.PI * 2); g.fill();
  for (let i = 0; i < 30; i++) { const x = r() * W2, y = 190 + r() * 80, s = 40 + r() * 60; g.fillStyle = `hsl(${95 + r() * 30},40%,${28 + r() * 14}%)`; g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); }
  g.fillStyle = '#7ab05a'; g.fillRect(0, 300, W2, 60);
  const water = g.createLinearGradient(0, 340, 0, H); water.addColorStop(0, '#5aa8d8'); water.addColorStop(1, '#3a7ab8');
  g.fillStyle = water; g.fillRect(0, 350, W2, H);
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 3;
  for (let i = 0; i < 40; i++) { const x = r() * W2, y = 370 + r() * 130; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 30 + r() * 40, y); g.stroke(); }
  return c;
}
function binCanvas(values) {
  const c = canvas(1024, 128), g = c.getContext('2d');
  g.fillStyle = '#6a4428'; g.fillRect(0, 0, 1024, 128);
  values.forEach((v, k) => {
    const x = k * 1024 / W;
    g.fillStyle = v < 0 ? '#a83a2a' : v >= 6 ? '#d8a83a' : '#8a5a34';
    g.fillRect(x + 6, 6, 1024 / W - 12, 116);
    g.fillStyle = '#fff4dc'; g.font = 'bold 64px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(v > 0 ? `+${v}` : String(v), x + 512 / W, 58);
    if (v < 0) { g.font = 'bold 22px sans-serif'; g.fillText('RALO', x + 512 / W, 106); }
  });
  return c;
}

export function buildWorld(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xe8f4f8);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const hemi = new THREE.HemisphereLight(0xfff8ee, 0x8a7050, 1.35);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d4, 1.7);
  sun.position.set(-1.8, 3.0, 1.6);
  sun.target.position.set(0, 1.1, BOARD.z);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  const sc = sun.shadow.camera; sc.left = -0.8; sc.right = 0.8; sc.top = 0.9; sc.bottom = -0.6; sc.near = 0.5; sc.far = 7;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);

  // ---------- Moinho ----------
  const Wd = 7, D = 7, H = 3.2, cz = -1.0;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(Wd, D).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: tex(woodCanvas(1024, 1024, '#b08a5a', '80,50,20', 3, 9), { repeat: [3, 3] }) }));
  floor.position.set(0, 0, cz); floor.receiveShadow = true; scene.add(floor);
  const stoneMat = new THREE.MeshLambertMaterial({ map: tex(stoneCanvas(), { repeat: [4, 2] }) });
  const mkWall = (w, x, z, ry) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), stoneMat); m.position.set(x, H / 2, z); m.rotation.y = ry; scene.add(m); return m; };
  // parede do fundo com janela larga: três pedaços em volta do vão
  const winW = 3.2, winH = 1.5, winY = 1.75;
  const backZ = cz - D / 2;
  const side = (Wd - winW) / 2;
  for (const s of [-1, 1]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(side, H), stoneMat); m.position.set(s * (winW / 2 + side / 2), H / 2, backZ); scene.add(m); }
  const lowH = winY - winH / 2, hiH = H - (winY + winH / 2);
  const low = new THREE.Mesh(new THREE.PlaneGeometry(winW, lowH), stoneMat); low.position.set(0, lowH / 2, backZ); scene.add(low);
  const hi = new THREE.Mesh(new THREE.PlaneGeometry(winW, hiH), stoneMat); hi.position.set(0, H - hiH / 2, backZ); scene.add(hi);
  const view = new THREE.Mesh(new THREE.PlaneGeometry(9, 4.5), new THREE.MeshBasicMaterial({ map: tex(outsideCanvas()) }));
  view.position.set(0, 1.6, backZ - 2.6); scene.add(view);
  mkWall(D, -Wd / 2, cz, Math.PI / 2);
  mkWall(D, Wd / 2, cz, -Math.PI / 2);
  mkWall(Wd, 0, cz + D / 2, Math.PI);
  const beamMat = new THREE.MeshLambertMaterial({ color: 0x5a3a22 });
  for (let k = 0; k < 5; k++) { const b = new THREE.Mesh(new THREE.BoxGeometry(Wd, 0.16, 0.18), beamMat); b.position.set(0, H - 0.08, cz - D / 2 + 0.7 + k * 1.4); scene.add(b); }
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(Wd, D).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x8a6a4a })); ceil.position.set(0, H, cz); scene.add(ceil);
  for (const [x, y, w, h] of [[0, winY + winH / 2, winW + 0.2, 0.12], [0, winY - winH / 2, winW + 0.2, 0.12], [-winW / 2, winY, 0.12, winH], [winW / 2, winY, 0.12, winH], [0, winY, 0.08, winH]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), beamMat); f.position.set(x, y, backZ); scene.add(f);
  }
  // roda d'água lá fora (gira)
  const wheel = new THREE.Group();
  const wheelMat = new THREE.MeshLambertMaterial({ color: 0x7a5232 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.06, 6, 28), wheelMat); wheel.add(rim);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.4, 12).rotateX(Math.PI / 2), wheelMat); wheel.add(hub);
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6;
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.1, 0.05), wheelMat); spoke.position.set(Math.cos(a) * 0.55, Math.sin(a) * 0.55, 0); spoke.rotation.z = a - Math.PI / 2; wheel.add(spoke);
    const pad = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.4), wheelMat); pad.position.set(Math.cos(a) * 1.12, Math.sin(a) * 1.12, 0); pad.rotation.z = a; wheel.add(pad);
  }
  wheel.position.set(1.2, 1.0, backZ - 1.2); wheel.rotation.y = Math.PI / 2;
  scene.add(wheel);
  // mó, sacas e barris
  const mill = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 0.22, 24), new THREE.MeshLambertMaterial({ color: 0x9a9088 }));
  mill.position.set(-2.4, 0.5, -2.6); scene.add(mill);
  const millBase = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.75, 0.4, 24), beamMat); millBase.position.set(-2.4, 0.2, -2.6); scene.add(millBase);
  const sackGeo = new THREE.SphereGeometry(0.25, 10, 8).scale(1, 1.3, 0.8);
  const sacks = new THREE.InstancedMesh(sackGeo, new THREE.MeshLambertMaterial({ color: 0xe8dcc0 }), 8);
  const mtx = new THREE.Matrix4(), q = new THREE.Quaternion(), one = new THREE.Vector3(1, 1, 1);
  [[2.6, -2.8], [2.9, -2.4], [2.5, -2.2], [2.75, -2.6], [-2.9, 0.4], [-2.8, 0.9], [2.9, 0.2], [2.7, 0.7]].forEach(([x, z], k) => { q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), k); mtx.compose(new THREE.Vector3(x, 0.32 + (k === 3 ? 0.45 : 0), z), q, one); sacks.setMatrixAt(k, mtx); });
  scene.add(sacks);

  // ---------- Mesa ----------
  const tableMat = new THREE.MeshLambertMaterial({ map: tex(woodCanvas(512, 512, '#9a6a3e', '60,35,12', 2, 5)) });
  const tTop = new THREE.Mesh(new THREE.BoxGeometry(TABLE.w, 0.05, TABLE.d), tableMat); tTop.position.set(TABLE.x, TABLE.top - 0.025, TABLE.z); tTop.receiveShadow = true; scene.add(tTop);
  for (const [x, z] of [[-0.55, -0.26], [0.55, -0.26], [-0.55, 0.26], [0.55, 0.26]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.06, TABLE.top - 0.05, 0.06), beamMat); l.position.set(TABLE.x + x, (TABLE.top - 0.05) / 2, TABLE.z + z); scene.add(l); }
  const trayMat = new THREE.MeshLambertMaterial({ color: 0x8a5a32, side: THREE.DoubleSide });
  for (const t of TRAYS) {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.04, 18, 1, true), trayMat); tr.position.copy(t.pos).add(new THREE.Vector3(0, 0.02, 0)); scene.add(tr);
    const bt = new THREE.Mesh(new THREE.CircleGeometry(0.05, 18).rotateX(-Math.PI / 2), trayMat); bt.position.copy(t.pos).add(new THREE.Vector3(0, 0.002, 0)); scene.add(bt);
  }

  // ---------- Tabuleiro em pé ----------
  const board = new THREE.Group();
  board.position.set(0, 0, BOARD.z);
  scene.add(board);
  const bw = W * BOARD.lane + 0.04, bh = BOARD.funnelY + 0.06 - TABLE.top;
  const backC = woodCanvas(512, 512, '#e8d4a8', '120,90,50', 6);
  const bg = backC.getContext('2d');
  bg.strokeStyle = 'rgba(90,60,30,0.25)'; bg.lineWidth = 4;
  for (let x = 1; x < W; x++) { const px = x * 512 / W; bg.setLineDash([10, 12]); bg.beginPath(); bg.moveTo(px, 0); bg.lineTo(px, 512); bg.stroke(); }
  const back = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, 0.02), [beamMat, beamMat, beamMat, beamMat, new THREE.MeshLambertMaterial({ map: tex(backC) }), beamMat]);
  back.position.set(0, TABLE.top + bh / 2, -0.03); back.receiveShadow = true; board.add(back);
  for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.03, bh, 0.07), beamMat); p.position.set(s * (bw / 2 + 0.015), TABLE.top + bh / 2, 0); board.add(p); }
  for (const s of [-1, 1]) { const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.03, 0.22), beamMat); f.position.set(s * (bw / 2), TABLE.top + 0.015, 0); board.add(f); }
  const topBar = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.06, 0.025, 0.07), beamMat); topBar.position.set(0, BOARD.funnelY + 0.05, 0); board.add(topBar);
  // vidro da frente (bem leve)
  const front = new THREE.Mesh(new THREE.PlaneGeometry(bw, BOARD.topY - BOARD.binBottom), new THREE.MeshBasicMaterial({ color: 0xeefaff, transparent: true, opacity: 0.08, depthWrite: false }));
  front.position.set(0, (BOARD.topY + BOARD.binBottom) / 2, 0.03); board.add(front);
  // funis
  const brass = new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.6, roughness: 0.35 });
  const funnelGeo = new THREE.CylinderGeometry(0.032, 0.012, 0.05, 14, 1, true);
  const funnels = [];
  const funnelHits = [];
  const hitMat = new THREE.MeshBasicMaterial({ visible: false });
  for (let x = 0; x < W; x++) {
    const f = new THREE.Mesh(funnelGeo, new THREE.MeshStandardMaterial({ color: 0xd8b25a, metalness: 0.6, roughness: 0.35, side: THREE.DoubleSide, emissive: 0x000000 }));
    f.position.set(laneX(x), BOARD.funnelY, 0); board.add(f); funnels.push(f);
    // alvo grande da canaleta inteira, do funil até as caixas (para apontar e clicar)
    const h = new THREE.Mesh(new THREE.BoxGeometry(BOARD.lane * 0.95, BOARD.funnelY + 0.05 - BOARD.binBottom, 0.08), hitMat);
    h.position.set(laneX(x), (BOARD.funnelY + 0.05 + BOARD.binBottom) / 2, 0); h.userData.entry = x; board.add(h); funnelHits.push(h);
  }
  // número da entrada em cima de cada funil
  const numC = canvas(512, 64), ng = numC.getContext('2d');
  ng.fillStyle = '#5a3a22'; ng.fillRect(0, 0, 512, 64); ng.fillStyle = '#fff0cc'; ng.font = 'bold 44px sans-serif'; ng.textAlign = 'center'; ng.textBaseline = 'middle';
  for (let x = 0; x < W; x++) ng.fillText(String(x + 1), (x + 0.5) * 512 / W, 34);
  const nums = new THREE.Mesh(new THREE.PlaneGeometry(W * BOARD.lane, 0.035), new THREE.MeshBasicMaterial({ map: tex(numC) }));
  nums.position.set(0, BOARD.funnelY + 0.08, 0.036); board.add(nums);
  // comportas: palheta de madeira presa num pino
  const paddleGeo = new THREE.BoxGeometry(BOARD.lane * 0.78, 0.008, 0.03);
  const paddleMat = new THREE.MeshLambertMaterial({ color: 0x7a4a26 });
  const pinMat = new THREE.MeshLambertMaterial({ color: 0x3a2a1a });
  const goldPin = new THREE.MeshStandardMaterial({ color: 0xffc83a, metalness: 0.8, roughness: 0.25, emissive: 0x3a2a00 });
  const pinGeo = new THREE.CylinderGeometry(0.006, 0.006, 0.05, 8).rotateX(Math.PI / 2);
  const levers = LEVERS.map((l, k) => {
    const g = new THREE.Group();
    g.position.set(laneX(l.x), rowY(l.r), 0);
    const p = new THREE.Mesh(paddleGeo, paddleMat); p.castShadow = true; g.add(p);
    const pin = new THREE.Mesh(pinGeo, pinMat); g.add(pin);
    g.userData = { k, paddle: p, pin, angle: 0, target: 0 };
    board.add(g);
    return g;
  });
  const LEVER_ANGLE = 0.6;
  function setLever(k, dir, fixed, instant = false) {
    const g = levers[k];
    g.userData.target = dir * -LEVER_ANGLE;   // virada para a esquerda: a ponta baixa fica à esquerda
    if (instant) { g.userData.angle = g.userData.target; g.rotation.z = g.userData.angle; }
    g.userData.pin.material = fixed ? goldPin : pinMat;
    g.userData.pin.scale.setScalar(fixed ? 1.6 : 1);
  }
  // pinos fixos entre as comportas (enfeite que lembra um pachinko)
  const pegs = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.003, 0.003, 0.04, 6).rotateX(Math.PI / 2), brass, (W + 1) * R);
  let pi = 0;
  for (let r = 0; r < R; r++) for (let x = 0; x <= W; x++) { mtx.compose(new THREE.Vector3(laneX(x) - BOARD.lane / 2, rowY(r) - BOARD.row * 0.45, 0), q.identity(), one); pegs.setMatrixAt(pi++, mtx); }
  board.add(pegs);
  // caixas embaixo
  const binsG = new THREE.Group(); board.add(binsG);
  const binFront = new THREE.MeshLambertMaterial({ map: null });
  const binLabel = new THREE.Mesh(new THREE.PlaneGeometry(W * BOARD.lane, 0.032), binFront);
  binLabel.position.set(0, BOARD.binTop + 0.02, 0.04); board.add(binLabel);
  function setValues(values) {
    binFront.map?.dispose?.();
    binFront.map = tex(binCanvas(values));
    binFront.needsUpdate = true;
  }
  const divGeo = new THREE.BoxGeometry(0.006, BOARD.binTop - BOARD.binBottom, 0.06);
  for (let x = 0; x <= W; x++) { const d = new THREE.Mesh(divGeo, beamMat); d.position.set(laneX(x) - BOARD.lane / 2, (BOARD.binTop + BOARD.binBottom) / 2, 0); board.add(d); }
  const binFloor = new THREE.Mesh(new THREE.BoxGeometry(W * BOARD.lane, 0.01, 0.06), beamMat); binFloor.position.set(0, BOARD.binBottom - 0.005, 0); board.add(binFloor);
  // bandeirinha de quem lidera cada caixa (bônus de maioria)
  const flagGeo = new THREE.PlaneGeometry(0.03, 0.018).translate(0.015, 0, 0);
  const flags = [];
  for (let x = 0; x < W; x++) {
    const g = new THREE.Group();
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.04, 4), pinMat); stick.position.y = 0.02; g.add(stick);
    const f = new THREE.Mesh(flagGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide })); f.position.y = 0.032; g.add(f);
    g.position.set(laneX(x) - BOARD.lane * 0.38, BOARD.binTop - 0.045, 0.032); g.visible = false; board.add(g); flags.push({ g, f });
  }
  function setFlag(x, team) {
    flags[x].g.visible = team >= 0;
    if (team >= 0) flags[x].f.material.color.set(TEAM_COLOR[team]);
  }

  // ---------- Bolinhas ----------
  const ballGeo = new THREE.SphereGeometry(BALL.r, 16, 10);
  const ballMats = TEAM_COLOR.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.25, metalness: 0.2 }));
  function makeBall(team) { const m = new THREE.Mesh(ballGeo, ballMats[team]); m.castShadow = true; m.userData = { team }; return m; }
  const trayBalls = TRAYS.map(t => {
    const g = new THREE.Group();
    for (let k = 0; k < 5; k++) { const m = makeBall(t.team); m.position.set(Math.cos(k * 1.3) * 0.025 * (k % 3), 0.017 + (k > 2 ? 0.02 : 0), Math.sin(k * 1.3) * 0.025 * (k % 3)); g.add(m); }
    g.position.copy(t.pos); scene.add(g); return g;
  });

  // ---------- Prévia: caminho, comportas que viram, caixa ----------
  // caminho: bolinhas de luz espaçadas pelo trajeto (dá para ver bem no óculos)
  const dotMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 });
  const pathLine = new THREE.InstancedMesh(new THREE.SphereGeometry(0.0045, 8, 6), dotMat, 80);
  pathLine.renderOrder = 6; pathLine.visible = false; pathLine.frustumCulled = false; board.add(pathLine);
  function setPath(points, color) {
    let n = 0, carry = 0;
    for (let i = 1; i < points.length && n < 80; i++) {
      const a = points[i - 1], b = points[i], len = a.distanceTo(b);
      let t = carry;
      while (t < len && n < 80) { const k = t / len; mtx.makeTranslation(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, 0.036); pathLine.setMatrixAt(n++, mtx); t += 0.016; }
      carry = t - len;
    }
    pathLine.count = n;
    pathLine.instanceMatrix.needsUpdate = true;
    dotMat.color.set(color);
    pathLine.visible = true;
  }
  const flipMarks = [];
  const flipGeo = new THREE.RingGeometry(0.022, 0.028, 20);
  const flipMat = new THREE.MeshBasicMaterial({ color: 0xffd84a, transparent: true, opacity: 0.9, depthTest: false });
  for (let k = 0; k < R; k++) { const m = new THREE.Mesh(flipGeo, flipMat); m.visible = false; m.renderOrder = 7; board.add(m); flipMarks.push(m); }
  const binMark = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.lane * 0.9, BOARD.binTop - BOARD.binBottom), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.3, depthWrite: false }));
  binMark.position.z = 0.034; binMark.visible = false; board.add(binMark);

  // ---------- Adversário (ao lado do tabuleiro, do outro lado da mesa) ----------
  const avatar = makeAvatar({ headY: 1.45, build: buildParts });
  avatar.group.position.set(TABLE.x + 0.55, 0, TABLE.z - 0.65);
  avatar.group.rotation.y = -0.35;
  scene.add(avatar.group);

  // ---------- Placar: quadro de giz pendurado na viga ----------
  const plC = canvas(1024, 384);
  const plTex = tex(plC);
  const placa = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.41), new THREE.MeshBasicMaterial({ map: plTex }));
  placa.position.set(-0.9, 1.95, TABLE.z - 0.9); placa.rotation.y = 0.3; scene.add(placa);
  function drawBoard({ names, scores, round, footer }) {
    const g = plC.getContext('2d');
    g.fillStyle = '#2a3a2a'; g.fillRect(0, 0, 1024, 384);
    g.strokeStyle = '#8a5a32'; g.lineWidth = 22; g.strokeRect(11, 11, 1002, 362);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = '#f2f0e4'; g.font = 'bold 48px Georgia, serif'; g.fillText('COMPORTA', 512, 62);
    for (const k of [0, 1]) {
      const x = k ? 768 : 256;
      g.fillStyle = k ? '#d0a8ff' : '#a8f0b8'; g.font = 'bold 40px sans-serif'; g.fillText(names[k], x, 135);
      g.fillStyle = '#f2f0e4'; g.font = 'bold 120px Georgia, serif'; g.fillText(String(scores[k]), x, 240);
    }
    g.fillStyle = '#d8e0d0'; g.font = '32px sans-serif'; g.fillText(round || '', 512, 240);
    g.font = '30px sans-serif'; g.fillText(footer || '', 512, 335);
    plTex.needsUpdate = true;
  }

  function animate(dt, time) {
    wheel.rotation.x = -time * 0.5;
    for (const g of levers) {
      const u = g.userData;
      if (u.angle !== u.target) {
        const d = u.target - u.angle, step = dt * 9;
        u.angle = Math.abs(d) < step ? u.target : u.angle + Math.sign(d) * step;
        g.rotation.z = u.angle;
      }
    }
  }

  return {
    scene, sun, board, levers, setLever, funnels, funnelHits, binsG, setValues, setFlag, makeBall, trayBalls,
    setPath, pathLine, flipMarks, binMark, avatar, drawBoard, animate,
  };
}

// Enfeites: chapéu de aba larga e lenço (arriscada), boné de moleiro empoeirado e bigode (cauteloso),
// lenço na cabeça e óculos redondos (vó)
function buildParts() {
  const parts = {};
  parts.risky = new THREE.Group();
  const hatMat = new THREE.MeshLambertMaterial({ color: 0x3a6aa8 });
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.012, 22), hatMat); brim.position.y = 0.09; parts.risky.add(brim);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hatMat); crown.position.y = 0.09; parts.risky.add(crown);
  const hair = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.15, 4, 8), new THREE.MeshLambertMaterial({ color: 0x2a1a10 })); hair.position.set(0.09, -0.06, -0.08); parts.risky.add(hair);
  const hair2 = hair.clone(); hair2.position.x = -0.09; parts.risky.add(hair2);

  parts.careful = new THREE.Group();
  const capMat = new THREE.MeshLambertMaterial({ color: 0xe8e0d0 });
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), capMat); cap.position.y = 0.03; cap.scale.set(1.05, 0.8, 1.05); parts.careful.add(cap);
  const puff = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), capMat); puff.position.set(0.04, 0.12, -0.03); parts.careful.add(puff);
  const stache = new THREE.Mesh(new THREE.CapsuleGeometry(0.016, 0.08, 4, 8).rotateZ(Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x6a4a2a })); stache.position.set(0, -0.035, 0.125); parts.careful.add(stache);

  parts.master = new THREE.Group();
  const scarf = new THREE.Mesh(new THREE.SphereGeometry(0.14, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0xa85a8a })); scarf.position.y = 0.02; scarf.rotation.x = -0.35; parts.master.add(scarf);
  const grey = new THREE.MeshLambertMaterial({ color: 0xd8d8d8 });
  for (const x of [-0.12, 0.12]) { const h = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), grey); h.position.set(x, -0.02, 0.02); parts.master.add(h); }
  const glassMat = new THREE.MeshBasicMaterial({ color: 0x3a2a1a });
  for (const x of [-0.045, 0.045]) { const g = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.004, 6, 18), glassMat); g.position.set(x, 0.02, 0.135); parts.master.add(g); }
  return parts;
}
