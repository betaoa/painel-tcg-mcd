# MS Intelligence

Dashboard operacional da equipe de promotores em Mato Grosso do Sul.

## O que o painel entrega

- Mapa 3D de Mato Grosso do Sul com marcadores de cidades atendidas.
- Sell-out mensal e média de 90 dias, sem duplicar lojas que aparecem em mais de um dia do roteiro.
- Resumo por promotor, cidade, rede, visitas, lojas e frequência.
- Ranking de cidades e evolução mensal.
- Filtros combinados e busca por promotor, cidade, loja, rede ou CNPJ.
- Detalhe do roteiro de cada promotor.
- Importação direta de arquivos Excel com a mesma estrutura da planilha original.
- Persistência local da última planilha importada no navegador.

## Privacidade

O painel lê somente os campos operacionais necessários. Ele não incorpora CPF, RG, telefone, e-mail, endereço residencial, IMEI, dados de uniforme, férias ou outras informações de RH.

## Estrutura esperada do Excel

A aba `Roteiro` precisa ter estas colunas:

- Promotor
- Cidade
- Dia da Visita
- CNPJ
- Nome Fantasia ou Razão Social
- Abril
- Maio
- Junho
- Média

A aba opcional `Lojas 2026` associa CNPJ e Rede.

## Cálculos

- Sell-out: soma por CNPJ único no filtro atual.
- Visitas: quantidade de linhas do roteiro.
- Frequência: visitas divididas por lojas únicas.
- Redes: quantidade de redes únicas.
- Cobertura: cidades únicas divididas pelos 79 municípios de MS.

## Desenvolvimento

```bash
npm run install:ci
npm run dev
```

## Build

```bash
npm run build
```

O projeto usa Vinext, React, TypeScript, Recharts, SheetJS e os componentes de interface incluídos no starter.
