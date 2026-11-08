# Ordem Paranormal · Protocolo de Combate

Tracker vertical para Owlbear Rodeo, adaptado às regras-base de **Ordem Paranormal RPG (livro original, versão 1.2)**.

## Identidade visual
Painel vertical e compacto com referências de arquivos de investigação, relatórios restritos, carimbos de evidência, papel gasto, grafite, preto e vermelho de alerta. Os elementos gráficos são originais e não dependem de logotipos ou ilustrações proprietárias.

## Instalação
1. Abra **Settings → Pages**.
2. Selecione **Deploy from a branch**, branch \`main\` e pasta \`/(root)\`.
3. Adicione no Owlbear Rodeo: \`https://Onze1Onze.github.io/Sistema-Iniciativa/manifest.json\`.

## Regras
- Agentes usam a perícia **Iniciativa (Agilidade)**: 1d20 por ponto de AGI, escolhe o maior e soma o treinamento.
- AGI 0: 2d20, escolhe o menor.
- Treinamento: destreinado +0, treinado +5, veterano +10, expert +15.
- Ameaças: o mestre pode registrar vários tokens como um único grupo e usar um teste compartilhado; informe o menor bônus do grupo quando forem diferentes.
- Empates são resolvidos com novas rolagens dos envolvidos.
- Surpreendidos não agem na primeira rodada.
- Entradas tardias só ficam elegíveis na rodada seguinte.
- Iniciativa não é rolada de novo a cada rodada.
- Ordem decrescente dos resultados; apenas participantes elegíveis podem ser ativados.

## Interface
- Painel estreito e vertical.
- Cartão do turno atual com retrato e progresso.
- Fila vertical de participantes.
- Miniaturas dos tokens com iniciais como fallback.
- Marcadores de surpresa, empate, entrada tardia e condições.
- Animações curtas, respeitando \`prefers-reduced-motion\`.

## Dados e compatibilidade
- SDK \`@owlbear-rodeo/sdk@3.1.0\`.
- Metadados dos tokens e da cena, com namespace próprio.
- Não requer servidor nem banco externo.
- Dados de iniciativa antigos são preservados até uma nova rolagem.
- O menu contextual permite adicionar/remover agentes. Para agrupar ameaças use o painel.

## Testes
- \`npm run check\`
- \`npm test\`
- GitHub Actions executa os dois em cada push e pull request.

## Limitações
- O SDK não oferece bloqueio transacional para alterações simultâneas; recomenda-se que apenas o mestre controle os turnos.
- A ficha não é lida automaticamente e PV/PE/Sanidade não são alterados.
- A integração final precisa ser verificada em uma sala real do Owlbear com dois ou mais clientes.

## Referências técnicas
- https://docs.owlbear.rodeo/extensions/getting-started/
- https://docs.owlbear.rodeo/extensions/tutorial-initiative-tracker/
- https://docs.owlbear.rodeo/extensions/reference/manifest/
- https://docs.owlbear.rodeo/extensions/apis/scene/items/
- https://docs.owlbear.rodeo/extensions/reference/metadata/
- https://docs.owlbear.rodeo/extensions/apis/context-menu/
- Ordem Paranormal RPG, Livro de Regras v1.2, capítulo 4, páginas 82–83.