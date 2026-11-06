# ComportaVR

Comporta: jogo de tabuleiro em VR para o Meta Quest 3 no navegador (WebXR), sem instalar nada. Dentro
de um moinho d'água numa manhã de sol (paredes de pedra, vigas, mó, sacas de farinha e, pela janela
larga, o riacho com a roda d'água girando), um tabuleiro de madeira em pé na mesa tem 6 funis no alto,
6 canaletas com 24 comportas que viram a cada bolinha que passa e 6 caixas com valor embaixo. A sua
bolinha muda o caminho das próximas, inclusive as do adversário. Partida contra 3 adversários com
personalidade e 10 desafios com 3 estrelas. Também joga no PC com mouse e teclado. Tudo em português.

## Como rodar / jogar

**No Quest:** o endereço publicado será `https://parappathe.github.io/ComportaVR/` (abrir no navegador
do óculos e apertar "Entrar em VR"). Publicar é com o Eduardo (`python publicar.py ComportaVR` na pasta
`C:\claude code`).

**No PC:** `python serve.py` nesta pasta e abrir `http://localhost:8864` (o painel de visualização usa
`.claude/launch.json`). O `serve.py` manda o navegador não guardar cache; `python serve.py --https`
serve para abrir no Quest pela rede de casa (porta 8443).

### Controles

| | VR (Quest) | PC |
|---|---|---|
| Pegar bolinha | Botão lateral (aperto) perto de um dos seus potes (na frente, à direita e à esquerda do tabuleiro) | Não precisa |
| Soltar | Soltar o aperto com a mão em cima de um funil; ou apontar o controle para a canaleta e soltar. Sem bolinha na mão: apontar para a canaleta e apertar o gatilho também solta | Clicar na canaleta (qualquer altura) ou teclas 1 a 6 |
| Prévia | Enquanto segura (ou aponta): pontinhos de luz com o caminho exato, anéis amarelos nas comportas que vão virar, a caixa iluminada e a placa "Funil 3 → caixa +6 · vira 4 comportas / Depois, a melhor resposta do outro dá +4" | Passando o mouse na canaleta: o mesmo, e a caixa embaixo da tela |
| Só com as mãos | Pinça perto do pote pega; soltar a pinça em cima do funil solta | |
| Câmera | Você fica em pé de frente para o tabuleiro | A/D ou setas, ou arrastar com o botão direito; W/S sobe e desce; rodinha: zoom |
| Pausa | B ou Y | Esc ou P |
| Menu | Apontar com o controle e gatilho | Clique |
| FPS | Menu → FPS | Tecla F |

O adversário fica em pé atrás da mesa, ao lado do tabuleiro, olha a bolinha descer e reage. Cada caixa
tem uma bandeirinha da cor de quem está com mais bolinhas nela (bônus de maioria).

### Regras

- 6 canaletas e 6 andares. Em cada andar há comporta em 4 das 6 canaletas (onde x + 2·andar não é
  múltiplo de 3; nas outras a bolinha passa reto): 24 comportas. Cada uma aponta para a esquerda ou
  para a direita.
- Na sua vez solte uma bolinha num funil. Ela desce e, a cada comporta que toca, vai para a canaleta do
  lado para onde a comporta aponta (se aponta para a parede, desce reto) e a comporta **vira** para o
  outro lado. Comporta com pino dourado (só nos desafios) desvia mas não vira.
- Embaixo, a caixa dá os pontos para quem soltou: +4, +1, +6, −2 (ralo), +2, +3. No fim da rodada,
  quem tiver mais bolinhas numa caixa ganha +3 por ela (empate, ninguém).
- 8 bolinhas para cada um por rodada, alternando. Partida: 2 rodadas, cada um começa uma (sorteio na
  primeira); soma dos pontos.
- Adversários (em `js/ai.js`, em ordem de dificuldade): **Dona Enxurrada** (arriscada: solta onde ganha
  mais agora), **Seu Moleiro** (cauteloso: calcula 4 bolinhas à frente), **Vó Engenhosa** (pensa à
  frente: calcula até o fim da rodada, com limite de uns 60 ms).
