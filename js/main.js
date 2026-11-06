// Liga as regras e a IA à tela, ao Quest (controles e mãos) e ao mouse/teclado.
import * as THREE from '../vendor/three/three.module.js';
import { W, R, LEVERS, BALLS, MAJORITY, Match, applyMove, preview, binLeader, PLAYER, CPU } from './rules.js';
import { OPPONENTS, ROBOT, rng, chooseMoveGen } from './ai.js';
import { CHALLENGES, setupChallenge, gradeState, goalText, defend, bestEntry, resultOf } from './challenges.js';
import { buildWorld, TABLE, BOARD, BALL, TRAYS, laneX, rowY } from './scene.js';
import { Panel, Label } from './ui.js';
import { Sfx } from './audio.js';
import { loadSave, storeSave } from './save.js';

const save = loadSave();
const sfx = new Sfx();
sfx.on = save.sound;
const IS_QUEST = /OculusBrowser|Quest/i.test(navigator.userAgent || '');
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const damp = (k, dt) => 1 - Math.exp(-k * dt);
const VR_STAND = { x: TABLE.x, z: TABLE.z + 0.6 };
const GRAB_TRAY = 0.09;
const BOARD_CENTER = new THREE.Vector3(0, 1.16, BOARD.z);

// ---------- Render e cena ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: !IS_QUEST });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, IS_QUEST ? 1 : 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.xr.enabled = true;
renderer.xr.setReferenceSpaceType('local-floor');
renderer.xr.setFoveation?.(1);
document.getElementById('app').appendChild(renderer.domElement);

const world = buildWorld(renderer);
const { scene, board } = world;
const rig = new THREE.Group();
scene.add(rig);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.03, 60);
rig.add(camera);
const UP = new THREE.Vector3(0, 1, 0);

const panel = new Panel(0.9);
const fpsLabel = new Label(0.12);
fpsLabel.mesh.position.set(0.16, -0.14, -0.6);
fpsLabel.mesh.visible = false;
camera.add(fpsLabel.mesh);
const statusLabel = new Label(0.62, 1024, 200);
statusLabel.mesh.position.set(-0.62, 1.55, BOARD.z - 0.1);
statusLabel.mesh.rotation.y = 0.35;
statusLabel.mesh.visible = false;
scene.add(statusLabel.mesh);
const previewLabel = new Label(0.32, 768, 160);
previewLabel.mesh.visible = false;
scene.add(previewLabel.mesh);

// ---------- Estado ----------
let app = 'menu';
let mode = 'match';
let match = null;
let ch = null;
let oppIndex = 0;
let phase = 'idle';
let time = 0;
let msg = null;
let random = rng((Date.now() % 100000) + 1);
let held = null;            // { entry: ctrl, via, mesh, lane }
let thinker = null;
let thinkT = 0;
let chResult = null;
const opponent = () => OPPONENTS[oppIndex];
const cur = () => (mode === 'match' ? match?.round : ch?.st);
let binBalls = [];          // bolinhas nas caixas
const moving = [];          // bolinhas descendo
const timers = [];
const later = (sec, fn) => timers.push({ at: time + sec, fn });
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion();

function binSlot(x, k) {
  const layer = Math.floor(k / 2), sidePos = k % 2 ? 1 : -1;
  return new THREE.Vector3(laneX(x) + sidePos * BALL.r * 1.05, BOARD.binBottom + BALL.r + Math.min(layer, 5) * BALL.r * 1.85, 0);
}
function clearBoard() {
  for (const m of binBalls) m.parent?.remove(m);
  binBalls = [];
  for (const a of moving) a.mesh.parent?.remove(a.mesh);
  moving.length = 0;
  timers.length = 0;
}
// mostra comportas, caixas e bandeirinhas iguais ao estado
function syncBoard(st, instant = false) {
  st.levers.forEach((d, k) => world.setLever(k, d, st.fixed[k], instant));
  for (const m of binBalls) m.parent?.remove(m);
  binBalls = [];
  st.bins.forEach((bin, x) => {
    bin.forEach((team, k) => { const m = world.makeBall(team); m.position.copy(binSlot(x, k)); m.userData.bin = x; board.add(m); binBalls.push(m); });
    world.setFlag(x, mode === 'match' || ch?.c?.kind === 'duel' ? binLeader(bin) : -1);
  });
}
function startState(st) {
  world.setValues(st.values);
  clearBoard();
  syncBoard(st, true);
}

// ---------- Partidas e desafios ----------
function newMatch(i) {
  mode = 'match';
  oppIndex = clamp(i, 0, OPPONENTS.length - 1);
  const o = opponent();
  world.avatar.setStyle(o.style, o.color);
  match = new Match({ starter: random() < 0.5 ? PLAYER : CPU });
  ch = null;
  startRound();
  msg = { text: match.round.starter === PLAYER ? 'Sorteio: você começa.' : `Sorteio: ${o.name} começa.`, t: 3.5 };
}
function startRound() {
  app = 'play';
  panel.hide();
  dropHeld();
  startState(cur());
  placeForPlay();
  beginTurn();
}
function newChallenge(i, skipIntro = false) {
  mode = 'challenge';
  oppIndex = 2;
  const k = clamp(i, 0, CHALLENGES.length - 1);
  const c = CHALLENGES[k];
  ch = { i: k, c, st: setupChallenge(c) };
  match = null;
  world.avatar.setStyle('master', OPPONENTS[2].color);
  app = 'play';
  dropHeld();
  startState(ch.st);
  msg = null; chResult = null; thinker = null;
  placeForPlay();
  if (skipIntro || dev.autoplay) { panel.hide(); beginTurn(); } else { phase = 'intro'; showScreen('chIntro'); }
}
function beginTurn() {
  const st = cur();
  thinker = null;
  if (st.over) { endOfRound(); return; }
  if (st.turn === PLAYER) { phase = 'turn'; thinkT = 0; }
  else {
    phase = 'think';
    thinkT = 0;
    world.avatar.state.thinking = true;
    if (mode === 'challenge') thinker = { done: true, result: defend(st) };
    else thinker = { gen: chooseMoveGen(st, CPU, opponent(), random), done: false, result: null };
  }
  updateHint();
}
function pumpThinker(budgetMs = 6) {
  if (!thinker || thinker.done) return;
  const t0 = performance.now();
  do {
    const x = thinker.gen.next();
    if (x.done) { thinker.done = true; thinker.result = x.value; return; }
  } while (performance.now() - t0 < budgetMs);
}

