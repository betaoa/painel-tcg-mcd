# Passagem entre ChatGPT 1 e ChatGPT 2

## Estado atual
- Site publicado: https://tcg-ms-intelligence.ra200847.chatgpt.site
- Operação principal: TCG, Mato Grosso do Sul.
- MCD: manter somente MS. Faturamento MCD fica pendente até receber acesso correto ao Power BI.
- Faturamento TCG usa os exports do Power BI em `app/data/power-bi-revenue.json`.

## Regras que não podem mudar
- Não usar faturamento da planilha de roteiro.
- Cruzamento e detalhe de faturamento devem usar CNPJ completo.
- Rede só agrupa lojas que compartilham a raiz de oito dígitos do CNPJ.
- Não usar São Paulo para TCG ou MCD.
- Custo mensal de promotor: R$ 5.000.
- Mapa filtra todas as telas, inclusive promotores, redes e lojas.

## Antes de editar
1. Leia este arquivo e `README.md`.
2. Confira os filtros de cidade, rede, promotor e período.
3. Rode `npm run build`.
4. Não publique dados pessoais, senhas, tokens ou exports brutos do BI.

## Atualização, 2026-09-10
- Feito: projeto extraído do zip e versionado arquivo a arquivo; mapa 3D refeito
  com extrusão real e altura proporcional ao volume da cidade; `app/components/dashboard.tsx`
  removido por não ter importador; geometria do mapa reescrita em coordenadas
  relativas; faturamento recortado aos CNPJs que o painel exibe.
- Dados: `power-bi-revenue.json` passou de 1.724 para 257 CNPJs. Ficam os do roteiro
  de MS e os que dividem raiz de oito dígitos com uma rede do roteiro — o resto era
  faturamento de outras praças que o painel nunca mostrou e o navegador baixava.
  `totals` segue sendo o total da filial exportada e `meta.evidence` está intacta.
  O recorte roda em `scripts/enxuga-bi.mjs`, chamado no fim de `refresh-tcg-bi.cjs`,
  depois da reconciliação. Rode o refresh sempre a partir da exportação completa.
- Testado: `npm run build` e `node --test tests/*.test.mjs` (18/18). KPIs, faturamento
  mensal, custo, ranking de CNPJ e painel de redes conferidos no navegador nas duas
  filiais e nos quatro períodos, iguais aos de antes. Mapa comparado pixel a pixel:
  2 pixels de diferença em 2,2 milhões, de antialiasing.
- Resultado: bundle do painel de 252 KB para 180 KB gzip.
- Próximo passo: conectar o Power BI correto da MCD para a série de faturamento de MCD MS.
- Bloqueio: o repositório está público e serve `app/data/power-bi-revenue.json` a
  qualquer pessoa; o site publicado também abre sem autenticação. O recorte acima
  reduziu o que vaza, mas o faturamento das lojas de MS continua exposto nos dois.