- Desafios (em `js/challenges.js`): 1 a 4 são "solo" (só você solta, numa montagem pronta, e as
  estrelas pedem pontos): 1 Primeira bolinha, 2 A comporta vira, 3 Pino dourado, 4 Três seguidas. 5 a 10
  são duelos curtos contra a Vó, que joga perfeito (calcula até a última bolinha); você começa e as
  estrelas pedem a diferença no fim: ★ não perder, ★★ ganhar pela metade do melhor possível, ★★★ ganhar
  pelo melhor possível: 5 Duelo curto, 6 A caixa de 10, 7 Três contra três, 8 Ralo no meio, 9 Quatro
  bolinhas, 10 Grande final. Passar um (1 estrela) libera o próximo.
- Progresso salvo no navegador (localStorage, chave `comportavr.v1`): vitórias e partidas por
  adversário, estrelas por desafio, som, prévia e FPS.

## Como testar

- `npm test` (ou `node tests/run.js`): tabuleiro (24 comportas, ralo, a 1ª bolinha já tem 4 caixas,
  toda caixa alcançável), bolinha e comportas (direção, parede, toda comporta tocada vira e as outras
  não, a mesma entrada muda de caminho, pino dourado, prévia e simulação rápida da IA idênticas em 400
  sorteios, bônus de maioria, fim da rodada, partida de 2 rodadas), IA (jogada válida, a arriscada pega
  a melhor caixa, a Vó joga o valor exato no fim, pior jogada abaixo de 100 ms), IA contra IA em 6
  partidas de 2 rodadas por dupla (mostra placares; a mais difícil vence a maioria), partidas completas
  contra os 3, desafios (robô tira 3 estrelas, a meta do duelo é o melhor possível contra a Vó, repetir
  o mesmo funil não dá 3) e fumaça do `main.js`. Tem que terminar com "Tudo certo"; sai com código 1 se
  algo falhar (e sozinho se passar de 150 s). Não toca som. Leva uns 15 s.
- A fumaça (`tests/smoke.js` + `tests/three-stub.js`) carrega o jogo no Node com navegador e WebGL de
  mentira e joga **pelo mesmo caminho do jogo**: botões do painel (Partida → Seu Moleiro, Menu
  principal → Desafios → 1 → Próximo...), passa o mouse na canaleta e confere a prévia contra as regras,
  clica, confere a caixa e os pontos, solta com a tecla 5, deixa o robô terminar a partida conferindo a
  cada meio segundo que comportas e bolinhas nas caixas batem com as regras (`dev.check()`), resolve os
  10 desafios dentro do jogo (os duelos contra a Vó), força vitória e pausa. Precisa do Node 22.15 ou
  mais novo.
- No navegador (console): `dev.autoplay = true`, `dev.advance(5)`, `dev.state()` (pontos, bolinhas,
  caixas, prévia), `dev.loadLevel(3)`, `dev.startMatch(2)`, `dev.press('Desafios')`, `dev.play(2)` (solta
  no funil 3), `dev.forceWin()`, `dev.check()`, `dev.laneScreen(2)` (posição da canaleta na tela),
  `dev.resetSave()`. `window.comporta` tem `match`, `challenge`, `save`, `camera`, `scene`, `renderer`,
  `world`.
- **Só dá para testar no óculos:** pegar a bolinha no pote (raio de 9 cm), soltar em cima do funil (o
  funil é achado com a mão até 25 cm acima dele e 15 cm à frente ou atrás), apontar e gatilho, pinça,
  altura dos funis (1,52 m) para quem está em pé, placas, vibração, rastreamento de mãos e FPS.

## Estrutura

