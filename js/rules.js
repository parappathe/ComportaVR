// Regras da Comporta. Sem navegador e sem Three.js (os testes rodam no Node).
//
// Tabuleiro em pé com 6 canaletas (0 = esquerda) e 6 andares de comportas. No andar r há comporta em
// toda canaleta x menos onde (x + 2r) é múltiplo de 3 (ali a bolinha passa reto): 4 por andar, 24 ao
// todo. Cada comporta está virada para a esquerda (-1) ou para a direita (+1).
// A bolinha entra no topo da canaleta escolhida e desce. Bateu numa comporta: vai para a canaleta do
// lado para onde ela está virada (virada para a parede: desce reto) e a comporta VIRA para o outro lado.
// Comporta travada (pino dourado) desvia mas não vira. No fundo a bolinha cai na caixa da canaleta e
// quem soltou ganha o valor da caixa (a caixa do ralo tira pontos). No fim da rodada, quem tiver mais
// bolinhas numa caixa ganha mais 3 pontos por ela (empate, ninguém).

export const W = 6, R = 6;
export const PLAYER = 0, CPU = 1;
export const BALLS = 8;                         // bolinhas de cada um por rodada
export const BIN_VALUES = [4, 1, 6, -2, 2, 3];
export const MAJORITY = 3;                      // bônus de maioria por caixa no fim
export const LEVERS = [];                       // { r, x } na ordem: andar por andar, da esquerda
for (let r = 0; r < R; r++) for (let x = 0; x < W; x++) if ((x + 2 * r) % 3 !== 0) LEVERS.push({ r, x });
export const leverAt = (r, x) => LEVERS.findIndex(l => l.r === r && l.x === x);
const LEVER_INDEX = Array.from({ length: R }, (_, r) => Array.from({ length: W }, (_, x) => leverAt(r, x)));
// comportas no começo: desenho escolhido por busca (a 1ª bolinha já tem 4 caixas diferentes para ir)
export const START_LEVERS = [...'><<><><><<>>><<<<<<<><><'].map(c => (c === '<' ? -1 : 1));

export function newRound({ starter = PLAYER, levers = START_LEVERS, fixed = null, values = BIN_VALUES, balls = [BALLS, BALLS], solo = false } = {}) {
  return {
    levers: Int8Array.from(levers), fixed: fixed ? Uint8Array.from(fixed) : new Uint8Array(LEVERS.length),
    values: values.slice(), balls: balls.slice(), score: [0, 0], bins: Array.from({ length: W }, () => []),
    turn: starter, starter, moves: 0, over: false, solo,
  };
}
export function cloneState(st) {
  return { ...st, levers: Int8Array.from(st.levers), balls: st.balls.slice(), score: st.score.slice(), bins: st.bins.map(b => b.slice()) };
}

// Caminho da bolinha (sem mexer no estado): andares que ela passa, comportas que viram e a caixa.
// levers é mexido se "apply" for verdade.
export function trace(levers, fixed, entry, apply = false) {
  let x = entry;
  const steps = [];
  for (let r = 0; r < R; r++) {
    const k = LEVER_INDEX[r][x];
    if (k < 0) { steps.push({ r, from: x, to: x, lever: -1 }); continue; }
    const d = levers[k];
    let nx = x + d;
    if (nx < 0 || nx >= W) nx = x;          // virada para a parede: desce reto (e vira)
    const flips = !fixed[k];
    steps.push({ r, from: x, to: nx, lever: k, dir: nx - x, flips });
    if (apply && flips) levers[k] = -levers[k];
    x = nx;
  }
  return { entry, bin: x, steps };
}
// simulação "pura" para a IA: mexe nas comportas e devolve a caixa
export function dropFast(levers, fixed, entry) {
  let x = entry;
  for (let r = 0; r < R; r++) {
    const k = LEVER_INDEX[r][x];
    if (k < 0) continue;
    const d = levers[k];
    let nx = x + d;
    if (nx < 0 || nx >= W) nx = x;
    if (!fixed[k]) levers[k] = -d;
    x = nx;
  }
  return x;
}

export function legalMoves(st) {
  if (st.over || st.balls[st.turn] <= 0) return [];
  return [0, 1, 2, 3, 4, 5];
}
export function applyMove(st0, entry) {
  if (st0.over) throw new Error('rodada acabou');
  if (!(entry >= 0 && entry < W)) throw new Error(`entrada inválida: ${entry}`);
  const who = st0.turn;
  if (st0.balls[who] <= 0) throw new Error('sem bolinha');
  const st = cloneState(st0);
  const path = trace(st.levers, st.fixed, entry, true);
  const value = st.values[path.bin];
  st.score[who] += value;
  st.bins[path.bin].push(who);
  st.balls[who]--;
  st.moves++;
  if (st.solo) st.over = st.balls[PLAYER] <= 0;
  else { st.turn = 1 - who; if (st.balls[0] <= 0 && st.balls[1] <= 0) st.over = true; else if (st.balls[st.turn] <= 0) st.turn = who; }
  let bonus = null;
  if (st.over && !st.solo) {
    bonus = majority(st.bins);
    st.score[0] += bonus[0]; st.score[1] += bonus[1];
  }
  return { st, info: { by: who, entry, path, bin: path.bin, value, bonus } };
}
// bônus de maioria de cada jogador (no fim da rodada)
export function majority(bins) {
  const b = [0, 0];
  for (const bin of bins) {
    const a = bin.filter(o => o === 0).length, c = bin.length - a;
    if (a > c) b[0] += MAJORITY; else if (c > a) b[1] += MAJORITY;
  }
  return b;
}
// quem está levando cada caixa agora: 0, 1 ou -1
export const binLeader = (bin) => { const a = bin.filter(o => o === 0).length, c = bin.length - a; return a > c ? 0 : c > a ? 1 : -1; };
export function preview(st, entry) { return st.over ? null : applyMove(st, entry).info; }

// Partida: 2 rodadas, cada um começa uma. Soma dos pontos.
export class Match {
  constructor({ starter = PLAYER } = {}) { this.firstStarter = starter; this.results = []; this.index = 0; this.round = newRound({ starter }); }
  get roundOver() { return this.round.over; }
  play(e) { const r = applyMove(this.round, e); this.round = r.st; return r.info; }
  closeRound() { this.results.push({ score: this.round.score.slice() }); }
  nextRound() { this.index++; this.round = newRound({ starter: 1 - this.firstStarter }); }
  get over() { return this.results.length >= 2; }
  total(who) { return this.results.reduce((s, r) => s + r.score[who], 0); }
  get winner() { if (!this.over) return null; const a = this.total(0), b = this.total(1); return a > b ? PLAYER : b > a ? CPU : -1; }
}

// Comportas em texto: um caractere por comporta, na ordem de LEVERS ('<' esquerda, '>' direita;
// maiúsculo travada: 'L' esquerda travada, 'R' direita travada)
export function leversFromText(t) {
  const s = t.replace(/[^<>LR]/g, '');
  if (s.length !== LEVERS.length) throw new Error(`precisa de ${LEVERS.length} comportas, veio ${s.length}`);
  return { levers: [...s].map(c => (c === '<' || c === 'L' ? -1 : 1)), fixed: [...s].map(c => (c === 'L' || c === 'R' ? 1 : 0)) };
}
export function leversText(st) {
  return [...st.levers].map((v, k) => (st.fixed[k] ? (v < 0 ? 'L' : 'R') : v < 0 ? '<' : '>')).join('');
}
