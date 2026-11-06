// Adversários da Comporta. Sem navegador. A simulação é exata (a mesma das regras), então a IA
// enxerga o caminho de cada bolinha e como as comportas ficam depois.
import { W, MAJORITY, dropFast, applyMove, legalMoves } from './rules.js';

export const OPPONENTS = [
  {
    id: 'arriscada', name: 'Dona Enxurrada', title: 'Arriscada',
    desc: 'Solta onde ganha mais agora, sem pensar na próxima bolinha',
    style: 'risky', depth: 1, noise: 2.2, blunder: 0.1, color: 0x3a8ad8, think: 0.8,
  },
  {
    id: 'cauteloso', name: 'Seu Moleiro', title: 'Cauteloso',
    desc: 'Calcula quatro bolinhas à frente e não deixa caixa boa para você',
    style: 'careful', depth: 4, noise: 0.8, blunder: 0.03, color: 0xa87a4a, think: 1.1,
  },
  {
    id: 'mestra', name: 'Vó Engenhosa', title: 'Pensa à frente',
    desc: 'Calcula as comportas até o fim da rodada',
    style: 'master', depth: 10, noise: 0.15, blunder: 0, color: 0x7a5ab8, think: 1.5,
  },
];
export const ROBOT = { id: 'robo', name: 'Robô', style: 'master', depth: 10, noise: 0, blunder: 0, think: 0.35 };

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());

// bônus de maioria no fim, do ponto de vista de "who". cnt[bin * 2 + dono]
function bonusDiff(cnt, who) {
  let s = 0;
  for (let b = 0; b < W; b++) { const a = cnt[b * 2], c = cnt[b * 2 + 1]; if (a > c) s += MAJORITY; else if (c > a) s -= MAJORITY; }
  return who === 0 ? s : -s;
}
// negamax no ponto de vista de "who" (quem solta agora). balls = bolinhas de cada um.
function search(levers, fixed, values, balls, cnt, who, depth, alpha, beta, stats) {
  stats.n++;
  if (balls[0] <= 0 && balls[1] <= 0) return bonusDiff(cnt, who);
  if (depth === 0) return stats.endEval ? bonusDiff(cnt, who) * 0.5 : 0;
  if (balls[who] <= 0) return -search(levers, fixed, values, balls, cnt, 1 - who, depth, -beta, -alpha, stats);
  let best = -Infinity;
  for (const e of stats.order) {
    const lv = Int8Array.from(levers);
    const bin = dropFast(lv, fixed, e);
    balls[who]--; cnt[bin * 2 + who]++;
    const next = balls[1 - who] > 0 ? 1 - who : who;
    let v = values[bin];
    const rest = search(lv, fixed, values, balls, cnt, next, depth - 1, next === who ? alpha - v : -beta + v, next === who ? beta - v : -alpha + v, stats);
    v += next === who ? rest : -rest;
    balls[who]++; cnt[bin * 2 + who]--;
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
    if (stats.stop && performance.now() > stats.stop) break;
  }
  return best;
}
export function countsOf(st) {
  const cnt = new Int8Array(W * 2);
  st.bins.forEach((bin, b) => bin.forEach(o => cnt[b * 2 + o]++));
  return cnt;
}

// Escolha em passos (gerador): aprofunda até a profundidade do adversário ou ~60 ms.
export function* chooseMoveGen(st, who, o, rand = Math.random) {
  const moves = legalMoves(st);
  if (!moves.length) return null;
  if (o.blunder && rand() < o.blunder) return moves[Math.floor(rand() * moves.length)];
  const t0 = performance.now();
  const stats = { n: 0, stop: 0, order: [2, 3, 1, 4, 0, 5], endEval: o.depth >= 2 };
  const cnt0 = countsOf(st);
  const remaining = st.balls[0] + st.balls[1];
  const maxD = Math.min(o.depth, remaining);
  let vals = null;
  for (let d = Math.min(o.depth, 1); d <= maxD; d++) {
    stats.stop = d > 2 ? t0 + 60 : 0;
    const cur = [];
    let aborted = false;
    for (const e of moves) {
      const lv = Int8Array.from(st.levers);
      const bin = dropFast(lv, st.fixed, e);
      const balls = st.balls.slice(); balls[who]--;
      const cnt = Int8Array.from(cnt0); cnt[bin * 2 + who]++;
      const next = balls[1 - who] > 0 ? 1 - who : who;
      let v = st.values[bin];
      const rest = balls[0] + balls[1] === 0 ? bonusDiff(cnt, next) : d > 1 ? search(lv, st.fixed, st.values, balls, cnt, next, d - 1, -Infinity, Infinity, stats) : (stats.endEval ? bonusDiff(cnt, next) * 0.5 : 0);
      v += next === who ? rest : -rest;
      cur.push(v);
      if (stats.stop && performance.now() > stats.stop) { aborted = true; break; }
    }
    if (!aborted) vals = cur;
    yield;
    if (aborted) break;
    if (d < maxD && d >= 2 && performance.now() - t0 > 30) break;   // a próxima não cabe no tempo
  }
  let best = moves[0], bs = -Infinity;
  moves.forEach((e, k) => {
    const v = vals[k] + (o.noise ? gauss(rand) * o.noise : 0) + rand() * 1e-6;
    if (v > bs) { bs = v; best = e; }
  });
  return best;
}
export function chooseMove(st, who, o, rand) {
  const g = chooseMoveGen(st, who, o, rand);
  let x;
  do { x = g.next(); } while (!x.done);
  return x.value;
}
export function playRound(st, a, b, rand) {
  let n = 0;
  while (!st.over) { st = applyMove(st, chooseMove(st, st.turn, st.turn === 0 ? a : b, rand)).st; if (++n > 40) throw new Error('rodada não terminou'); }
  return st;
}
export { W };

// Valor exato (busca até a última bolinha, sem limite de tempo) do ponto de vista de quem joga.
// Só para rodadas curtas (desafios): devolve { value, best } com a melhor entrada.
export function exactValue(st) {
  const stats = { n: 0, stop: 0, order: [2, 3, 1, 4, 0, 5], endEval: true };
  const who = st.turn;
  const cnt0 = countsOf(st);
  let best = -1, bv = -Infinity;
  for (const e of legalMoves(st)) {
    const lv = Int8Array.from(st.levers);
    const bin = dropFast(lv, st.fixed, e);
    const balls = st.balls.slice(); balls[who]--;
    const cnt = Int8Array.from(cnt0); cnt[bin * 2 + who]++;
    const next = balls[1 - who] > 0 ? 1 - who : who;
    let v = st.values[bin];
    const total = balls[0] + balls[1];
    const rest = total === 0 ? (st.solo ? 0 : bonusDiff(cnt, next)) : search(lv, st.fixed, st.values, balls, cnt, next, total, -Infinity, Infinity, { ...stats, solo: st.solo });
    v += next === who ? rest : -rest;
    if (v > bv) { bv = v; best = e; }
  }
  return { value: bv, best, nodes: stats.n };
}
