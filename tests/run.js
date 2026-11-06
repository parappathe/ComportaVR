// Testes automáticos: node tests/run.js (ou npm test). Não tocam som e saem com código 1 se algo falhar.
import { W, R, LEVERS, BALLS, MAJORITY, BIN_VALUES, START_LEVERS, PLAYER, CPU, newRound, applyMove, preview, trace, dropFast, majority, Match, leversFromText, leversText } from '../js/rules.js';
import { OPPONENTS, ROBOT, rng, chooseMove, playRound, exactValue } from '../js/ai.js';
import { CHALLENGES, setupChallenge, solveChallenge, gradeMoves, gradeState, resultOf, defend } from '../js/challenges.js';

let fails = 0, count = 0;
function ok(cond, msg) { count++; if (!cond) { fails++; console.log('  FALHOU:', msg); } }
process.on('uncaughtException', (e) => { console.log('ERRO:', e); process.exit(1); });
process.on('unhandledRejection', (e) => { console.log('ERRO:', e); process.exit(1); });
setTimeout(() => { console.log('ERRO: os testes passaram de 150 s'); process.exit(1); }, 150000).unref();

console.log('Tabuleiro');
{
  ok(LEVERS.length === 24 && LEVERS.filter(l => l.r === 0).length === 4, '24 comportas, 4 por andar');
  ok(BIN_VALUES.length === W && BIN_VALUES.some(v => v < 0), '6 caixas, uma é ralo');
  const st = newRound();
  const bins = new Set([0, 1, 2, 3, 4, 5].map(e => preview(st, e).bin));
  ok(bins.size >= 3, `no começo a 1ª bolinha já tem ${bins.size} caixas diferentes para ir`);
  // todas as caixas são alcançáveis (com alguma montagem)
  const reach = new Set();
  const r = rng(1);
  for (let t = 0; t < 300; t++) { const lv = Int8Array.from(LEVERS.map(() => (r() < 0.5 ? -1 : 1))); for (let e = 0; e < W; e++) reach.add(dropFast(Int8Array.from(lv), new Uint8Array(24), e)); }
  ok(reach.size === W, 'toda caixa pode receber bolinha');
  ok(leversText(newRound({ ...leversFromText('L' + '<'.repeat(23)) })) === 'L' + '<'.repeat(23), 'texto das comportas');
}

console.log('Bolinha e comportas');
{
  // tudo para a esquerda: da canaleta 3 ela vai descendo para a esquerda
  const allL = leversFromText('<'.repeat(24));
  let st = newRound({ ...allL, balls: [3, 3] });
  const p = trace(st.levers, st.fixed, 3, false);
  ok(p.steps.every(s => s.lever < 0 || s.to === s.from - 1 || (s.from === 0 && s.to === 1)), 'comporta para a esquerda manda para a esquerda (na parede, para dentro)');
  const x = applyMove(st, 3);
  ok(x.info.path.steps.filter(s => s.lever >= 0).every(s => x.st.levers[s.lever] === 1), 'toda comporta que a bolinha tocou virou');
  const untouched = LEVERS.map((_, k) => k).filter(k => !x.info.path.steps.some(s => s.lever === k));
  ok(untouched.every(k => x.st.levers[k] === -1), 'as que ela não tocou ficaram iguais');
  ok(x.st.score[0] === BIN_VALUES[x.info.bin] && x.st.turn === CPU, 'pontua a caixa e passa a vez');
  // a mesma entrada de novo muda de caminho (as comportas viraram)
  const y = applyMove(x.st, 3);
  ok(y.info.path.steps.some((s, i) => s.to !== x.info.path.steps[i].to), 'a próxima bolinha pela mesma entrada faz outro caminho');
  // pino dourado não vira
  const fx = leversFromText('L'.repeat(24));
  const z = applyMove(newRound({ ...fx }), 2);
  ok([...z.st.levers].every(v => v === -1), 'comporta travada não vira');
  // prévia igual ao que acontece, e não mexe no estado
  const r = rng(5);
  let bad = 0;
  for (let t = 0; t < 400; t++) {
    const s0 = newRound({ levers: LEVERS.map(() => (r() < 0.5 ? -1 : 1)) });
    const e = (r() * 6) | 0;
    const before = leversText(s0);
    const pv = preview(s0, e);
    const real = applyMove(s0, e);
    if (leversText(s0) !== before || pv.bin !== real.info.bin) bad++;
    const fast = Int8Array.from(s0.levers);
    if (dropFast(fast, s0.fixed, e) !== real.info.bin || leversText({ levers: fast, fixed: s0.fixed }) !== leversText(real.st)) bad++;
  }
  ok(bad === 0, 'prévia e simulação rápida da IA dão exatamente o mesmo caminho (400 sorteios)');
  // fim da rodada e maioria
  ok(majority([[0, 0, 1], [1], [], [0, 1], [1, 1, 0], []]).join() === `${MAJORITY},${2 * MAJORITY}`, 'bônus de maioria por caixa (empate não conta)');
  let s = newRound();
  while (!s.over) s = applyMove(s, (s.moves * 5) % 6).st;
  const raw = s.bins.reduce((a, bin, x) => { bin.forEach(o => { a[o] += BIN_VALUES[x]; }); return a; }, [0, 0]);
  const bonus = majority(s.bins);
  ok(s.moves === 2 * BALLS && s.score[0] === raw[0] + bonus[0] && s.score[1] === raw[1] + bonus[1], 'rodada acaba nas 16 bolinhas e soma caixas + maioria');
  let threw = false;
  try { applyMove(s, 0); } catch { threw = true; }
  ok(threw, 'não deixa jogar depois do fim');
  const m = new Match({ starter: PLAYER });
  const starters = [];
  while (!m.over) { starters.push(m.round.starter); while (!m.roundOver) m.play(0); m.closeRound(); if (!m.over) m.nextRound(); }
  ok(starters.join() === '0,1' && m.total(0) === m.results[0].score[0] + m.results[1].score[0], 'partida: 2 rodadas, cada um começa uma, soma');
}

