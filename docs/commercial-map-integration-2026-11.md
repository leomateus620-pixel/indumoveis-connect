# Parque integrado, materiais e navegação — revisão de 02–03/11/2026

A implantação passa a usar as mesmas quadras físicas do parque, registradas pela planta A2, com os 59 envelopes e 70 números comerciais Indumóveis preservados. A ampliação anterior por setores afastados foi substituída por uma rede física contínua. A [conferência territorial](validation/park-registration-2026-11-02/park-correspondence.md) contém a correspondência das 22 quadras e 37 peças, o inventário de 32 estruturas/11 portões, larguras, frentes, resíduos e percursos verificados. A [prévia técnica](validation/park-registration-2026-11-02/park-technical.webp) e o SVG incluem os caminhos apoiados na implantação, sem raster ou parcelamento comercial FENASOJA.

Os 73 acessos examinados alcançam o eixo do núcleo comercial. A demonstração abrange cada peça física, os seis pavilhões, os equipamentos e os portões. Portão 2 tem conexão pedonal; os outros dez também alcançam a rede geométrica de veículos. Isso descreve continuidade física na planta, sem afirmar autorização operacional de tráfego, cotas ou funcionamento de portões em campo.

## Acabamento construído

P1, P14, P12, P8, P13 e P3 possuem frente, entradas e cumeeira explícitas no mundo da cena, independentes da ordem dos vértices. O recorte acompanha os contornos físicos A2, incluindo anexos, concavidades e as interfaces P8–P13–P3. Portais recuados, soleiras, pilares, vãos, montantes, peitoris e arremates de cumeeira preservam a identificação de cada edifício. Bounds e proxies acompanham a apresentação; os lotes não foram girados ou deformados.

O perímetro dos apoios e pavilhões rurais recebe fechamentos verticais nas próprias arestas, inclusive recortes reentrantes. Apenas recortar uma caixa deixava paredes ausentes nessas bordas. A revisão corrigiu a normal de uma água do Palco e atribuiu a junção Sede/Palco a uma única borda compartilhada. A prova geométrica não encontrou interseção positiva entre os 32 footprints ou entre eles e os lotes. Receitas arquitetônicas e alturas permanecem interpretativas nas faces não documentadas.

A grama combina campo orgânico amplo e contínuo no mundo com detalhe fino filtrado do atlas. Duas leituras rotacionadas removem a repetição curta; os vetores dos mapas normais retornam à base tangente correta. Quadras não recebem cores diferentes pelo seu identificador. Lâminas geométricas mais baixas aparecem apenas na aproximação e diminuem progressivamente; bordas, estados e números permanecem acima delas.

Troncos têm resposta difusa e casca com detalhe longitudinal filtrado por derivadas de tela. As copas distantes têm mais volume e normais suaves; três variantes determinísticas compartilham geometrias, atlas e instâncias. O LOD possui histerese, orçamento de folhas e buffer reutilizado durante navegação. Maciços, corredores e clareiras continuam definidos pela evidência espacial. A geração dos centros suplementares foi adiada para a etapa ociosa de contexto; o enquadramento inicial usa os envelopes dos maciços.

Asfalto e concreto recebem variação suave de tom com a mesma escala de mundo, além dos mapas minerais compartilhados. Chapa, metal, alvenaria, vidro e pintura conservam propriedades distintas. As juntas estimadas da alvenaria de P12 desaparecem abaixo da resolução útil, evitando moiré. As normais, cores sRGB/dados lineares, iluminação e ambiente filtrado compartilhado permanecem no único renderer. Não foram acrescentadas capturas de reflexão por edifício ou por frame, emissão para clarear fachadas ou texturas grandes por objeto.

Equipamentos complementares recebem uma projeção estática de contato na mesma direção solar do núcleo: um batch, zero texturas adicionais e recorte dos lotes. A projeção parte dos triângulos dos contornos côncavos e não preenche pátios com um casco convexo global. O ensaio mediu 48,46 ms de preparação, 1.223 triângulos e nenhuma sobreposição com as projeções do núcleo. Ela não representa autossombreamento das coberturas; o perfil Detalhado mantém o mapa solar do núcleo e o contato estático do contexto.

As curvas raster das ruas receberam simplificação de apresentação limitada a 0,75 ponto A2, abaixo de um pixel da extração. São 3.040 → 2.287 vértices, com desvio máximo medido de 0,193130 unidade de desenho. Os três polígonos e seus 39 furos continuam válidos. A fonte bruta, os contornos vetoriais dos edifícios/quadras e o cadastro comercial permanecem separados dessa filtragem. Setas e tracejados internos são retirados por classe física; a sinalização pública externa continua presente. O fallback SVG preserva também as duas avenidas externas, mantendo transparentes somente os proxies das ruas internas substituídas pela rede A2.

