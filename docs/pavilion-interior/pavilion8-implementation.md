# Pavilhão 8 · Fornecedores e Construção Civil

A ficha do Pavilhão 8 oferece **Acesso Interno** para a planta 2D autenticada em `/mapa/pavilhoes/8/interior`. A rota compartilha o motor SVG, o painel, o enquadramento e as consultas dos Pavilhões 1 e 13. O desenvolvimento usa a branch da PR #15 como base enquanto ela está em revisão. [PR do Pavilhão 13](https://github.com/leomateus620-pixel/indumoveis-connect/pull/15).

## Planta e navegação

Os lotes **01, 03, 04, 05, 06, 07 e 08** têm identidade e contorno próprios. As diagonais de 01 e 07 acompanham a aproximação à entrada. O 08 é a ilha trapezoidal que se alarga junto à entrada. O 06 permanece um lote longitudinal único. O desenho mantém os vãos laterais em alturas diferentes, a circulação central e a saída nos fundos acima do 05. [Geometria, proveniência e comparação](pavilion8-geometry.md).

O enquadramento inicial mostra a planta inteira com a entrada embaixo. Arraste, roda ancorada no cursor, pinça, teclado e controles de zoom atuam sobre o mesmo grupo SVG. O painel esquerdo apresenta lote, pavilhão, setor e dados comerciais permitidos. O controle de fechar limpa a seleção e conserva a câmera. O cabeçalho fixo identifica **Pavilhão 8** e apresenta em texto a área total de **937,32 m²**. A assinatura **Fornecedores & Construção Civil** usa contornos vetoriais da fonte Figtree e grafismo de fiadas. [Identidade visual](../fornecedores-construcao-identity.md).

A rota aceita links como `/mapa/pavilhoes/8/interior?lote=07`. A validação admite somente os sete códigos documentados. O botão **Voltar ao parque** restaura a câmera, a seleção e os filtros salvos ao entrar pela ficha. A entrada por URL usa o enquadramento do Pavilhão 8 como referência de retorno.

## Conexões e sinalização

- No Pavilhão 8, a placa junto à abertura lateral entre 01 e 03 abre diretamente o interior do Pavilhão 13.
- No Pavilhão 8, a placa junto à abertura lateral entre 05 e 06 abre a ficha externa do Pavilhão 12. O registro de rotas permite ativar a navegação interna quando o Pavilhão 12 tiver planta própria.
- No Pavilhão 13, o marcador da passagem direita abre diretamente o interior do Pavilhão 8.

As placas laterais do Pavilhão 8 têm 62 × 68 pontos de desenho e ficam junto às aberturas, com o centro do vão livre. Os acessos compartilham uma linguagem entre os Pavilhões 1, 8 e 13. Entradas recebem tom verde-azulado, saídas recebem terracota e acessos de serviço recebem taupe. Os rótulos acompanham a sinalização. No Pavilhão 13, a indicação **Fundos** mantém a identificação dada pelo PDF. [Detalhe das ligações laterais](../validation/pavilion-8/lateral-connections.jpg).

## Banco aplicado e verificações

O conector Lovable aplicou `20261109002500_pavilion_8_plan_scope.sql` e `20261109002600_pavilion_8_fornecedores_seed.sql` no banco existente de **Indumóveis Connect**, edição ativa **Indumóveis 2027**. Cada migração foi registrada no histórico na mesma transação da aplicação. A revisão publicada contém **sete polígonos válidos**, **seis elementos arquitetônicos** e a área total de **937,32 m²**. A leitura autenticada da geometria corresponde ao fixture canônico. [Comprovação estruturada](../validation/pavilion-8/database-application.json).

A inspeção de estoque encontrou zero registros do Pavilhão 8 antes da carga. O seed criou sete vínculos comerciais com códigos no escopo `P8` e áreas individuais nulas. Uma verificação em transação revertida confirmou o reaproveitamento de estoque legado compatível, a preservação de seus campos e a ausência de vínculo para um 02 legado sem geometria. As situações comerciais provêm de `space_status_v`. O banco confirmou acesso por perfil, isolamento entre edições e pavilhões, imutabilidade da revisão e idempotência da carga. Os hashes das plantas dos Pavilhões 1 e 13 permaneceram iguais.

## Validação de interface

A comparação do PDF e do SVG usa a mesma orientação, escala e janela de recorte. Os testes geométricos conferem os sete códigos, a forma da ilha 08, as aberturas e pontos de ambos os lados das diagonais de 01, 07 e 08. No navegador, foram exercitados a seleção junto a esses contornos, o acesso direto com recarga, a entrada pela ficha, o histórico do navegador, a ida do Pavilhão 13 ao 8 e o retorno. O teste de roda, arraste e fechamento do painel confirmou a conservação da câmera. A regressão do Pavilhão 1 verificou a área do espaço 12.

A suíte completa passou com **590 testes em 87 arquivos**, além de build, TypeScript e lint dos arquivos alterados. A prévia foi revisada em desktop (1440 × 900), tablet (834 × 1112) e celular (390 × 844). As ligações abriram o interior do Pavilhão 13 e a ficha do Pavilhão 12, com retorno ao lote 08 pelo histórico. A sinalização foi conferida nos três interiores. No celular, o lote 07 ficou inteiro entre o painel e a borda e acima dos controles. [Comparação com a captura da aplicação](../validation/pavilion-8/application-comparison.jpg).

- [Visão geral em desktop](../validation/pavilion-8/desktop-overview.jpg)
- [Detalhe dos lotes junto à entrada](../validation/pavilion-8/desktop-entrance.jpg)
- [Lote 07 com painel em desktop](../validation/pavilion-8/desktop-lot-07.jpg)
- [Visão geral em tablet](../validation/pavilion-8/tablet-overview.jpg)
- [Visão geral em celular](../validation/pavilion-8/mobile-overview.jpg)
- [Lote 07 com painel em celular](../validation/pavilion-8/mobile-lot-07.jpg)

## Pendências e limites

O código **02** está ausente no PDF e a inspeção do banco não encontrou estoque correspondente do Pavilhão 8 na edição ativa. As metragens individuais permanecem sem fonte validada. O total apresentado pertence ao pavilhão e a referência também contém áreas de circulação. Os nomes de empresas da fonte foram tratados como material documental, sem importação para o estoque ou para a interface.

A revisão visual usa sessão e respostas de API controladas. A pinça foi verificada com dois ponteiros no teste do componente compartilhado. O navegador integrado não oferece emulação de toque por esse canal e não houve ensaio em aparelho físico. Os registros, permissões e leitura autenticada foram verificados separadamente no banco real. O quadro interativo do Creative Production estava indisponível na sessão. [Identidade visual](../fornecedores-construcao-identity.md).
