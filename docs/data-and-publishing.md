# Fontes e publicação

## Faturamento

O dashboard lê exclusivamente `power-bi-revenue.json` e `mcd-power-bi-revenue.json`.
Os números financeiros foram removidos dos roteiros operacionais. `allocateRevenue`
valida filial e fornecedor antes de cruzar o CNPJ completo, sem usar nomes, raiz de CNPJ
ou estimativas para atribuir vendas às lojas.

A exportação disponível identifica somente TCG. Ela não contém a coluna UF.
O mapa e os indicadores filtrados usam exclusivamente CNPJs do roteiro de MS.
A MCD fica sem valor até existir exportação própria com filial MCD e recorte MS conferidos.
Os arquivos atuais são cópias exportadas, não uma integração contínua autenticada com o BI.
Não há confirmação de fechamento dos três meses. A interface apresenta essa limitação.

Conferência de 07/09/2026, modelo atualizado em 06/09/2026: exportações com
FILIAL = TCG, razao_for = MONDELEZ e Ano = 2026. Os totais reconciliados são
junho R$ 5.475.536,76, julho R$ 4.289.960,51 e agosto R$ 2.357.922,79.
São totais da filial exportada, não das lojas atendidas em MS. Os filtros completos
e hashes de cada exportação estão em `meta.evidence`. Linhas com apenas Carteira,
sem Faturado, não são convertidas em receita. A lista FILIAL só ofereceu TCG.
O script `scripts/refresh-tcg-bi.cjs` valida os três arquivos antes de salvar.
Na mesma raiz ABV, julho soma R$ 546.118,59 nesta fonte e neste recorte.

O CNPJ ABV `04.757.459/0005-19` aparece com R$ 1.135.097,70 em junho na exportação TCG,
mas não consta no roteiro. Lançamentos assim aparecem apenas no detalhe separado da
rede, sem cidade ou promotor inferidos e sem entrar no faturamento das lojas filtradas.
A identificação da rede usa a mesma raiz com mais de um CNPJ distinto no roteiro.

Antes de atualizar o faturamento: conferir filial, Mondelez, UF MS, mês, medida Faturado,
completude da exportação e reconciliar a soma dos CNPJs com o mesmo recorte no BI.
Nunca substituir valores para aproximá-los de uma expectativa comercial.

## Loja Perfeita

`/loja-perfeita.html` mantém o painel original. `/enviar.html` permite selecionar
relatório CSV/Excel e PDF de coletas com fotos. Só o botão Publicar envia os arquivos.
Os endpoints `/api/public/dados` e `/api/public/fotos` usam os bindings D1 `DB` e R2 `BUCKET`.
A migração `0001` cria `published_assets`. Aplicação e arquivos estáticos devem ser
publicados juntos para os uploads funcionarem.

Cada relatório e PDF recebe uma chave imutável. A referência ativa muda após a gravação
completa. PDFs são enviados em partes de 3 MB e só publicados depois de verificar todas
as partes. A leitura usa a versão fixada no início do download. Versões anteriores ficam
preservadas no R2 e no catálogo D1 para recuperação administrativa.

A visualização e o envio são públicos, conforme o fluxo original fornecido. Não existe
autenticação para publicar. A página informa isso antes do envio. A proteção de origem
evita envios acidentais de outra página, mas não funciona como autorização de usuário.
Os CSVs são reduzidos às colunas operacionais. O conteúdo de PDFs deve ser revisado por
quem publica. Não há acesso ao Involves nem alteração de seus dados.

As fontes originais estão em `public/fonts` com suas licenças. O PDF.js original está
em `public/vendor`, com `isEvalSupported: false`. Não há dependência de CDN ao visualizar.
O cruzamento explícito dos códigos PDV do painel antigo está em `loja-pdv-cnpj.js`.
Ele serve apenas para filtros operacionais. O faturamento nunca usa códigos abreviados.

## Verificação

`node --test tests/dashboard-regressions.test.mjs` cobre separação de filial, CNPJ exato,
faturamento fora do roteiro, filtros, status de coleta, geometria com saldo negativo,
vínculo PDV, validação de arquivos e publicação transacional dos PDFs.
