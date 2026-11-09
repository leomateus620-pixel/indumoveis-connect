O **Pavilhão 13 · Salão de Imóveis** agora oferece **Acesso Interno** na ficha do parque. A rota autenticada `/mapa/pavilhoes/13/interior` abre uma planta SVG 2D com 80 lotes selecionáveis, busca por número, seleção em `?lote=63` e consulta em painel esquerdo. O retorno conserva câmera, seleção e filtros do parque; o histórico também permanece correto ao alternar entre P1 e P13. O renderer externo é desmontado durante a inspeção.

O cabeçalho apresenta uma única assinatura horizontal **Salão de / IMÓVEIS**, alinhada à esquerda. O botão compacto **Voltar ao parque** exibe a dica **Visualização externa** ao passar o mouse ou receber foco. As placas verticais levam ao **Pavilhão 3** pela esquerda e ao **Pavilhão 8** pela direita, com o destino selecionado no mapa externo. Os marcadores consultam o registro de rotas para abrir o interior do destino quando houver uma rota cadastrada.

A planta mantém a organização documental: direita 29–15 / 14–01, centro contínuo 51–30 e esquerda 52–66 / 67–80. Os blocos agregados foram separados em 80 módulos visuais de largura e altura iguais, preservando as passagens laterais. As áreas individuais são nulas e não aparecem no painel. Empresas e rótulos comerciais do PDF não foram importados.

A implementação reutiliza o domínio revisionado de `floor_plans`, os componentes 2D e as consultas centralizadas em `src/lib/api.ts`. O Salão de Imóveis tem geometria, identidade visual e contexto próprios; a Mostra ARQ & Design continua no Pavilhão 1. Situação comercial permanece derivada de `space_status_v`, sujeita às permissões existentes.

As **três migrações foram aplicadas diretamente pelo conector Lovable no banco existente de Indumóveis Connect**, registradas no histórico e verificadas. A revisão 2 é corrente e a inicial permanece imutável. Há 80 identidades e vínculos comerciais, sem duplicação; a carga preserva registros já existentes. O payload e as contagens de P1 permaneceram iguais.

## Validação

O PDF fonte foi extraído, renderizado e preservado no repositório. Os testes verificam códigos, grupos, módulos uniformes, continuidade, ausência de sobreposição, áreas nulas, seleção, busca, navegação, ligações laterais, parâmetros da URL e retorno ao parque. A API tem cobertura de identidade, cache e permissões. Doze verificações SQL no banco passaram, incluindo acesso por perfil, edição, pavilhão, imutabilidade e preservação de P1. As migrações foram reexecutadas em uma transação revertida e a contagem de lotes permaneceu em 80.

Passaram o build de produção, TypeScript, ESLint dos arquivos alterados e **579 testes em 86 arquivos**. A interface foi revisada em 1440 × 900, 1366 × 768, 834 × 1112, 390 × 844 e 378 × 465. Foram exercitados arraste, zoom, seleção, recarga de links diretos, entrada e retorno ao parque. As ligações esquerda e direita abriram as fichas externas dos respectivos destinos. O acabamento apresenta os acessos P3 e P8 em placas verticais estreitas nos vãos laterais. [Capturas e comparações](https://github.com/leomateus620-pixel/indumoveis-connect/tree/codex/pavilhao-13-interior/docs/validation/pavilion-13).

- [Relatório de implementação](https://github.com/leomateus620-pixel/indumoveis-connect/blob/codex/pavilhao-13-interior/docs/pavilion-interior/pavilion13-implementation.md)
- [Geometria e fonte documental](https://github.com/leomateus620-pixel/indumoveis-connect/blob/codex/pavilhao-13-interior/docs/pavilion-interior/pavilion13-geometry.md)
- [Banco aplicado e verificações](https://github.com/leomateus620-pixel/indumoveis-connect/blob/codex/pavilhao-13-interior/docs/pavilion-13/database.md)
- [Comprovação estruturada](https://github.com/leomateus620-pixel/indumoveis-connect/blob/codex/pavilhao-13-interior/docs/validation/pavilion-13/database-application.json)
- [Identidade visual](https://github.com/leomateus620-pixel/indumoveis-connect/blob/codex/pavilhao-13-interior/docs/salao-imoveis-identity.md)

## Pendências e limites

As dimensões dos módulos são esquemáticas e as metragens individuais permanecem nulas. O PDF está preservado no repositório. O quadro interativo Creative Production estava indisponível. A revisão visual usou uma sessão controlada, com verificação independente de permissões e leitura autenticada no banco real. O P13 ainda não tinha expositor real para conferir em produção. A pinça e a seleção por toque passaram no Chrome com toque emulado. A validação em aparelho físico ficou fora da rodada.