// Caminho da bolinha (no referencial do tabuleiro) a partir dos passos das regras
function pathPoints(entry, steps, binIndex) {
  const pts = [new THREE.Vector3(laneX(entry), BOARD.funnelY + 0.01, 0)];
  const events = [];
  for (const s of steps) {
    if (s.lever < 0) continue;
    pts.push(new THREE.Vector3(laneX(s.from), rowY(s.r) + 0.022, 0));
    events.push({ at: pts.length - 1, lever: s.lever, flips: s.flips, dir: s.dir });
    pts.push(new THREE.Vector3(laneX(s.to), rowY(s.r) - 0.032, 0));
  }
  const last = steps[steps.length - 1].to;
  pts.push(new THREE.Vector3(laneX(last), BOARD.binTop, 0));
  pts.push(binSlot(last, binIndex));
  return { pts, events };
}

// Solta a bolinha (de quem estiver na vez) e anima a descida com as comportas virando no caminho.
function doMove(entry, from = {}) {
  const st = cur();
  if (!st || st.over || phase === 'anim' || !(entry >= 0 && entry < W) || st.balls[st.turn] <= 0) return false;
  const who = st.turn;
  let info;
  if (mode === 'match') info = match.play(entry);
  else { const r = applyMove(ch.st, entry); ch.st = r.st; info = r.info; }
  phase = 'anim';
  hidePreview();
  if (who === CPU) world.avatar.state.thinking = false;
  const mesh = world.makeBall(who);
  board.add(mesh);
  const nInBin = cur().bins[info.bin].length - 1;
  const { pts, events } = pathPoints(entry, info.path.steps, nInBin);
  let start;
  if (from.pos) start = board.worldToLocal(from.pos.clone());
  else start = board.worldToLocal(TRAYS[who === PLAYER ? 0 : 2].pos.clone().add(new THREE.Vector3(0, 0.04, 0)));
  pts.unshift(start.setZ(start.z));
  const lens = [0];
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const a = { mesh, pts, lens, s: 0, events: events.map(e => ({ ...e, at: e.at + 1, done: false })), info, carry: from.pos ? 0 : 0.5, t: 0 };
  moving.push(a);
  sfx.drop();
  if (renderer.xr.isPresenting && who === PLAYER) pulse(lastHandSide, 0.2, 15);
  return true;
}
function updateMoving(dt) {
  for (let i = moving.length - 1; i >= 0; i--) {
    const a = moving[i];
    a.t += dt;
    // primeiro trecho (da bandeja até o funil): voo rápido em arco
    const flyLen = a.lens[1];
    let v;
    if (a.s < flyLen) v = a.carry ? flyLen / a.carry : 1.2;
    else { const drop = Math.max(0, BOARD.funnelY - a.mesh.position.y); v = 0.35 + 1.4 * Math.sqrt(drop); }
    a.s = Math.min(a.lens[a.lens.length - 1], a.s + v * dt);
    let j = 1;
    while (j < a.lens.length - 1 && a.lens[j] < a.s) j++;
    const k = (a.s - a.lens[j - 1]) / Math.max(1e-6, a.lens[j] - a.lens[j - 1]);
    a.mesh.position.lerpVectors(a.pts[j - 1], a.pts[j], k);
    if (j === 1) a.mesh.position.y += Math.sin(Math.PI * k) * 0.06;
    for (const e of a.events) {
      if (e.done || a.s < a.lens[e.at]) continue;
      e.done = true;
      sfx.tok();
      if (e.flips) { const st = cur(); world.setLever(e.lever, st.levers[e.lever], st.fixed[e.lever]); sfx.flip(0.03); }
    }
    if (a.s >= a.lens[a.lens.length - 1]) {
      moving.splice(i, 1);
      board.remove(a.mesh);
      landed(a.info);
    }
  }
}
function landed(info) {
  const st = cur();
  syncBoard(st);
  sfx.land(info.value);
  if (renderer.xr.isPresenting) pulseAll(0.25, 25);
  const who = info.by === PLAYER ? 'Você' : opponent().name;
  msg = { text: `${who}: caixa ${info.value > 0 ? '+' : ''}${info.value}.`, t: 2.5 };
  if (info.value >= 6) world.avatar.react(info.by === CPU ? 1 : -1);
  else if (info.value < 0) world.avatar.react(info.by === CPU ? -1 : 1);
  let t = 0.35;
  if (info.bonus) {
    t = 1.6;
    msg = { text: `Bônus de maioria (+${MAJORITY} por caixa): você +${info.bonus[0]}, ${mode === 'match' ? opponent().name : 'a Vó'} +${info.bonus[1]}.`, t: 4 };
    sfx.good();
  }
  later(t, () => (st.over ? endOfRound() : beginTurn()));
}

function endOfRound() {
  if (mode === 'challenge') { finishChallenge(); return; }
  if (phase === 'roundEnd' || phase === 'over') return;
  match.closeRound();
  phase = match.over ? 'over' : 'roundEnd';
  const r = match.results[match.results.length - 1].score;
  if (match.over) {
    save.games[oppIndex]++;
    if (match.winner === PLAYER) { save.wins[oppIndex]++; sfx.fanfare(); world.avatar.react(-1); } else if (match.winner === CPU) { sfx.bad(); world.avatar.react(1); }
    storeSave(save);
    showScreen('over');
  } else { if (r[0] > r[1]) sfx.good(); else if (r[1] > r[0]) sfx.bad(); showScreen('roundEnd'); }
  timerAuto = 2.5;
  updateHint();
}
let timerAuto = 0;
function nextRound() {
  match.nextRound();
  startRound();
  msg = { text: match.round.starter === PLAYER ? 'Rodada 2: você começa.' : `Rodada 2: ${opponent().name} começa.`, t: 3 };
}
function finishChallenge() {
  if (phase === 'over') return;
  phase = 'over';
  const stars = gradeState(ch.c, ch.st);
  chResult = { stars, result: resultOf(ch.c, ch.st) };
  save.ch[ch.i] = Math.max(save.ch[ch.i] || 0, stars);
  storeSave(save);
  for (let k = 0; k < stars; k++) later(0.25 * k, () => sfx.star(k));
  if (stars === 3) later(0.8, () => sfx.fanfare());
  timerAuto = 2.5;
  showScreen('chResult');
}
function goMenu() {
  app = 'menu';
  phase = 'idle';
  match = null; ch = null;
  dropHeld();
  const demo = new Match({ starter: PLAYER });
  [2, 3, 0, 5, 1].forEach(e => demo.play(e));
  startState(demo.round);
  world.avatar.setStyle('master', OPPONENTS[2].color);
  world.avatar.state.thinking = false;
  if (renderer.xr.isPresenting) placeRig(VR_STAND.x, VR_STAND.z);
  showScreen('main');
  updateHint();
}
function togglePause() {
  if (app === 'play' && !panel.visible) { app = 'paused'; dropHeld(); showScreen('pause'); }
  else if (app === 'paused') { app = 'play'; panel.hide(); }
  updateHint();
}