## Capturas reais comparáveis

Os PNGs do canvas foram recodificados em WebP qualidade 90, sem redimensionamento, retoque ou geração de imagem. O [manifesto](validation/commercial-map-integration/comparison.json) guarda hashes dos PNGs de origem e das imagens entregues, posições/alvos solicitados e realizados. As 26 poses de cada revisão coincidem; canvas CSS 1.520 × 880, perfil Leve e mesmo buffer. Os relatórios completos estão nos arquivos JSON comprimidos do mesmo diretório.

| Conjunto                     | Antes                                                                                                                                                        | Depois                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Parque superior              | [vista](validation/commercial-map-integration/before/park-superior.webp)                                                                                     | [vista](validation/commercial-map-integration/after/park-superior.webp)                                                                                    |
| Parque oblíquo               | [vista](validation/commercial-map-integration/before/park-oblique.webp)                                                                                      | [vista](validation/commercial-map-integration/after/park-oblique.webp)                                                                                     |
| Fachadas internas            | [vista](validation/commercial-map-integration/before/park-close.webp)                                                                                        | [vista](validation/commercial-map-integration/after/park-close.webp)                                                                                       |
| Fundos / avenida             | [vista](validation/commercial-map-integration/before/park-reverse.webp)                                                                                      | [vista](validation/commercial-map-integration/after/park-reverse.webp)                                                                                     |
| Exporural                    | [vista](validation/commercial-map-integration/before/park-rural.webp)                                                                                        | [vista](validation/commercial-map-integration/after/park-rural.webp)                                                                                       |
| Mirante / Arena              | [vista](validation/commercial-map-integration/before/park-arena.webp)                                                                                        | [vista](validation/commercial-map-integration/after/park-arena.webp)                                                                                       |
| P1 frente / fundo            | [frente](validation/commercial-map-integration/before/p1-front.webp), [fundo](validation/commercial-map-integration/before/p1-rear.webp)                     | [frente](validation/commercial-map-integration/after/p1-front.webp), [fundo](validation/commercial-map-integration/after/p1-rear.webp)                     |
| P14 frente / fundo           | [frente](validation/commercial-map-integration/before/p14-front.webp), [fundo](validation/commercial-map-integration/before/p14-rear.webp)                   | [frente](validation/commercial-map-integration/after/p14-front.webp), [fundo](validation/commercial-map-integration/after/p14-rear.webp)                   |
| P12 frente / fundo           | [frente](validation/commercial-map-integration/before/p12-front.webp), [fundo](validation/commercial-map-integration/before/p12-rear.webp)                   | [frente](validation/commercial-map-integration/after/p12-front.webp), [fundo](validation/commercial-map-integration/after/p12-rear.webp)                   |
| P8 frente / fundo            | [frente](validation/commercial-map-integration/before/p8-front.webp), [fundo](validation/commercial-map-integration/before/p8-rear.webp)                     | [frente](validation/commercial-map-integration/after/p8-front.webp), [fundo](validation/commercial-map-integration/after/p8-rear.webp)                     |
| P13 frente / fundo           | [frente](validation/commercial-map-integration/before/p13-front.webp), [fundo](validation/commercial-map-integration/before/p13-rear.webp)                   | [frente](validation/commercial-map-integration/after/p13-front.webp), [fundo](validation/commercial-map-integration/after/p13-rear.webp)                   |
| P3 frente / fundo            | [frente](validation/commercial-map-integration/before/p3-front.webp), [fundo](validation/commercial-map-integration/before/p3-rear.webp)                     | [frente](validation/commercial-map-integration/after/p3-front.webp), [fundo](validation/commercial-map-integration/after/p3-rear.webp)                     |
| Grama dos lotes              | [vista](validation/commercial-map-integration/before/lot-grass.webp)                                                                                         | [vista](validation/commercial-map-integration/after/lot-grass.webp)                                                                                        |
| Outros gramados              | [vista](validation/commercial-map-integration/before/park-grass.webp)                                                                                        | [vista](validation/commercial-map-integration/after/park-grass.webp)                                                                                       |
| Árvores próximas / distantes | [próximas](validation/commercial-map-integration/before/trees-near.webp), [distantes](validation/commercial-map-integration/before/trees-far.webp)           | [próximas](validation/commercial-map-integration/after/trees-near.webp), [distantes](validation/commercial-map-integration/after/trees-far.webp)           |
| Asfalto interno / externo    | [interno](validation/commercial-map-integration/before/asphalt-internal.webp), [externo](validation/commercial-map-integration/before/asphalt-external.webp) | [interno](validation/commercial-map-integration/after/asphalt-internal.webp), [externo](validation/commercial-map-integration/after/asphalt-external.webp) |

## Medição no equipamento local

