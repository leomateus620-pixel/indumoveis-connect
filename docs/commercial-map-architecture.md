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

## Materiais, seleção e orçamento

Uma família Lambert com cores de vértices compartilhada atende piso/contato, parede, estrutura e cobertura. Tons de chapa variam por plano e fachadas usam neutros com embasamento taupe/ameixa; não existem ondulações geométricas de telha, transmissão, reflexão em tempo real, shader copiado, textura adicional ou luz por edifício. O contato é uma camada contida no footprint, com embasamento elevado, sem sombra projetada sobre lotes.

Piso/contato, paredes e estrutura são mesclados em três meshes para os doze edifícios; cada cobertura usa um mesh próprio para ocultação individual. São **15 draws de arquitetura** no conjunto completo, sem variar conforme o perfil. A forma essencial permanece no Leve. O picking usa um volume simples independente com footprint exato e faces laterais, sem selecionar decoração ou beiral vizinho. Bounds visuais incluem a cumeeira e são destinados a câmera, label e seleção; não ampliam a geometria comercial.

O builder é estático e não reconstrói geometrias durante gestos. `dispose()` descarta todas as geometrias, o material compartilhado e o material de picking. Os testes verificam conservação da entrada, recorte dos telhados, limites de complexidade, consulta por fachada e profundidade de um acesso existente; desempenho e aparência dependem também da validação no renderer completo.