// ---------- Menus ----------
const challengeUnlocked = (i) => i === 0 || (save.ch[i - 1] || 0) >= 1;
function showScreen(name) {
  const vr = renderer.xr.isPresenting;
  if (vr) placePanelVR();
  panel.show((p) => {
    if (name === 'main') {
      p.title('Comporta', 72, 64);
      p.text('Cada bolinha vira as comportas que toca e muda o caminho das próximas', 512, 132, { size: 25, color: '#d8c4a4' });
      p.button('Partida contra o computador', () => showScreen('opponents'), 212, 172, 600, 92, { size: 36 });
      p.button('Desafios', () => showScreen('challenges'), 212, 280, 600, 80);
      p.button('Como jogar', () => showScreen('help'), 212, 376, 600, 80);
      p.button(`Som: ${save.sound ? 'sim' : 'não'}`, () => { save.sound = !save.sound; sfx.setOn(save.sound); storeSave(save); showScreen('main'); }, 212, 474, 190, 66, { size: 26 });
      p.button(`Prévia: ${save.preview ? 'sim' : 'não'}`, () => { save.preview = !save.preview; storeSave(save); showScreen('main'); }, 417, 474, 190, 66, { size: 26 });
      p.button(`FPS: ${save.fps ? 'sim' : 'não'}`, () => { save.fps = !save.fps; storeSave(save); showScreen('main'); }, 622, 474, 190, 66, { size: 26 });
      const stars = Object.values(save.ch).reduce((a, b) => a + b, 0);
      p.text(`Vitórias: ${save.wins.reduce((a, b) => a + b, 0)}   ·   Estrelas nos desafios: ${stars} de ${CHALLENGES.length * 3}`, 512, 594, { size: 26, color: '#ffd25a' });
      p.text(vr ? 'Aponte com o controle e aperte o gatilho' : 'No Quest: abra esta página no navegador do óculos e aperte "Entrar em VR"', 512, 656, { size: 22, color: '#d8c4a4' });
    } else if (name === 'opponents') {
      p.title('Escolha o adversário', 62);
      OPPONENTS.forEach((o, i) => p.button(`${o.name}  ·  ${o.title}`, () => newMatch(i), 112, 116 + i * 156, 800, 136, { size: 36, sub: `${o.desc}   (vitórias: ${save.wins[i]} de ${save.games[i]})` }));
      p.text(`2 rodadas de ${BALLS} bolinhas para cada um. Cada um começa uma.`, 512, 600, { size: 24, color: '#d8c4a4' });
      p.button('Voltar', () => showScreen('main'), 362, 632, 300, 66, { size: 28 });
    } else if (name === 'challenges') {
      p.title('Desafios', 56);
      CHALLENGES.forEach((c, i) => p.tile(52 + (i % 5) * 186, 110 + Math.floor(i / 5) * 200, 172, 176, { num: i + 1, name: c.name, stars: save.ch[i] || 0, done: save.ch[i] != null, locked: !challengeUnlocked(i), action: () => newChallenge(i) }));
      p.text('1 a 4: só você joga. 5 a 10: duelo curto contra a Vó, que joga perfeito.', 512, 540, { size: 23, color: '#d8c4a4' });
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 600, 300, 70, { size: 30 });
    } else if (name === 'help') {
      p.title('Como jogar', 60);
      const rows = [
        'Na sua vez, solte uma bolinha num dos 6 funis lá em cima.',
        'Ela bate nas comportas e vai para o lado que cada uma aponta;',
        'cada comporta que ela toca VIRA para o outro lado (pino dourado não vira).',
        'Embaixo, a caixa dá os pontos (o ralo tira). A linha pontilhada mostra o',
        `caminho antes de soltar. No fim, maioria numa caixa vale +${MAJORITY}.`,
        'Pense na próxima: a sua bolinha também muda o caminho da do outro.',
        vr ? 'VR: aperto perto do pote pega a bolinha; solte em cima do funil.' : 'PC: clique na canaleta (ou teclas 1 a 6) para soltar a bolinha.',
        vr ? 'De longe: aponte para a canaleta e aperte o gatilho. B ou Y: pausa.' : 'A/D giram a câmera, rodinha: zoom. Esc: pausa.',
      ];
      rows.forEach((t, i) => p.text(t, 48, 124 + i * 54, { size: 25, align: 'left' }));
      p.button('Voltar', () => showScreen(app === 'paused' ? 'pause' : 'main'), 362, 586, 300, 80);
    } else if (name === 'pause') {
      p.title('Pausa', 66);
      p.text(mode === 'match' ? `Contra ${opponent().name} · Rodada ${match.index + 1} de 2` : `Desafio ${ch.i + 1}: ${ch.c.name}`, 512, 130, { size: 28, color: '#d8c4a4' });
      p.button('Continuar', () => togglePause(), 262, 176, 500, 84);
      p.button(mode === 'match' ? 'Recomeçar a partida' : 'Recomeçar o desafio', () => (mode === 'match' ? newMatch(oppIndex) : newChallenge(ch.i, true)), 262, 276, 500, 84);
      p.button('Como jogar', () => showScreen('help'), 262, 376, 245, 84, { size: 30 });
      p.button('Recentralizar', () => { togglePause(); placeForPlay(true); }, 517, 376, 245, 84, { size: 30, locked: !vr });
      p.button('Menu principal', () => goMenu(), 262, 476, 500, 84);
    } else if (name === 'roundEnd') {
      const r = match.results[match.results.length - 1].score;
      p.title('Fim da rodada 1', 66);
      p.text(`Você ${r[0]} x ${r[1]} ${opponent().name}`, 512, 150, { size: 40, bold: true, color: r[0] > r[1] ? '#9aff9a' : r[1] > r[0] ? '#ff9a8a' : '#fbf4e6' });
      p.text(`Na rodada 2 começa: ${match.round.starter === PLAYER ? 'você' : opponent().name}`, 512, 220, { size: 26, color: '#d8c4a4' });
      p.button('Próxima rodada', () => nextRound(), 262, 300, 500, 96, { size: 38 });
      p.button('Menu principal', () => goMenu(), 262, 430, 500, 80);
    } else if (name === 'over') {
      const w = match.winner;
      p.title(w === PLAYER ? 'Você venceu!' : w === CPU ? `${opponent().name} venceu` : 'Empate!', 72);
      p.text(`Você ${match.total(0)} x ${match.total(1)} ${opponent().name}`, 512, 150, { size: 40, bold: true });
      p.text(`Rodadas: ${match.results.map(r => `${r.score[0]}-${r.score[1]}`).join('   ')}`, 512, 210, { size: 28, color: '#d8c4a4' });
      p.text(`Contra ${opponent().name}: ${save.wins[oppIndex]} vitória(s) em ${save.games[oppIndex]} partida(s)`, 512, 258, { size: 24, color: '#d8c4a4' });
      p.button('Jogar de novo', () => newMatch(oppIndex), 262, 310, 500, 92, { size: 36 });
      p.button('Outro adversário', () => showScreen('opponents'), 262, 420, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 520, 500, 80);
    } else if (name === 'chIntro') {
      const c = ch.c;
      p.title(`Desafio ${ch.i + 1}: ${c.name}`, 66, 46);
      p.text(c.desc, 512, 150, { size: 25 });
      p.text(c.kind === 'solo' ? `Só você joga: ${c.balls} bolinha(s).` : `Duelo: ${c.balls} bolinhas para cada um, você começa. A Vó joga perfeito.`, 512, 200, { size: 24, color: '#d8c4a4' });
      p.text(goalText(c), 512, 252, { size: 23, color: '#ffd25a' });
      p.button('Começar', () => { panel.hide(); beginTurn(); }, 262, 320, 500, 96, { size: 38 });
      p.button('Desafios', () => showScreen('challenges'), 262, 440, 500, 80);
    } else if (name === 'chResult') {
      const c = ch.c;
      p.title(chResult.stars ? 'Desafio cumprido!' : 'Não foi dessa vez', 66);
      p.stars(chResult.stars, 512, 160, 80);
      p.text(c.kind === 'solo' ? `Pontos: ${chResult.result}` : `Você ${ch.st.score[0]} x ${ch.st.score[1]} Vó (diferença ${chResult.result > 0 ? '+' : ''}${chResult.result})`, 512, 236, { size: 28 });
      p.text(goalText(c), 512, 280, { size: 22, color: '#d8c4a4' });
      p.button('Tentar de novo', () => newChallenge(ch.i, true), 262, 330, 245, 84, { size: 30 });
      p.button('Próximo', () => newChallenge(ch.i + 1), 517, 330, 245, 84, { size: 30, locked: ch.i >= CHALLENGES.length - 1 || !challengeUnlocked(ch.i + 1) });
      p.button('Desafios', () => showScreen('challenges'), 262, 434, 500, 80);
      p.button('Menu principal', () => goMenu(), 262, 534, 500, 80);
    }
  });
  hidePreview();
  updateHint();
}

