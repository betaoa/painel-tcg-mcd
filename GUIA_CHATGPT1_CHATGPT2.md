# Guia do projeto, ChatGPT 1 e ChatGPT 2

## Projeto

- Repositório GitHub: https://github.com/betaoa/painel-tcg-mcd
- Site publicado: https://tcg-ms-intelligence.ra200847.chatgpt.site
- Estado principal: TCG, Mato Grosso do Sul.
- MCD: manter somente Mato Grosso do Sul. O faturamento MCD espera o acesso correto ao Power BI.

## O que o painel entrega

- Entrada com operações TCG e MCD.
- Mapa do Mato Grosso do Sul em 3D, com zoom, seleção de cidade e marcadores de cobertura.
- Filtros por cidade, rede, promotor, busca e período.
- Faturamento TCG por CNPJ, rede, cidade e promotor.
- Ranking de CNPJs e Top 10 lojas e redes.
- Custo de promotores: R$ 5.000 por promotor por mês.
- Avisos de promotores que atendem mais de uma cidade.
- Loja Perfeita com envio de arquivos, fotos e status de leitura.
- Top Varejista: aprovado em verde, reprovado em vermelho e sem leitura em cinza.

## Regras de dados

1. Não usar faturamento da planilha de roteiro.
2. O faturamento TCG vem dos exports do Power BI em `app/data/power-bi-revenue.json`.
3. O cruzamento de faturamento usa CNPJ completo.
4. Rede só existe quando as lojas compartilham a raiz de oito dígitos do CNPJ.
5. Não misturar dados de São Paulo com Mato Grosso do Sul.
6. Não inventar faturamento para MCD. Deixar como pendente até existir uma exportação válida do BI MCD MS.
7. Não publicar senhas, tokens, chaves de API, CPF, telefone ou exportações brutas do BI.

## Como o ChatGPT 1 trabalha

1. Abre este arquivo e `CHATGPT-HANDOFF.md`.
2. Lê o pedido novo e verifica se ele respeita as regras de dados.
3. Faz a alteração no projeto.
4. Roda `npm run build`.
5. Atualiza `CHATGPT-HANDOFF.md` com o que mudou, os testes feitos e a próxima pendência.
6. Faz um commit com mensagem clara.
7. Envia o commit para a branch `main` do GitHub.

## Como o ChatGPT 2 trabalha

1. Conecta a mesma conta GitHub `betaoa` no ChatGPT.
2. Abre `https://github.com/betaoa/painel-tcg-mcd`.
3. Lê `GUIA_CHATGPT1_CHATGPT2.md` e `CHATGPT-HANDOFF.md` antes de alterar qualquer coisa.
4. Atualiza o projeto a partir da branch `main` antes de editar.
5. Faz uma tarefa por vez.
6. Roda `npm run build`.
7. Atualiza `CHATGPT-HANDOFF.md` e faz commit na `main`.
8. Depois de publicar, informa no handoff o link da versão e o que ficou pendente.

## Como as duas contas se comunicam

O GitHub é a fonte única de verdade. Não precisa passar token nem senha entre contas.

Use estes três registros:

- `CHATGPT-HANDOFF.md`: estado atual, alterações feitas, testes e próximo passo.
- Histórico de commits: cada commit explica a mudança.
- Issues do GitHub: usar para tarefas maiores ou para algo que ficou bloqueado.

Modelo para atualizar `CHATGPT-HANDOFF.md`:

```md
## Atualização, AAAA-MM-DD
- Feito: descrição objetiva.
- Dados: fonte usada e período.
- Testado: comando e resultado.
- Próximo passo: uma ação clara.
- Bloqueio: informar somente se existir.
```

## Como enviar para o GitHub

1. Conectar o GitHub no ChatGPT usando a conta `betaoa`.
2. Confirmar que a integração tem permissão de escrita para `betaoa/painel-tcg-mcd`.
3. Fazer o commit com os arquivos alterados.
4. Enviar para `main`.
5. Conferir o commit no repositório antes de publicar o site.

Se a integração do ChatGPT não tiver escrita, o dono da conta deve renovar a conexão do GitHub e liberar o repositório para o conector.

## Como rodar localmente

```bash
npm ci
npm run dev
npm run build
```

## Pendência atual

Receber o acesso certo ao Power BI da MCD para atualizar o faturamento MCD de Mato Grosso do Sul.
