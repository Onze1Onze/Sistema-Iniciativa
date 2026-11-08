# Sistema de Iniciativa — Owlbear Rodeo

Tracker de combate para Owlbear Rodeo com ordem sincronizada, painel cinematográfico, avanço de turnos e controles por personagem.

## Instalação

1. No GitHub, abra **Settings → Pages**.
2. Em **Build and deployment**, selecione **Deploy from a branch**.
3. Escolha a branch `main` e a pasta `/(root)`.
4. Aguarde o GitHub Pages publicar o site.
5. No Owlbear Rodeo, adicione uma extensão usando este manifesto:

   `https://Onze1Onze.github.io/Sistema-Iniciativa/manifest.json`

6. Habilite a extensão na sala.

## Uso

- Use a ação **Sistema de Iniciativa** na barra superior da sala para abrir o painel.
- Selecione um ou mais tokens da camada **Personagem** e use **Adicionar selecionados** ou o menu contextual **Alternar na iniciativa**.
- Cada combatente recebe uma rolagem inicial de d20; o valor pode ser editado manualmente.
- **Iniciar combate** define o primeiro turno da ordem.
- **Próximo turno** avança o destaque; ao ultrapassar o último combatente, a rodada aumenta.
- O controle de turno permite selecionar diretamente um combatente.
- **Remover** tira o personagem do encontro. **Limpar encontro** remove todos os participantes e encerra o combate.

## Recursos

- Linha horizontal de iniciativa com destaque do turno ativo e prévia dos próximos combatentes.
- Lista completa ordenada por iniciativa decrescente, desempate por nome.
- Rodada atual, progresso do encontro e estado de combate.
- Rolagem rápida de d20, ajuste manual da iniciativa e edição de nome exibido.
- Condições rápidas por participante, observações e controle de participação.
- Animações de entrada, mudança de turno, foco e feedback; respeita `prefers-reduced-motion`.
- Estado de cada participante salvo nos metadados do token; rodada e turno ativo salvos nos metadados da cena.
- Atualização em tempo real para os jogadores conectados.

## Dados e compatibilidade

- SDK oficial `@owlbear-rodeo/sdk@3.1.0`, carregado como módulo ESM.
- Sem servidor próprio ou banco externo. O GitHub Pages entrega os arquivos estáticos.
- Namespace de metadados: `com.onze1onze.sistema-iniciativa`.
- A extensão lê e grava somente os metadados próprios nos tokens e na cena.
- A ordem e o estado do encontro são compartilhados pela própria cena do Owlbear Rodeo.
- Alterações simultâneas de diferentes usuários podem conflitar conforme o modelo de sincronização do Owlbear; recomenda-se que o mestre controle os avanços de turno.

## Desenvolvimento e testes

Não há etapa de build. Os arquivos estáticos podem ser servidos diretamente pelo GitHub Pages.

Arquivos principais:
- `manifest.json`: registro da ação do Owlbear e página de fundo.
- `index.html`, `styles.css`, `app.js`: painel e interface.
- `background.html`, `background.js`: integração do menu contextual.
- `core.js`: regras puras de ordenação, d20 e ciclo de turnos.
- `icon.svg`, `icons/`: ícones da extensão.
- `tests/initiative.test.mjs`: testes unitários das regras de iniciativa.

Execute com Node.js 18 ou superior:

- `npm run check` — valida a sintaxe dos módulos JavaScript.
- `npm test` — executa os testes unitários.

O GitHub Actions executa essas verificações em cada push e pull request para `main`.

## Limitações conhecidas

- O SDK não disponibiliza um bloqueio transacional para garantir que apenas uma pessoa avance o combate; combine quem controla os turnos.
- A extensão não movimenta tokens, não altera HP e não aplica condições nativas na mesa. As condições são marcadores visuais próprios do tracker.
- O teste final de integração deve ser realizado em uma sala real do Owlbear Rodeo, com dois ou mais clientes conectados.