// ---------- Painel e VR ----------
function fitPC() {
  if (renderer.xr.isPresenting) return;
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  if (panel.mesh.parent !== camera) camera.add(panel.mesh);
  const half = THREE.MathUtils.degToRad(camera.fov / 2);
  const visH = 2 * 0.8 * Math.tan(half), visW = visH * camera.aspect;
  panel.mesh.position.set(0, 0, -0.8);
  panel.mesh.quaternion.identity();
  panel.mesh.scale.setScalar(Math.min(1, visW * 0.94 / 0.9, visH * 0.92 / 0.633));
}
function placePanelVR() {
  const head = new THREE.Vector3(), hq = new THREE.Quaternion();
  camera.getWorldPosition(head);
  camera.getWorldQuaternion(hq);
  const yaw = new THREE.Euler().setFromQuaternion(hq, 'YXZ').y;
  panel.mesh.position.copy(head).addScaledVector(new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), 0.95);
  panel.mesh.position.y = head.y - 0.05;
  panel.mesh.rotation.set(0, yaw, 0);
}
function placeRig(x, z) {
  const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  rig.rotation.set(0, -e.y, 0);
  const head = camera.position.clone().setY(0).applyAxisAngle(UP, rig.rotation.y);
  rig.position.set(x - head.x, 0, z - head.z);
  rig.updateMatrixWorld(true);
}
let rigPlaced = false;
function placeForPlay(force = false) {
  if (renderer.xr.isPresenting && (force || !rigPlaced)) { placeRig(VR_STAND.x, VR_STAND.z); rigPlaced = true; }
  pcCamSnap = true;
}
const canAct = () => app === 'play' && phase === 'turn' && !panel.visible && !dev.autoplay && cur()?.turn === PLAYER;
const canActRelease = () => app === 'play' && phase === 'turn' && cur()?.turn === PLAYER;
const raycaster = new THREE.Raycaster();
function laneFromRay(ray) { const h = ray.intersectObjects(world.funnelHits)[0]; return h ? h.object.userData.entry : -1; }

