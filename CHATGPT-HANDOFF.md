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

## Próxima pendência
Conectar o Power BI correto da MCD para atualizar a série de faturamento de MCD MS.
