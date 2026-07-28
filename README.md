# Observatório de Receitas Públicas

Painel executivo para organizar o histórico de transferências de Vargem Grande do Sul e simular cenários para a LOA 2027.

## Executar

```powershell
npm.cmd install
npm.cmd run dev
```

Abra `http://localhost:5173`.

## Atualizar os dados

Mantenha os arquivos-fonte na raiz do projeto com os nomes atuais e execute:

```powershell
npm.cmd run data
```

O gerador classifica as receitas por origem e natureza, considera as deduções do Fundeb e atualiza `public/data/revenues.json`.

## Premissas importantes

- Os CSVs de 2023, 2024 e 2025 têm detalhamento mensal.
- O PDF de 2026 contém valores acumulados até junho. O painel anualiza esses valores usando a sazonalidade média de 2023–2025.
- O ano de 2022 é exibido como indisponível porque nenhum arquivo-fonte foi fornecido.
- As taxas dos cenários são editáveis diretamente na tela.