// ---------- Controles do VR ----------
const ctrls = [];
const markMat = new THREE.MeshStandardMaterial({ color: 0x9ad8f0, roughness: 0.3, metalness: 0.5 });
let lastHandSide = 'right';
for (let i = 0; i < 2; i++) {
  const ctrl = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  const hand = renderer.xr.getHand ? renderer.xr.getHand(i) : null;
  rig.add(ctrl, grip);
  if (hand) rig.add(hand);
  const laser = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]), new THREE.LineBasicMaterial({ color: 0x9ad8f0 }));
  laser.visible = false;
  ctrl.add(laser);
  const mark = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), markMat);
  grip.add(mark);
  const pinchDot = new THREE.Mesh(new THREE.SphereGeometry(0.008, 10, 6), new THREE.MeshBasicMaterial({ color: 0x9ad8f0 }));
  pinchDot.visible = false;
  scene.add(pinchDot);
  const entry = { ctrl, grip, hand, laser, mark, pinchDot, source: null, side: null, prevButtons: [], hoverIndex: -1 };
  ctrls.push(entry);
  ctrl.addEventListener('connected', (e) => { entry.source = e.data; entry.side = e.data.handedness; });
  ctrl.addEventListener('disconnected', () => { if (held?.entry === entry) dropHeld(); entry.source = null; entry.side = null; });
  ctrl.addEventListener('selectstart', () => onSelect(entry));
  ctrl.addEventListener('selectend', () => { if (held?.entry === entry && held.via === 'select') releaseHeld(); });
  ctrl.addEventListener('squeezestart', () => { sfx.unlock(); if (!entry.source?.hand) tryGrab(entry, 'squeeze'); });
  ctrl.addEventListener('squeezeend', () => { if (held?.entry === entry && held.via === 'squeeze') releaseHeld(); });
}
const entryFor = (side) => ctrls.find(e => e.side === side && e.source);
function pulse(side, v, ms) { try { entryFor(side)?.source?.gamepad?.hapticActuators?.[0]?.pulse?.(clamp(v, 0, 1), ms); } catch { /* sem vibração */ } }
const pulseAll = (v, ms) => { pulse('left', v, ms); pulse('right', v, ms); };
function grabPoint(entry, out = new THREE.Vector3()) {
  if (entry.source?.hand && entry.hand?.joints) {
    const a = entry.hand.joints['index-finger-tip'], b = entry.hand.joints['thumb-tip'];
    if (a && b && a.visible !== false) { a.getWorldPosition(out); b.getWorldPosition(_v2); return out.add(_v2).multiplyScalar(0.5); }
  }
  entry.grip.getWorldPosition(out);
  if (!entry.source?.hand) out.add(new THREE.Vector3(0, -0.02, -0.04).applyQuaternion(entry.grip.getWorldQuaternion(_q)));
  return out;
}
function rayFrom(entry) {
  entry.ctrl.getWorldPosition(_v);
  entry.ctrl.getWorldQuaternion(_q);
  raycaster.set(_v, new THREE.Vector3(0, 0, -1).applyQuaternion(_q));
  return raycaster;
}
function tryGrab(entry, via) {
  if (held || !canAct()) return false;
  const p = grabPoint(entry);
  for (const t of TRAYS) {
    if (t.team !== PLAYER || t.pos.distanceTo(p) > GRAB_TRAY) continue;
    const mesh = world.makeBall(PLAYER);
    scene.add(mesh);
    held = { entry, via, mesh, lane: -1 };
    lastHandSide = entry.side || lastHandSide;
    sfx.pick(); pulse(entry.side, 0.3, 25);
    return true;
  }
  return false;
}
// mão em cima dos funis: canaleta mais perto
function laneNearHand(p) {
  const l = board.worldToLocal(p.clone());
  if (Math.abs(l.z) > 0.15 || l.y < BOARD.funnelY - 0.1 || l.y > BOARD.funnelY + 0.25) return -1;
  const x = Math.round(l.x / BOARD.lane + (W - 1) / 2);
  return x >= 0 && x < W && Math.abs(laneX(x) - l.x) < BOARD.lane * 0.75 ? x : -1;
}
function updateHeld() {
  if (!held) return;
  const e = held.entry;
  const p = grabPoint(e);
  held.mesh.position.copy(p);
  let lane = laneNearHand(p);
  if (lane < 0) { lane = laneFromRay(rayFrom(e)); e.laser.visible = lane >= 0; e.laser.scale.z = 0.9; } else e.laser.visible = false;
  if (lane !== held.lane) { held.lane = lane; if (lane >= 0) pulse(e.side, 0.12, 12); }
  if (lane >= 0 && phase === 'turn') showPreviewFor(lane); else hidePreview();
}
function releaseHeld() {
  if (!held) return;
  const h = held;
  held = null;
  h.entry.laser.visible = false;
  const pos = h.mesh.position.clone();
  scene.remove(h.mesh);
  if (h.lane >= 0 && canActRelease()) doMove(h.lane, { pos });
  else { msg = { text: 'Solte a bolinha em cima de um funil (ou aponte para a canaleta).', t: 2.5 }; hidePreview(); }
}
function dropHeld() { if (!held) return; held.entry.laser.visible = false; scene.remove(held.mesh); held = null; hidePreview(); }
function onSelect(entry) {
  sfx.unlock();
  if (panel.visible) { if (entry.hoverIndex >= 0) { const a = panel.actionAt(entry.hoverIndex); if (a) { sfx.click(); a(); } } return; }
  if (held) return;
  if (entry.source?.hand && tryGrab(entry, 'select')) return;
  if (canAct()) { const lane = laneFromRay(rayFrom(entry)); if (lane >= 0) { lastHandSide = entry.side || lastHandSide; doMove(lane); } }
}
function pollButtons() {
  for (const e of ctrls) {
    const gp = e.source?.gamepad;
    if (!gp || e.source.hand) continue;
    const b = gp.buttons.map(x => x.pressed);
    if (b[5] && !e.prevButtons[5]) togglePause();
    e.prevButtons = b;
  }
}

