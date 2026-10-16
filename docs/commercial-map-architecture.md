# Arquitetura de apresentação — etapa 2

`architecture.ts` deriva a construção dos footprints de `territory.ts`. Não altera polígonos, âncoras, acessos, grupos de lotes, áreas declaradas ou identidade comercial. Não existe conversão do desenho esquemático para metros: alturas e detalhes descritos aqui são hipóteses visuais, não levantamento arquitetônico.

## Referências e limites

Foram consultados, somente para leitura, `commercialPavilions.ts` e `CommercialPavilion.tsx` do checkout local FenaSoja. A lógica útil é a separação de piso, paredes, estrutura e cobertura, o uso de materiais compartilhados e uma família de perfis de cobertura. Nenhuma coordenada, orientação `facingRadians`, dependência React Three Fiber, atividade comercial, estande, empresa ou fonte de dados FenaSoja foi importada.

Os PDFs territoriais anteriormente conferidos documentam implantação e projeções relativas dos acessos, mas não certificam elevações ou os perfis das coberturas. As duas capturas fornecidas nesta etapa mostram a maquete anterior; não são referência fotográfica das fachadas reais. Portanto todos os seis perfis abaixo são aproximações plausíveis de apresentação. Não são declarados como reprodução fiel dos edifícios existentes.

| Entidade Indumóveis     | Registro arquitetônico consultado | Cobertura estimada                                                            |
| ----------------------- | --------------------------------- | ----------------------------------------------------------------------------- |
| Pavilhão 1 / Mostra     | B1                                | Duas águas amplas, cumeeira longitudinal                                      |
| Pavilhão 14 / SINDUSCOM | B2                                | Duas coberturas de duas águas, cumeeiras deslocadas e alturas distintas       |
| Pavilhão 12             | B3                                | Três sheds com faces verticais escuras; recorte acompanha o footprint oblíquo |
| Pavilhão 8              | B4                                | Monitor central elevado, com clerestório simplificado                         |
| Pavilhão 13             | B5                                | Duas águas assimétricas                                                       |
| Pavilhão 3              | B6                                | Três módulos de duas águas                                                    |

## Proporções e encaixe

O eixo local deriva da primeira aresta de cada footprint Indumóveis. As coordenadas locais são transformadas uma única vez para o mundo. A largura do vão é a menor dimensão local; cada painel de cobertura é recortado contra o polígono original, inclusive o leve paralelogramo de P12. Não há beiral exterior: isso evita invasão entre 8, 13 e 3 e preserva integralmente os corredores.

As alturas territoriais históricas servem como altura de parede estimada, sem regravá-las no cadastro. A elevação do telhado é 11% do vão nos pavilhões e 16% no monitor de P8; nos apoios é 8,5%. A espessura da borda da cobertura é 1,3% do vão, a espessura visual de parede é 1,4%, e a base é 9,5% da altura estimada de parede. Esses percentuais são da representação esquemática, sem unidade métrica. O consumidor recebe bounds visuais separados e a altura real máxima da geometria de apresentação.

Paredes têm superfície externa, interna e espessura. As âncoras existentes são projetadas na aresta mais próxima apenas para recortar a apresentação: o dado oficial permanece intocado. Portas usam abertura de 15% do vão, limitada a 28% da aresta, altura de 72% da parede, jambas e fundo escuro recuado em 1,8 espessura de parede. P14, que não tem acesso confirmado nesta fonte, não ganha uma porta inventada. Painéis claros alternam discretamente e pilares finos recuam para dentro do perímetro. A inspeção esconde a cobertura com seus fechamentos superiores e mantém piso, paredes, recessos e estrutura. Não monta interiores, estandes ou expositores fictícios.

## Apoios e áreas abertas

B7 (`indumoveis:support:b7`) recebe volume simples com duas águas; os dois anexos menores recebem uma água. A hierarquia usa a altura estimada que já existia e seus footprints separados. O código B7 não foi associado a pavilhão 7, empresa, sanitário ou administração.

Café, bar e restaurante recebem volumes simples estimados a partir das áreas de apoio identificadas. Seus perfis não certificam cobertura real; são apresentação plausível de edifício de apoio. Espaço de eventos e Mão na Massa permanecem áreas abertas de consulta: nome e `height` isolado não comprovam edificação coberta. Portão 03 conserva sua marcação de acesso no piso; não recebe extrusão de seta, bloco ou pórtico. Não há duas superfícies selecionáveis para um apoio volumétrico: o renderer deve excluir esses footprints do antigo preenchimento plano.