console.log('IA');
{
  const r = rng(7);
  // situação em que só uma entrada dá a caixa de 6
  const st = newRound({ starter: CPU, balls: [1, 1] });
  const bestNow = Math.max(...[0, 1, 2, 3, 4, 5].map(e => preview(st, e).value));
  for (const o of OPPONENTS) {
    const e = chooseMove(st, CPU, { ...o, noise: 0, blunder: 0 }, r);
    ok(e >= 0 && e < W, `${o.name} escolhe uma entrada válida`);
  }
  const g = chooseMove(st, CPU, { ...OPPONENTS[0], noise: 0, blunder: 0 }, r);
  ok(preview(st, g).value === bestNow, 'a arriscada pega a melhor caixa da hora');
  // a mestra acha o valor exato no fim da rodada
  const end = newRound({ starter: CPU, balls: [2, 2] });
  const ex = exactValue(end);
  const mv = chooseMove(end, CPU, { ...OPPONENTS[2], noise: 0 }, r);
  const after = applyMove(end, mv).st;
  const v = after.score[1] - after.score[0] - exactValue(after).value * (after.turn === CPU ? -1 : 1);
  ok(v === ex.value, `mestra joga o melhor no fim da rodada (${v} = ${ex.value})`);
  let worst = 0;
  for (const o of OPPONENTS) {
    let s = newRound({ starter: CPU });
    while (!s.over) { const t0 = performance.now(); const e = chooseMove(s, s.turn, o, r); worst = Math.max(worst, performance.now() - t0); s = applyMove(s, e).st; }
  }
  ok(worst < 100, `IA pensa rápido (pior jogada: ${worst.toFixed(0)} ms)`);
}

console.log('IA contra IA');
{
  const r = rng(2026);
  // partidas de 2 rodadas (quem começa leva vantagem numa rodada só)
  const duel = (a, b, G = 6) => {
    let wa = 0, wb = 0; const lines = [];
    for (let g = 0; g < G; g++) {
      let ta = 0, tb = 0;
      for (const starter of [0, 1]) { const st = playRound(newRound({ starter }), a, b, r); ta += st.score[0]; tb += st.score[1]; }
      if (ta > tb) wa++; else if (tb > ta) wb++;
      lines.push(`${ta}x${tb}`);
    }
    console.log(`  ${a.name} ${wa} x ${wb} ${b.name} em partidas (${lines.join(' ')})`);
    return wa;
  };
  ok(duel(OPPONENTS[2], OPPONENTS[1]) > 3, 'mestra vence o cauteloso na maioria das partidas');
  ok(duel(OPPONENTS[2], OPPONENTS[0]) > 3, 'mestra vence a arriscada na maioria das partidas');
  ok(duel(OPPONENTS[1], OPPONENTS[0]) > 3, 'cauteloso vence a arriscada na maioria das partidas');
  let done = 0;
  for (const o of OPPONENTS) {
    const m = new Match({ starter: CPU });
    while (!m.over) { while (!m.roundOver) m.play(chooseMove(m.round, m.round.turn, m.round.turn === CPU ? o : ROBOT, r)); m.closeRound(); if (!m.over) m.nextRound(); }
    if (m.winner !== null) done++;
  }
  ok(done === 3, 'partidas completas contra os 3 adversários terminam');
}

console.log('Desafios');
{
  ok(CHALLENGES.length >= 8 && CHALLENGES.length <= 10, `${CHALLENGES.length} desafios`);
  for (const [i, c] of CHALLENGES.entries()) {
    ok(c.lev.length === LEVERS.length && c.values.length === W && c.desc && c.stars.length === 3 && c.stars.every((s, k) => !k || s >= c.stars[k - 1]), `desafio ${i + 1}: montagem e metas válidas`);
    const t0 = performance.now();
    const best = solveChallenge(c);
    console.log(`  ${i + 1}. ${c.name} (${c.kind}): ${'★'.repeat(best.stars)}${'☆'.repeat(3 - best.stars)}  funis ${best.moves.map(e => e + 1).join(', ')} → ${best.result}  (${(performance.now() - t0).toFixed(0)} ms)`);
    ok(best.stars === 3 && gradeMoves(c, best.moves) === 3, `robô tira 3 estrelas no desafio ${i + 1}`);
    if (c.kind === 'duel') ok(exactValue(setupChallenge(c)).value === c.best, `desafio ${i + 1}: a meta de 3 estrelas é o melhor possível contra a Vó (${c.best})`);
    if (c.balls > 1) for (const e of [0, 1, 2, 3, 4, 5]) if (gradeMoves(c, Array(c.balls).fill(e)) === 3) ok(false, `desafio ${i + 1}: repetir o funil ${e + 1} não pode dar 3 estrelas`);
  }
  ok(gradeState(CHALLENGES[0], setupChallenge(CHALLENGES[0])) === 0, 'sem jogar: 0 estrela');
  ok(gradeMoves(CHALLENGES[0], [0]) < 3, 'desafio 1: o funil 1 não é a resposta');
}

console.log('Fumaça do main.js');
{
  const { smoke } = await import('./smoke.js');
  try { for (const [cond, msg] of await smoke()) ok(cond, msg); } catch (e) { ok(false, `main.js quebrou: ${e.stack || e}`); }
}

console.log(`\n${count - fails} de ${count} passaram`);
if (fails) { console.log(`${fails} FALHARAM`); process.exit(1); }
console.log('Tudo certo');
process.exit(0);