// ---------- Mouse e teclado ----------
const mouse = { ndc: new THREE.Vector2(-9, -9), right: false, lx: 0, ly: 0 };
const keys = new Set();
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
renderer.domElement.addEventListener('pointerdown', (e) => {
  sfx.unlock();
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (e.button === 2) { mouse.right = true; mouse.lx = e.clientX; mouse.ly = e.clientY; return; }
  raycaster.setFromCamera(mouse.ndc, camera);
  if (panel.visible) { const a = panel.actionAt(panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv)); if (a) { sfx.click(); a(); } return; }
  if (!canAct() || renderer.xr.isPresenting) return;
  const lane = laneFromRay(raycaster);
  if (lane >= 0) doMove(lane);
});
renderer.domElement.addEventListener('pointermove', (e) => {
  mouse.ndc.set(e.clientX / window.innerWidth * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
  if (mouse.right) { pcOrbit.yaw -= (e.clientX - mouse.lx) * 0.005; pcOrbit.pitch = clamp(pcOrbit.pitch + (e.clientY - mouse.ly) * 0.004, -0.2, 0.9); mouse.lx = e.clientX; mouse.ly = e.clientY; }
});
window.addEventListener('pointerup', () => { mouse.right = false; });
renderer.domElement.addEventListener('wheel', (e) => { e.preventDefault?.(); pcOrbit.dist = clamp(pcOrbit.dist + e.deltaY * 0.0008, 0.45, 1.8); }, { passive: false });
window.addEventListener('blur', () => { keys.clear(); mouse.right = false; });
window.addEventListener('keydown', (e) => {
  sfx.unlock();
  const k = (e.key || '').toLowerCase();
  if (k === 'escape' || k === 'p') { togglePause(); return; }
  if (k === 'f') { save.fps = !save.fps; storeSave(save); return; }
  if (/^[1-6]$/.test(k) && canAct()) { doMove(+k - 1); return; }
  keys.add(k);
});
window.addEventListener('keyup', (e) => { keys.delete((e.key || '').toLowerCase()); });
window.addEventListener('resize', () => { renderer.setSize(window.innerWidth, window.innerHeight); fitPC(); });

// ---------- Prévia: caminho, comportas que viram e a caixa ----------
let previewKey = '', previewData = null;
function hidePreview() {
  world.pathLine.visible = false;
  for (const m of world.flipMarks) m.visible = false;
  world.binMark.visible = false;
  for (const f of world.funnels) f.material.emissive.set(0x000000);
  previewLabel.mesh.visible = false;
  previewData = null; previewKey = '';
  previewEl.style.display = 'none';
}
function analyze(st, lane) {
  const info = preview(st, lane);
  const after = applyMove(st, lane).st;
  let reply = null;
  if (!after.over && after.turn !== st.turn) { reply = -Infinity; for (let e = 0; e < W; e++) reply = Math.max(reply, preview(after, e).value); }
  return { lane, info, reply, flips: info.path.steps.filter(s => s.lever >= 0 && s.flips).length };
}
function showPreviewFor(lane) {
  const st = cur();
  if (!st || lane < 0 || st.over) { hidePreview(); return; }
  const key = `${lane}:${st.moves}`;
  if (key !== previewKey) { previewKey = key; previewData = analyze(st, lane); }
  const d = previewData;
  world.funnels.forEach((f, x) => f.material.emissive.set(x === lane ? 0x5a4a10 : 0x000000));
  if (save.preview) {
    const { pts, events } = pathPoints(lane, d.info.path.steps, st.bins[d.info.bin].length);
    world.setPath(pts, d.info.value >= 6 ? 0x7dff9a : d.info.value < 0 ? 0xff6a5a : 0xffffff);
    let k = 0;
    for (const e of events) {
      if (!e.flips || k >= world.flipMarks.length) continue;
      const l = LEVERS[e.lever];
      world.flipMarks[k].position.set(laneX(l.x), rowY(l.r), 0.036);
      world.flipMarks[k++].visible = true;
    }
    for (; k < world.flipMarks.length; k++) world.flipMarks[k].visible = false;
    world.binMark.position.set(laneX(d.info.bin), (BOARD.binTop + BOARD.binBottom) / 2, 0.034);
    world.binMark.material.color.set(d.info.value >= 6 ? 0x7dff9a : d.info.value < 0 ? 0xff6a5a : 0xffffff);
    world.binMark.visible = true;
  }
  updatePreviewText(d);
}
function previewText(d) {
  const v = d.info.value;
  const a = `Funil ${d.lane + 1} → caixa ${v > 0 ? '+' : ''}${v} · vira ${d.flips} comporta${d.flips === 1 ? '' : 's'}`;
  let b, kind = v >= 6 ? 'good' : v < 0 ? 'bad' : 'ok';
  if (d.reply != null) {
    b = `Depois, a melhor resposta do outro dá ${d.reply > 0 ? '+' : ''}${d.reply}`;
    if (d.reply >= 6) kind = 'bad';
  } else b = cur().solo ? `Bolinhas na mão: ${cur().balls[PLAYER]}` : 'Última bolinha';
  return [a, b, kind];
}
const previewEl = document.getElementById('preview');
function updatePreviewText(d) {
  const [a, b, kind] = previewText(d);
  const color = kind === 'bad' ? '#ff8a7a' : kind === 'good' ? '#9aff9a' : '#fbf4e6';
  if (renderer.xr.isPresenting) {
    previewLabel.set([{ text: a, size: 0.4, color: '#9ad8f0' }, { text: b, size: 0.36, color }]);
    previewLabel.mesh.visible = true;
    board.localToWorld(previewLabel.mesh.position.set(0, BOARD.funnelY + 0.2, 0.05));
    camera.getWorldPosition(_v);
    previewLabel.mesh.lookAt(_v.x, previewLabel.mesh.position.y, _v.z);
  } else {
    previewEl.style.display = 'block';
    const html = `<div class="txt">${a}</div><div class="txt" style="color:${color}">${b}</div>`;
    if (previewEl.dataset.last !== html) { previewEl.innerHTML = html; previewEl.dataset.last = html; }
  }
}
function updatePCHover() {
  if (renderer.xr.isPresenting || held) return;
  if (!canAct()) { if (previewKey) hidePreview(); return; }
  raycaster.setFromCamera(mouse.ndc, camera);
  const lane = laneFromRay(raycaster);
  if (lane >= 0) showPreviewFor(lane); else if (previewKey) hidePreview();
}

// ---------- Câmera do PC ----------
const pcOrbit = { yaw: 0, pitch: 0.12, dist: 0.88 };
const pcCam = { pos: new THREE.Vector3(), look: new THREE.Vector3() };
let pcCamSnap = true;
function updatePCCamera(dt) {
  if (renderer.xr.isPresenting) return;
  if (keys.has('a') || keys.has('arrowleft')) pcOrbit.yaw += 1.2 * dt;
  if (keys.has('d') || keys.has('arrowright')) pcOrbit.yaw -= 1.2 * dt;
  if (keys.has('w') || keys.has('arrowup')) pcOrbit.pitch = clamp(pcOrbit.pitch + 0.8 * dt, -0.2, 0.9);
  if (keys.has('s') || keys.has('arrowdown')) pcOrbit.pitch = clamp(pcOrbit.pitch - 0.8 * dt, -0.2, 0.9);
  let yaw = pcOrbit.yaw, pitch = pcOrbit.pitch, dist = pcOrbit.dist;
  let look = BOARD_CENTER.clone();
  if (app === 'menu') { yaw = Math.sin(time * 0.12) * 0.4; pitch = 0.2; dist = 1.6; look = new THREE.Vector3(0, 1.2, BOARD.z - 0.2); }
  const pos = new THREE.Vector3(look.x + Math.sin(yaw) * Math.cos(pitch) * dist, look.y + Math.sin(pitch) * dist, look.z + Math.cos(yaw) * Math.cos(pitch) * dist);
  if (pcCamSnap) { pcCam.pos.copy(pos); pcCam.look.copy(look); pcCamSnap = false; }
  pcCam.pos.lerp(pos, damp(6, dt));
  pcCam.look.lerp(look, damp(6, dt));
  camera.position.copy(pcCam.pos);
  camera.lookAt(pcCam.look);
}

// ---------- VR: sessão ----------
let recenterIn = 0;
renderer.xr.addEventListener('sessionstart', () => {
  recenterIn = 5; rigPlaced = false;
  if (panel.mesh.parent) panel.mesh.parent.remove(panel.mesh);
  scene.add(panel.mesh);
  panel.mesh.scale.setScalar(1);
  hidePreview(); updateHint();
});
renderer.xr.addEventListener('sessionend', () => {
  dropHeld();
  rig.position.set(0, 0, 0); rig.rotation.set(0, 0, 0);
  camera.position.set(0, 1.6, 0.5); camera.quaternion.identity();
  pcCamSnap = true;
  fitPC(); updateHint();
});

// ---------- Raios ----------
const rayOrigin = new THREE.Vector3(), rayDir = new THREE.Vector3();
function updateRays() {
  const vr = renderer.xr.isPresenting;
  let hover = -1, rayLane = -1;
  for (const e of ctrls) {
    e.hoverIndex = -1;
    if (held?.entry === e) continue;
    e.laser.visible = false;
    if (!vr || !e.source) continue;
    e.ctrl.getWorldPosition(rayOrigin);
    e.ctrl.getWorldQuaternion(_q);
    rayDir.set(0, 0, -1).applyQuaternion(_q);
    raycaster.set(rayOrigin, rayDir);
    if (panel.visible) {
      const hit = raycaster.intersectObject(panel.mesh)[0];
      e.laser.visible = true;
      e.laser.scale.z = hit ? hit.distance : 2;
      e.hoverIndex = panel.pick(hit?.uv);
      if (e.hoverIndex >= 0) hover = e.hoverIndex;
    } else if (canAct() && !e.source.hand && !held) {
      const h = raycaster.intersectObjects(world.funnelHits)[0];
      if (h) { e.laser.visible = true; e.laser.scale.z = h.distance; rayLane = h.object.userData.entry; }
    }
  }
  if (vr && !held && canAct()) { if (rayLane >= 0) showPreviewFor(rayLane); else if (previewKey) hidePreview(); }
  if (!vr) {
    if (panel.visible) {
      raycaster.setFromCamera(mouse.ndc, camera);
      hover = panel.pick(raycaster.intersectObject(panel.mesh)[0]?.uv);
      renderer.domElement.style.cursor = hover >= 0 && panel.actionAt(hover) ? 'pointer' : 'default';
    } else renderer.domElement.style.cursor = previewKey ? 'pointer' : 'default';
  }
  if (panel.visible) panel.setHover(hover);
}

// ---------- HUD ----------
const hintEl = document.getElementById('hint');
const hudEl = document.getElementById('hud');
const fpsEl = document.getElementById('fps');
function updateHint() {
  if (renderer.xr.isPresenting) { hintEl.textContent = ''; return; }
  let t;
  if (app !== 'play' || panel.visible) t = 'Clique nas opções do painel';
  else if (phase === 'turn') t = 'Clique numa canaleta (ou 1 a 6) para soltar a bolinha · A/D: câmera · Esc: pausa';
  else t = 'A/D ou botão direito: câmera · rodinha: zoom · Esc: pausa';
  hintEl.innerHTML = `<span>${t}</span>`;
}
function statusLines() {
  const st = cur();
  if (mode === 'challenge') {
    const c = ch.c;
    const head = c.kind === 'solo' ? `Desafio ${ch.i + 1}: ${c.name} · pontos: ${st.score[0]} · bolinhas: ${st.balls[0]}` : `Desafio ${ch.i + 1}: ${c.name} · você ${st.score[0]} x ${st.score[1]} Vó · bolinhas: ${st.balls[0]} x ${st.balls[1]}`;
    return [head, goalText(c)];
  }
  const o = opponent();
  const head = `Você ${st.score[0]} x ${st.score[1]} ${o.name} · Rodada ${match.index + 1} de 2${match.index ? ` (total ${match.total(0) + st.score[0]} x ${match.total(1) + st.score[1]})` : ''} · bolinhas ${st.balls[0]} x ${st.balls[1]}`;
  let line = '';
  if (phase === 'turn') line = renderer.xr.isPresenting ? 'Sua vez: pegue uma bolinha no pote (botão lateral) e solte num funil, ou aponte para a canaleta e gatilho.' : 'Sua vez.';
  else if (phase === 'think') line = `${o.name} está pensando...`;
  return [head, line];
}
function updateHud(dt) {
  if (msg) { msg.t -= dt; if (msg.t <= 0) msg = null; }
  const vr = renderer.xr.isPresenting;
  const playing = app === 'play' && cur() && !panel.visible;
  if (!vr) {
    statusLabel.mesh.visible = false;
    hudEl.style.display = playing ? 'block' : 'none';
    if (playing) {
      const [a, b] = statusLines();
      const html = `<b>${a}</b>${b ? `<br>${b}` : ''}${msg && msg.text ? `<br><em>${msg.text}</em>` : ''}`;
      if (hudEl.dataset.last !== html) { hudEl.innerHTML = html; hudEl.dataset.last = html; }
    }
    return;
  }
  hudEl.style.display = 'none';
  statusLabel.mesh.visible = playing;
  if (!playing) return;
  const [a, b] = statusLines();
  statusLabel.set([{ text: a, size: 0.34, color: '#9ad8f0' }, { text: msg?.text || b, size: 0.3, bold: false, color: msg?.text ? '#ffe3a0' : '#fbf4e6' }]);
}
let boardKey = '';
function updateScoreboard() {
  let data;
  const st = cur();
  if (!st || app === 'menu') data = { names: ['Você', 'Adversário'], scores: [0, 0], round: '', footer: 'Escolha uma partida ou um desafio' };
  else if (mode === 'challenge') data = { names: ['Você', ch.c.kind === 'duel' ? 'Vó' : 'Bolinhas'], scores: [st.score[0], ch.c.kind === 'duel' ? st.score[1] : st.balls[0]], round: `Desafio ${ch.i + 1}`, footer: ch.c.name };
  else data = { names: ['Você', opponent().name], scores: [match.total(0) + st.score[0], match.total(1) + st.score[1]], round: `Rodada ${match.index + 1}`, footer: `Bolinhas: ${st.balls[0]} x ${st.balls[1]}` };
  const key = JSON.stringify(data);
  if (key !== boardKey) { boardKey = key; world.drawBoard(data); }
}

// ---------- Botão de VR ----------
const vrBtn = document.getElementById('vr');
async function setupVR() {
  const ok = navigator.xr && await navigator.xr.isSessionSupported('immersive-vr').catch(() => false);
  if (!ok) { vrBtn.textContent = window.isSecureContext ? 'VR não disponível neste navegador' : 'VR precisa de HTTPS'; vrBtn.disabled = true; return; }
  vrBtn.textContent = 'Entrar em VR';
  vrBtn.disabled = false;
  vrBtn.onclick = async () => {
    sfx.unlock();
    if (renderer.xr.isPresenting) { renderer.xr.getSession()?.end(); return; }
    try {
      const session = await navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] });
      await renderer.xr.setSession(session);
      vrBtn.textContent = 'Sair do VR';
      session.addEventListener('end', () => { vrBtn.textContent = 'Entrar em VR'; });
    } catch (err) { vrBtn.textContent = 'Erro ao entrar em VR'; console.error(err); }
  };
}
setupVR();

