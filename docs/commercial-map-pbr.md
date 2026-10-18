# Materiais físicos e atlas comprimido

## Auditoria e referências

Os anexos foram identificados pelo conteúdo, sem usar sua ordem como fonte de coordenadas:

- `Imagem do ChatGPT 17 de out. de 2026, 21_33_43.jpg`: estado atual do mapa, com terreno contínuo e materiais ainda muito uniformes.
- `Imagem do ChatGPT 17 de out. de 2026, 21_33_46.jpg`: comparação do terreno antes/depois, preservando a implantação e o enquadramento.
- `Imagem do ChatGPT 17 de out. de 2026, 21_33_48.jpg`: referência aérea interna, com telhas claras corrugadas, concreto nos acessos, passeios avermelhados, asfalto e gramado. Orienta a leitura dos materiais; não substitui os polígonos cadastrais ou confirma novas áreas.
- `Imagem do ChatGPT 17 de out. de 2026, 21_33_52.jpg`: contexto urbano com telhados claros, vias e vegetação. Não é uma autorização para inventar o entorno cadastral.

`surfaceMaterials.ts` já era a biblioteca compartilhada de arquitetura e pavimento: oito famílias de `MeshStandardMaterial`, quatro mapas procedurais de 128² e reflexos PMREM. Os mapas de relevo eram bump monocromático, sem normal RGB ou AO. `architecture.ts` e `pavement.ts` já fornecem UVs ancorados em unidades de mundo, em escalas próprias para telhas, paredes e pavimento. Esse sistema, suas malhas e as cores semânticas foram preservados.

## Implementação

O atlas traz cinco famílias: mineral pintado, concreto, asfalto, chapa pintada e grama. Três imagens são compartilhadas entre os materiais compatíveis:

| Mapa                 | Conteúdo e uso                                                                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Albedo sRGB          | Variação de baixa intensidade multiplicada pela paleta existente. Não contém iluminação ou sombras fotografadas.                                  |
| Normal linear        | Normais tangentes RGB unitárias, derivadas de microestrutura mineral, agregado, nervuras ou fibras. Alimenta `normalMap`, sem deslocar geometria. |
| AO/rugosidade linear | Canal R para AO local; G para rugosidade; B branco. O mesmo recurso é associado a `aoMap` e `roughnessMap`.                                       |

Mineral atende parede, tinta branca e acento quente; concreto e asfalto possuem seus próprios padrões. Chapa pintada também fornece detalhe ao metal exposto, com resposta distinta pela metalicidade e rugosidade do material. Vidro mantém seu material e não recebe uma textura mineral. Nesta fase, a família de grama atende o piso verde dos lotes nos mesmos polígonos originais; faixas internas estreitas conservam a identificação de status comercial. A camada de material não amplia o inventário nem altera IDs, áreas ou coordenadas.

A correção solicitada a partir de `Captura de Tela 2026-10-17 às 21.58.51.png` calibra o concreto dos acessos, pisos de contato e bordas pavimentadas para **`#989F9B`**, em vez do antigo `#C4CBC8`. A referência aérea `21_33_48.jpg` confirma a leitura cinza desses pisos em contraste com as coberturas claras. A refletância linear da cor base cai aproximadamente 43%, conservando rugosidade `0.95`, metalicidade zero e intensidade de ambiente `0.09`. Essa escolha evita o branco aparente sob a iluminação diurna já fixada, sem escurecer telhados, fachadas ou tinta branca e sem alterar exposição. A textura mineral/aggregate, normal e AO existente é mantida; a correção atua igualmente no fallback procedural e no atlas comprimido. A paleta global da interface não muda.

As propriedades da biblioteca mantêm identidade por família. A normal usa amplitude pequena e desaparece suavemente entre 35 e 150 unidades de distância. No perfil Leve, sua intensidade é multiplicada por `0.55`; trocar distância ou perfil atualiza valores, sem substituir mapas ou recompilar variantes durante gestos. O AO local tem intensidade moderada (`0.25` em chapa e `0.55` nas demais famílias) e não pretende representar sombra de edifício.