| Arquivo | O que tem |
|---|---|
| `index.html`, `css/style.css` | Página, botão "Entrar em VR", placar, caixa da prévia e dica do PC |
| `js/rules.js` | Comportas (`LEVERS`), caminho exato (`trace`, `dropFast`), `applyMove`, maioria, `Match`, comportas em texto. Sem navegador |
| `js/ai.js` | Adversários, robô, negamax com poda sobre a simulação exata (com o bônus de maioria no fim), escolha em passos (`chooseMoveGen`), valor exato para os desafios (`exactValue`). Sem navegador |
| `js/challenges.js` | Os 10 desafios (solo e duelo), nota, resposta da Vó, robô que resolve. Sem navegador |
| `js/main.js` | Liga tudo: render, VR (pegar no pote, soltar no funil, apontar), mouse/teclado, prévia com caminho, animação da bolinha descendo (velocidade cresce com a queda) com as comportas virando na hora em que ela passa, turnos, menus, HUD, placar, `dev` |
| `js/scene.js` | Moinho (pedra, vigas, janela com riacho e roda d'água, mó, sacas), mesa, potes, tabuleiro (fundo, funis, números, comportas com pino, pinos de enfeite, caixas com valores, bandeirinhas), bolinhas, pontos do caminho, adversário, quadro do placar |
| `js/avatar.js` | Boneco do adversário |
| `js/ui.js` | Painel de menu 3D em canvas e placas de texto |
| `js/audio.js` | Sons sintetizados: bolinha batendo, comporta virando, caixa pontuando (o ralo faz som triste), riacho, passarinhos, fanfarras |
| `js/save.js` | Progresso e opções salvos |
| `tests/run.js`, `tests/smoke.js`, `tests/three-stub.js` | Testes |
| `serve.py` | Servidor local sem cache (porta 8864, `--https` para o Quest) |
| `vendor/three/three.module.js` | Three.js r170 (cópia local) |

Coordenadas: canaleta x (0 a 5, da esquerda) fica em ((x − 2,5)·8,5 cm) e o andar r em (1,44 − (r + 0,5)·
7,4 cm) de altura, no grupo `world.board`, que fica em z = −0,42 (plano do tabuleiro de frente para
você). Funis a 1,52 m, caixas de 0,85 a 0,97 m, tampo da mesa a 0,84 m. No VR a cabeça fica em x = 0,
z = 0,18.

## Regras e convenções do projeto

- `rules.js`, `ai.js` e `challenges.js` não podem usar navegador nem Three.js: os testes rodam no Node.
- A animação segue o caminho das regras (não tem motor de física): o que a prévia mostra é exatamente o
  que acontece. Mexeu na regra das comportas: rodar `npm test` (o teste compara prévia, simulação
  rápida e jogada de verdade).
- Desafio novo ou mudado: o robô tem que tirar 3 estrelas, repetir o mesmo funil não pode dar 3 e, no
  duelo, a meta tem que ser o melhor possível contra a Vó.
- A IA no navegador pensa em pedaços (gerador) e no máximo uns 60 ms.
- Testes nunca tocam som.
- Desempenho no Quest: uma luz com sombra (o sol, mapa 1024 em volta do tabuleiro), sacas, pinos e os
  pontos do caminho em `InstancedMesh`, geometria e materiais das comportas e bolinhas compartilhados.

## Decisões

- Pontos por valor da caixa e bônus de maioria no fim: só o valor deixava o jogo guloso (quem pega a
  melhor caixa agora ganha); a maioria obriga a pensar no fim da rodada e separa bem os 3 adversários.
- Comporta em 4 de cada 6 canaletas e "virada para a parede desce reto": com comporta em todas (ou
  mandando para dentro na parede) duas caixas nunca recebiam bolinha.
- 2 rodadas alternando quem começa: quem começa leva vantagem numa rodada só.
- Desafios 5 a 10 como duelo contra a Vó perfeita: "faça o máximo sozinho" tinha soluções demais; contra
  ela só uma primeira bolinha dá a vitória máxima.
- Desenho inicial das comportas escolhido por busca para a 1ª bolinha ter 4 caixas diferentes.
- Porta do servidor local 8864.

## Pendências / problemas conhecidos

- Nada testado no Quest ainda: pegar e soltar (aperto e pinça), apontar e gatilho, altura dos funis,
  placas, vibração, rastreamento de mãos e FPS.
- A dificuldade foi calibrada com IA contra IA; contra gente a Vó pode estar difícil demais.
- No PC, com o tabuleiro grande na câmera padrão, o adversário aparece cortado no canto direito.