// ---------- Laço ----------
let lastT = performance.now();
let fpsFrames = 0, fpsTime = 0;
function tick(dt) {
  time += dt;
  const vr = renderer.xr.isPresenting;
  if (recenterIn > 0 && --recenterIn === 0) { placeRig(VR_STAND.x, VR_STAND.z); rigPlaced = true; if (panel.visible) placePanelVR(); }
  pollButtons();
  rig.updateMatrixWorld(true);
  if (app !== 'paused') for (let i = 0; i < timers.length; i++) if (timers[i].at <= time) { const t = timers.splice(i, 1)[0]; i--; t.fn(); }
  if (app === 'play' && cur()) {
    if (phase === 'turn') { updateHeld(); if (dev.autoplay) robotTurn(dt); }
    else if (phase === 'think') { thinkT += dt; pumpThinker(); if (thinkT >= (mode === 'challenge' ? 0.8 : opponent().think) && thinker?.done) doMove(thinker.result); }
    else if ((phase === 'roundEnd' || phase === 'over') && dev.autoplay) {
      timerAuto -= dt;
      if (timerAuto <= 0) { if (phase === 'roundEnd') nextRound(); else if (mode === 'match') newMatch(oppIndex); }
    }
  }
  if (app !== 'paused') updateMoving(dt);
  updatePCHover();
  camera.getWorldPosition(_v);
  const look = phase === 'think' ? BOARD_CENTER : held ? held.mesh.position : moving[0] ? moving[0].mesh.getWorldPosition(_v2) : _v;
  world.avatar.update(dt, time, look);
  world.animate(dt, time);
  updatePCCamera(dt);
  updateHud(dt);
  updateRays();
  updateScoreboard();
  for (const e of ctrls) {
    e.mark.visible = vr && !!e.source && !e.source.hand;
    e.pinchDot.visible = vr && !!e.source?.hand && canAct();
    if (e.pinchDot.visible) grabPoint(e, e.pinchDot.position);
  }
  sfx.updateAmbience(dt);
  fpsFrames++; fpsTime += dt;
  if (fpsTime >= 0.5) {
    const f = Math.round(fpsFrames / fpsTime);
    fpsFrames = 0; fpsTime = 0;
    fpsEl.style.display = save.fps && !vr ? 'block' : 'none';
    fpsEl.textContent = `${f} FPS`;
    fpsLabel.mesh.visible = save.fps && vr;
    fpsLabel.set(`${f} FPS`);
  }
}
let robotT = 0;
function robotTurn(dt) {
  robotT += dt;
  if (!thinker) {
    robotT = 0;
    if (mode === 'challenge') thinker = { done: true, result: bestEntry(ch.c, ch.st) };
    else thinker = { gen: chooseMoveGen(cur(), PLAYER, ROBOT, random), done: false, result: null };
  }
  pumpThinker(12);
  if (!thinker.done || robotT < ROBOT.think) return;
  const m = thinker.result;
  thinker = null;
  if (m >= 0) doMove(m);
}
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  tick(dt);
  renderer.render(scene, camera);
}