Na política exclusiva de **Automática com rasterizador por software**, `createSurfaceMaterials({ software: true })` e `setSoftwareMode(true)` preservam os mesmos materiais `MeshStandardMaterial`, albedo, cores e propriedades físicas de cada família, mas retiram efetivamente as referências de `normalMap`, `bumpMap`, `roughnessMap`, `aoMap` e `envMap`. Isso omite suas variantes e amostragens no shader; apenas zerar intensidades conservaria parte desse custo. Os mapas completos permanecem no dono dos recursos para restauração com `setSoftwareMode(false)` ao escolher um perfil manual. A chegada do atlas e do ambiente durante esse modo mantém o shader simplificado e atualiza as referências guardadas. A troca não descarta mapas compartilhados, não altera geometria nem cria materiais por objeto. Referências nulas repetidas não provocam recompilação; as variantes mudam somente na preparação opcional ou na troca explícita de modo. A medição integrada é necessária para confirmar o ganho real; essa redução de mapas não é aplicada aos perfis de GPU.

No mesmo caminho automático por software, `softwareMaterials.ts` apresenta cópias [MeshLambertMaterial](https://threejs.org/docs/pages/MeshLambertMaterial.html) cacheadas por material canônico, com as mesmas cores, albedo, transparência e callbacks de recorte do atlas. A iluminação difusa continua respondendo ao sol e ao céu, com custo menor que a BRDF física por fragmento; os reflexos ficam reservados ao caminho PBR completo. A mudança ocorre no preparo ou no gate ocioso de qualidade. Materiais tardios, arrays e pisos progressivos têm suas referências originais restauradas ao sair do modo. Seis testes adicionais verificam esse ciclo, a sincronização de recursos tardios, ausência de recompilação por simples mudança de cor e descarte exclusivo das cópias. [Política e parâmetros](commercial-map-performance-budget.md).

Cada atlas tem quatro colunas e duas linhas, com cinco células usadas. Uma faixa de proteção de 1/16 da largura de cada célula replica sua própria borda periódica. O amostrador de shader repete os UVs dentro da célula e usa `textureGrad` com derivadas dos UVs originais, mantendo a escolha de mip estável nas emendas da repetição. Somente `offset/repeat` na imagem inteira faria os UVs mundiais alcançarem células vizinhas. Os materiais compartilham três texturas, com retângulo de célula por uniforme; nenhuma geometria ou coordenada comercial é reescrita.

O AO usa explicitamente o canal UV 0 já existente. Não exige duplicar as malhas para uma segunda parametrização: o atlas representa oclusão microscópica local, não um bake arquitetônico. Mapas de normal e dados usam `NoColorSpace`; albedo usa `SRGBColorSpace`.

## Compressão real, carregamento e workers

Os arquivos em `public/commercial-map/pbr/` são KTX2 reais, codificados com **UASTC LDR e Zstandard 12**, com cadeia completa de mipmaps. Foram gerados com o encoder oficial Khronos `toktx 4.4.2`, sem instalação no sistema, mudança de engine ou dependência nova do aplicativo. Não são PNGs renomeados ou uma promessa de compressão futura.

| Perfil inicial     | Resolução do atlas | Resolução da célula      | Download dos três KTX2 |
| ------------------ | ------------------ | ------------------------ | ---------------------- |
| Leve / Equilibrado | 512 × 256          | 128², incluindo proteção | 177.254 bytes          |
| Detalhado          | 1024 × 512         | 256², incluindo proteção | 603.277 bytes          |

`manifest.json` registra tamanho, SHA-256, layout e encoder de cada arquivo. A memória de GPU é contabilizada somando os buffers de mip retornados pelo transcode: depende do formato suportado pelo aparelho e não é igual ao download. Quando não há formato comprimido disponível, o loader pode usar RGBA; o diagnóstico distingue essa situação pelo campo `compressed`.

`prepareCompressed(renderer, { canCommit })` é chamado apenas na preparação ociosa depois de o mapa estar interativo. Até lá, os quatro mapas procedurais existentes continuam disponíveis. A resolução é escolhida uma vez pela qualidade inicial; gestos e mudanças posteriores de perfil não provocam novos downloads. A preparação retorna a mesma promessa nas chamadas seguintes, aguarda o controlador existente ficar ocioso, publica os três mapas de forma atômica e libera os mapas procedurais substituídos. Se o usuário iniciar um gesto durante o transcode, a chegada dos mapas aguarda a condição `canCommit` antes de introduzir a variante de normal/AO. O renderer prepara a variante completa antes de retomar a apresentação opcional.

O `KTX2Loader` da versão já instalada do Three.js detecta os formatos suportados e transcodifica os arquivos em **um Web Worker**, usando JS/WASM locais em `public/commercial-map/basis/`. O decoder é uma cópia dos arquivos da própria distribuição do Three, com licença Apache 2.0 preservada; não usa CDN. A geração e a compressão das fontes acontecem fora do navegador. A preparação no navegador possui limite de 20 segundos e cancelamento ao desmontar. Falha de download, WASM, worker ou transcode mantém a biblioteca procedural integral, navegação e seleção.

O descarte libera o worker e seu Blob URL, inclusive quando o carregamento do transcoder termina depois de um cancelamento. Texturas recebidas parcialmente são liberadas. Texturas de ambiente continuam pertencendo ao renderer, e a biblioteca não as descarta. Texturas de atlas pertencem exclusivamente à instância que as carregou.

## Reprodução

O pipeline autoral usa Pillow e NumPy do runtime de trabalho, sem copiar as fotografias de referência para o produto:

```sh
python scripts/build-commercial-pbr.py --toktx /caminho/para/toktx
```

O script usa ruído periódico com sementes fixas, gera fontes intermediárias em `artifacts.local/commercial-map-pbr/sources/`, codifica os seis arquivos finais e copia o decoder da versão instalada do Three. O executável `toktx` é necessário apenas para regenerar os assets; o build e o runtime do site usam os KTX2 já incluídos.

## Verificação e limites

As suítes específicas somam **22 testes**: dezesseis da biblioteca de materiais, três do atlas e três do ciclo do loader. Verificam o cabeçalho KTX2/UASTC real, resolução e mips, espaço de cor dos dados, hashes, orçamento de download, confinamento dos UVs às células, gradientes, normal e AO reais associados, promessa única, espera pelo controlador ocioso, falha atômica, cancelamento, descarte parcial e inicialização tardia do worker. Os cenários de concreto comprovam a separação entre concreto cinza fosco, tinta branca e fachadas claras, com mapas disponíveis ou ausentes. Quatro casos adicionais verificam mapas realmente omitidos no software, identidade e cores preservadas, chegada atômica do atlas/ambiente durante o modo, reversão integral, falha procedural e descarte único dos recursos guardados. Na execução direcionada desta correção, os **16 testes da biblioteca**, `tsc --noEmit` e ESLint passaram; a suíte integrada registra a verificação restante.

Os arquivos foram transcodificados com `ktx extract --transcode rgb8` e as imagens de albedo e normal foram inspecionadas. Essa inspeção confirma o conteúdo dos mapas; a calibração final de material e fluidez depende das capturas e medições do renderer registradas pelo relatório da fase. Nenhum teste em aparelho móvel físico foi realizado por esta etapa da biblioteca.

## Fontes oficiais

O `KTX2Loader` suporta transcode de Basis para formatos comprimidos do dispositivo, requer detecção prévia de suporte e permite limitar workers e liberar seus recursos. [Three.js: KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html).

O uso de normal RGB, AO no canal vermelho, rugosidade no verde e marcação de dados lineares segue o material físico existente. [Three.js: MeshStandardMaterial](https://threejs.org/docs/pages/MeshStandardMaterial.html).

O encoder e o formato de distribuição foram obtidos no projeto Khronos, com a versão registrada no manifesto. [Khronos KTX-Software 4.4.2](https://github.com/KhronosGroup/KTX-Software/releases/tag/v4.4.2). O transcoder local acompanha o loader da engine instalada. [Basis Universal](https://github.com/BinomialLLC/basis_universal).
