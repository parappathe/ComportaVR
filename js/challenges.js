// Desafios da Comporta. Dois tipos:
//   - "solo": só você solta bolinhas, numa montagem pronta (comportas, pinos dourados e valores das
//     caixas). As estrelas pedem pontos.
//   - "duelo": rodada curta contra a Vó Engenhosa, que joga perfeito (calcula até a última bolinha).
//     Você começa. As estrelas pedem a diferença de pontos no fim (com o bônus de maioria).
// Comportas em texto: uma por comporta, andar por andar de cima para baixo, da esquerda para a
// direita: '<' esquerda, '>' direita, 'L'/'R' travada (pino dourado). Sem navegador.
import { newRound, applyMove, leversFromText, PLAYER, CPU } from './rules.js';
import { exactValue } from './ai.js';

export const CHALLENGES = [
  { kind: 'solo', name: 'Primeira bolinha', balls: 1, lev: '<<<<<<<<>><>><<<><<>>><<', values: [3, 0, -5, 7, 0, 2], stars: [7, 7, 7],
    desc: 'Siga as comportas com o dedo: só uma entrada chega na caixa de 7.' },
  { kind: 'solo', name: 'A comporta vira', balls: 2, lev: '<>>>><<<<><><<<>>><>><<<', values: [3, 0, -5, 7, 0, 2], stars: [5, 5, 9],
    desc: 'Cada bolinha vira as comportas que toca. A primeira abre caminho para a segunda.' },
  { kind: 'solo', name: 'Pino dourado', balls: 2, lev: '>>><R><R<R><<<<R<<<>><><', values: [0, 1, 2, 10, 1, -2], stars: [2, 2, 12],
    desc: 'Comporta com pino dourado desvia mas não vira. Dá para chegar no 10?' },
  { kind: 'solo', name: 'Três seguidas', balls: 3, lev: '<>R<>R<><>><<<><<L<<<<<>', values: [3, 0, -5, 7, 0, 2], stars: [4, 8, 12],
    desc: 'Três bolinhas. Prepare as comportas antes de ir para a caixa de 7.' },
  { kind: 'duel', name: 'Duelo curto', balls: 2, lev: '<<<<<<><<<>>><><<<><<>><', values: [8, 1, 0, -3, 2, 4], best: 15,
    desc: 'Duas bolinhas para cada um contra a Vó. Ela joga perfeito.' },
  { kind: 'duel', name: 'A caixa de 10', balls: 2, lev: '<><<><<<><<>>>><<<>>>><<', values: [0, 1, 2, 10, 1, -2], best: 13,
    desc: 'O 10 está no meio. Quem chegar lá primeiro?' },
  { kind: 'duel', name: 'Três contra três', balls: 3, lev: '<<>>>>>>>><R>R<><<<<<><>', values: [0, 1, 2, 10, 1, -2], best: 14,
    desc: 'Cuidado: a sua bolinha também abre caminho para a dela.' },
  { kind: 'duel', name: 'Ralo no meio', balls: 3, lev: '>><>>><>L<>>><L><>>><<<<', values: [3, 0, -5, 7, 0, 2], best: 12,
    desc: 'O ralo tira 5. Faça a Vó cair nele.' },
  { kind: 'duel', name: 'Quatro bolinhas', balls: 4, lev: '<>R<<><><R<<<<>>>R<><><>', values: [8, 1, 0, -3, 2, 4], best: 16,
    desc: 'Quatro para cada um. A maioria nas caixas vale 3 no fim.' },
  { kind: 'duel', name: 'Grande final', balls: 4, lev: '>><<>>>><RL>>>>>>R<<<>><', values: [8, 1, 0, -3, 2, 4], best: 13,
    desc: 'A última. Só uma primeira bolinha leva à vitória grande.' },
];
for (const c of CHALLENGES) if (c.kind === 'duel') c.stars = [0, Math.ceil(c.best / 2), c.best];

export function setupChallenge(c) {
  const { levers, fixed } = leversFromText(c.lev);
  if (c.kind === 'solo') return newRound({ levers, fixed, values: c.values, balls: [c.balls, 0], solo: true });
  return newRound({ levers, fixed, values: c.values, balls: [c.balls, c.balls], starter: PLAYER });
}
// resultado que conta: pontos (solo) ou diferença (duelo)
export const resultOf = (c, st) => (c.kind === 'solo' ? st.score[PLAYER] : st.score[PLAYER] - st.score[CPU]);
export function gradeState(c, st) {
  if (!st.over) return 0;
  const v = resultOf(c, st);
  return c.stars.filter(s => v >= s).length;
}
export function goalText(c) {
  const [a, b, s3] = c.stars;
  if (c.kind === 'solo') return a === s3 ? `★★★ ${s3} pontos` : `★ ${a} pontos   ★★ ${b}   ★★★ ${s3}`;
  return `★ não perder   ★★ ganhar por ${b}   ★★★ ganhar por ${s3} ou mais`;
}
// a resposta da Vó no duelo (perfeita)
export function defend(st) { return exactValue(st).best; }
export function gradeMoves(c, entries) {
  let st = setupChallenge(c);
  for (const e of entries) {
    if (st.over) break;
    st = applyMove(st, e).st;
    while (!st.over && st.turn === CPU) st = applyMove(st, defend(st)).st;
  }
  return gradeState(c, st);
}
// melhor entrada agora para você
export function bestEntry(c, st) {
  if (c.kind === 'duel') return exactValue(st).best;
  let best = 0, bv = -Infinity;
  for (let e = 0; e < 6; e++) { const v = soloBest(applyMove(st, e).st); if (v > bv) { bv = v; best = e; } }
  return best;
}
function soloBest(st) {
  if (st.over) return st.score[PLAYER];
  let m = -Infinity;
  for (let e = 0; e < 6; e++) m = Math.max(m, soloBest(applyMove(st, e).st));
  return m;
}
// Robô que resolve (joga contra a Vó no duelo). Gerador: para entre as bolinhas.
export function* bestChallengeGen(c) {
  let st = setupChallenge(c);
  const entries = [];
  while (!st.over) {
    const e = bestEntry(c, st);
    yield;
    entries.push(e);
    st = applyMove(st, e).st;
    while (!st.over && st.turn === CPU) st = applyMove(st, defend(st)).st;
  }
  return { stars: gradeState(c, st), moves: entries, result: resultOf(c, st) };
}
export function solveChallenge(c) {
  const g = bestChallengeGen(c);
  let x;
  do { x = g.next(); } while (!x.done);
  return x.value;
}
