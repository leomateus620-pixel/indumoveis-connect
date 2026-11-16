# Validação do Pavilhão 3

Fixtures isoladas no navegador, sem sessões nem gravações de produção. Banco real
verificado via conector Lovable; resultados em [database.json](database.json).

| Estado                   | Desktop                             | Celular emulado                   |
| ------------------------ | ----------------------------------- | --------------------------------- |
| Planta completa          | [1440 px](overview-1440.png)        | [390 px](overview-390.png)        |
| Lote 104 e preços        | [1440 px](lot104-1440.png)          | [390 px](lot104-390.png)          |
| Localização do lote 142  | [1440 px](located142-1440.png)      | [390 px](located142-390.png)      |
| Venda dos lotes 39 e 104 | [1440 px](individual-sale-1440.png) | [390 px](individual-sale-390.png) |

[Relatório automatizado](report.json). Para repetir, iniciar o Vite e executar
`MAP_BASE_URL=http://127.0.0.1:4173 MAP_ARTIFACT_DIR=docs/validation/pavilion-3 node scripts/pavilion-3-validation.mjs`.