// ---------- Depuração (console do navegador) ----------
// dev.autoplay = true | dev.advance(5) | dev.state() | dev.loadLevel(3) | dev.startMatch(2)
// dev.press('Desafios') aperta um botão do painel | dev.play(2) solta no funil 3 | dev.forceWin()
// dev.check() confere tela x regras | dev.laneScreen(2) posição do funil na tela | dev.resetSave()
const dev = {
  _auto: false,
  get autoplay() { return this._auto; },
  set autoplay(v) { this._auto = !!v; dropHeld(); if (phase === 'turn') thinker = null; },
  loadLevel(n) { newChallenge(n - 1, true); return this.state(); },
  startMatch(n = 1) { newMatch(n - 1); return this.state(); },
  press(label) { const b = panel.visible && panel.find(label); if (!b || !b.action) return false; b.action(); return true; },
  play(lane) { return doMove(lane); },
  forceWin() {
    const st = cur();
    if (!st || app !== 'play') return false;
    timers.length = 0; moving.length = 0;
    st.over = true;
    if (mode === 'challenge') st.score[0] = st.score[1] + Math.max(...ch.c.stars) + (ch.c.kind === 'solo' ? 0 : 0);
    else st.score[0] = st.score[1] + 10;
    phase = 'anim';
    endOfRound();
    return this.state();
  },
  advance(sec, step = 1 / 60) {
    const frames = Math.round(sec / step);
    for (let i = 0; i < frames; i++) tick(step);
    lastT = performance.now();
    renderer.render(scene, camera);
    return this.state();
  },
  laneScreen(lane, y = 1.2) {
    const p = board.localToWorld(new THREE.Vector3(laneX(lane), y, 0)).project(camera);
    return { x: (p.x + 1) / 2 * window.innerWidth, y: (1 - p.y) / 2 * window.innerHeight };
  },
  check() {
    const st = cur();
    const errs = [];
    if (!st || moving.length || phase === 'anim') return errs;
    st.levers.forEach((d, k) => { const u = world.levers[k].userData; if (Math.abs(u.target - d * -0.6) > 1e-6) errs.push(`comporta ${k} virada errada`); });
    const n = st.bins.reduce((a, b) => a + b.length, 0);
    if (binBalls.length !== n) errs.push(`bolinhas nas caixas: tela ${binBalls.length}, regras ${n}`);
    st.bins.forEach((bin, x) => { const c = binBalls.filter(m => m.userData.bin === x).length; if (c !== bin.length) errs.push(`caixa ${x + 1}: tela ${c}, regras ${bin.length}`); });
    return errs;
  },
  state() {
    const base = { tela: app, modo: mode, fase: phase, painel: panel.visible };
    const st = cur();
    if (!st) return base;
    return {
      ...base,
      adversario: mode === 'match' ? opponent().name : null,
      desafio: mode === 'challenge' ? `${ch.i + 1}: ${ch.c.name}` : null,
      rodada: mode === 'match' ? match.index + 1 : null,
      vez: st.turn === PLAYER ? 'você' : 'computador',
      pontos: st.score.slice(), bolinhas: st.balls.slice(),
      caixas: st.bins.map(b => b.length).join(' '),
      total: mode === 'match' ? [match.total(0), match.total(1)] : null,
      previa: previewData ? previewText(previewData).slice(0, 2).join(' / ') : null,
      caminho: world.pathLine.visible,
      estrelas: mode === 'challenge' && chResult ? chResult.stars : null,
      vencedor: mode === 'match' && match.over ? (match.winner === PLAYER ? 'você' : match.winner === CPU ? opponent().name : 'empate') : null,
      animando: moving.length + timers.length,
      salvo: { vitorias: save.wins, desafios: save.ch },
    };
  },
  resetSave() { save.wins = [0, 0, 0]; save.games = [0, 0, 0]; save.ch = {}; storeSave(save); },
};
window.dev = dev;
window.comporta = { dev, get match() { return match; }, get challenge() { return ch; }, save, camera, scene, renderer, world };

fitPC();
goMenu();
renderer.setAnimationLoop(frame);