## Materiais, seleção e orçamento — direção de arte

`surfaceMaterials.ts` contém a biblioteca PBR local compartilhada: parede pintada off-white frio/quente equilibrado, concreto mineral claro, asfalto grafite azulado seco, pintura branca, chapa pintada prateada, metal exposto, vidro simplificado e acabamento taupe quente. A superfície arquitetônica não compartilha indiscriminadamente o mesmo material. A chapa tem metalness 0,14 e reflexão larga; somente os pequenos arremates de metal exposto usam metalness 0,72. Vidro opaco de apresentação recebe reflexão controlada sem transmissão, refração ou passe adicional. Os limiares de acessos existentes recebem taupe; isso não documenta madeira nem um revestimento histórico real.

As cores antigas de vértices foram neutralizadas: agora só modulam luminosidade e pequenas variações frias, enquanto a biblioteca define o albedo sem multiplicação pelo bege anterior. Os painéis, pilares e embasamentos existentes conservam sua profundidade; o fundo recuado dos acessos tem material de vidro estimado e um pequeno arremate superior de metal, inteiramente contido no recesso. P14 continua sem abertura inventada. Os sheds/monitor reutilizam o vidro nas faces verticais já modeladas. As fachadas superiores pertencem à família de parede, não à chapa do telhado, e acompanham a ocultação individual da cobertura.

Toda face recebe UVs calculadas no referencial local antes da colocação no parque. Paredes usam projeção dominante por plano e escala compartilhada. A cobertura usa U longitudinal à cumeeira e V ao longo da água, com correção pelo comprimento inclinado. Os veios da chapa descem para a borda; não são centenas de ondulações geométricas. Quatro mapas determinísticos de 128 × 128 RGBA8 atendem todos os edifícios e a pavimentação: albedo mineral e chapa em sRGB, dados de relevo/rugosidade sem conversão de cor. Todos têm mipmaps, repetição e filtragem trilinear; o relevo diminui suavemente entre 35 e 150 unidades de distância de apresentação para evitar cintilação. A biblioteca não depende de arquivo remoto ou canvas por edifício.

Os mapas são opcionais. `createSurfaceMaterials({ maps: false })` mantém as mesmas famílias com albedo, rugosidade e metalness locais, sem texturas residentes. Falha na preparação dos mapas descarta a coleção parcial e usa esse mesmo fallback de cor/material; não deixa uma superfície preta nem bloqueia o primeiro frame. Como a biblioteca é compartilhada com arquitetura, os meshes de pavimento também fornecem atributo de cor neutra explícito: a ausência desse atributo em Standard com `vertexColors` ativo pode zerar o albedo no WebGL.

O conjunto completo possui **32 meshes/draws de arquitetura**, contra 15 da etapa anterior, para distinguir os materiais e conservar coberturas individualmente inspecionáveis. Piso, parede, estrutura, vidro de acesso, arremate e soleira permanecem agrupados por família. A forma, os materiais e a identificação são mantidos no Leve; esse perfil remove a contribuição opcional do ambiente e reduz o relevo, sem ocultar lotes. Os quatro mapas compartilhados consomem **349.528 bytes estimados**, incluindo RGBA8 e a cadeia completa de mipmaps, contados uma vez pelo renderer. Ambiente/PMREM, atlas, buffers e alvos de renderização são contabilizados separadamente pelo renderer completo.

O picking mantém o volume simples independente com footprint exato e faces laterais, sem selecionar decoração ou beiral vizinho. Bounds visuais incluem a cumeeira e são destinados a câmera, label e seleção; não ampliam a geometria comercial. O contato permanece contido no footprint; nenhum detalhe altera implantação, alturas aprovadas ou acessos.

O builder é estático e não reconstrói geometrias durante gestos. `buildArchitecture(entities, surfaces)` e `createPavement(entities, surfaces)` usam uma biblioteca pertencente ao renderer; os builders descartam suas geometrias e o renderer descarta materiais e texturas compartilhados uma única vez. Na chamada isolada, cada builder assume a propriedade de sua biblioteca. Os testes verificam os footprints e recortes anteriores, profundidade e picking de acessos, separação semântica, UVs finitas, orçamento de recursos, qualidade sem recriação e descarte com dono único. Aparência, reflexos e desempenho ainda dependem da validação do frame completo.