Antes: build de `f0d565096c07523dd209db288f764cfeda7b32b7`. Depois: árvore implementada nesta PR. Windows 10.0.26200, i5-1035G1, 8 GB, Intel UHD via ANGLE/D3D11, Chromium 153.0.8010.12. Viewport 1.600 × 1.000; canvas CSS fixo 1.520 × 880; DPR efetivo **0,8646430798**; buffer **1.314 × 760** em ambos. Cache HTTP desabilitado pelo roteamento do laboratório; dados locais interceptados, sem escrita ou sessão de produção. Não são medições de celular físico.

| Medida                                   |      Antes |     Depois |
| ---------------------------------------- | ---------: | ---------: |
| Mediana dos intervalos durante navegação |    16,7 ms |    16,7 ms |
| p95                                      |    16,8 ms |    16,7 ms |
| Intervalos acima de 200 ms               |          0 |          0 |
| Draw calls na pose medida                |        132 |        135 |
| Triângulos                               |     90.490 |    222.971 |
| Geometrias residentes                    |        119 |        116 |
| Texturas residentes                      |         12 |         12 |
| Programas preparados                     |         22 |         29 |
| Bytes de texturas estimados              | 11.272.306 | 12.320.882 |
| Perdas de contexto                       |          0 |          0 |
| Abertura útil, observação única          |   1.558 ms |   2.860 ms |
| Primeiro 3D, observação única            |   1.817 ms |   3.783 ms |

A abertura a frio ficou mais cara com o parque completo e os novos materiais; os valores acima não são uma distribuição de inicialização nem uma melhoria de latência. O núcleo aparece progressivamente e os recursos de contexto entram depois. A cadência mediana corresponde a aproximadamente 60 FPS nos frames de navegação submetidos, sem garantir 60 FPS contínuos, tempo de entrada até o monitor ou outro hardware. Não se ocultaram as estruturas exigidas para reduzir os números. O roteiro alterna os mesmos deslocamentos orbitais; usa o modo Girar da versão antiga e o botão direito da versão nova para conservar a função do gesto.

Três reaberturas SPA, após aquecer as mesmas poses/LODs, conservaram **107 geometrias, 11 texturas e 12.320.882 bytes**, com **um contexto WebGL ativo**. Esses valores de reapresentação não são os máximos da pose de medição acima. A primeira comparação sem aquecimento foi descartada porque comparava buffers apenas do núcleo com buffers do contexto já desenhado.

## Verificação e reprodução

O [registro de navegação](commercial-map-navigation-2026-11.md) demonstra clique/arrasto, roda com um único zoom, A → B → fechar, Escape, cancelamento por gesto e layouts de toque simulados 390 × 844 / 844 × 390. A assinatura [comercial protegida](validation/commercial-map-integration/commercial-protection.json) permaneceu idêntica. A auditoria geométrica e os testes de superfície incluem interseções reais, curvas, largura útil, ausência de pintura interna, manutenção externa, recortes e descarte dos recursos.

Resultado final: **408 testes em 67 arquivos**, tipos, ESLint do escopo e build aprovados. O orçamento de 30 segundos por teste e um worker foi usado para os ensaios de geometria no equipamento de 8 GB; tentativas concorrentes com o timeout padrão de cinco segundos haviam expirado. O lint usa `endOfLine: auto` para respeitar os arquivos CRLF preexistentes no Windows. Não foi feita uma limpeza global de formatação fora do escopo.

```powershell
npm test -- --maxWorkers=1 --testTimeout=30000
npx tsc --noEmit
npx eslint src/features/commercial-map scripts/commercial-map-*.mjs scripts/commercial-map-park-audit.ts --rule 'prettier/prettier: [error, {endOfLine: auto}]'
npm run build
node scripts/serve-commercial-map-build.mjs 4217 .output
```

Os scripts `commercial-map-realism-validation.mjs` aceitam `MAP_PARK_REGISTRATION_ONLY=1` e `MAP_PARK_MATERIALS_ONLY=1`, além de `MAP_BASE_URL`, `MAP_ARTIFACT_DIR` e `MAP_REALISM_PHASE`. `commercial-map-navigation-validation.mjs` executa os nove fluxos de interação com as mesmas fixtures locais. O exportador técnico utiliza `--connectivity`; sua variante com A2 permanece privada, sem virar textura do produto.

Permanecem limitados pela evidência: correspondência individual de Café/Bar/Restaurante dentro de C2/C3, alturas e detalhes arquitetônicos não fotografados, cotas/rampas/cercamentos operacionais, aparelhos móveis e trackpad físicos. Resíduos gráficos das bordas de 57/69/70 estão registrados e não foram escondidos movendo os lotes. A PR e a validação local não demonstram publicação do Lovable ou ativação em produção.
