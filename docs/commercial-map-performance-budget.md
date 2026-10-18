# Resolução automática em renderização por software

`performanceBudget.ts` mantém a política anterior de GPU e acrescenta uma política explicitamente habilitada pelo renderer somente quando **Automática** usa SwiftShader, llvmpipe, softpipe ou uma identificação explícita de rasterizador/renderizador por software. `isSoftwareRasterizer()` interpreta apenas a string opcional recebida de `WEBGL_debug_renderer_info`; metadados ausentes, desconhecidos ou de GPU não habilitam essa política. O controlador não cria outro contexto nem modifica câmera, picking, geometria ou HTML.

```ts
const budget = new ResolutionBudget({ software: softwareAutomatic });
budget.observe(activeFrameP95Ms, performance.now());
budget.reset(); // perfil manual/GPU: escala 1
budget.reset({ software: true }); // nova entrada em Automática/software
```

O fator multiplica a resolução interna já limitada pelo perfil; nunca aumenta seu DPR máximo. Canvas CSS e coordenadas de entrada permanecem independentes desse fator. O renderer inicia Automática/software no perfil Leve, aplica a escala inicial e reaplica a opção no reset ao entrar/sair desse modo. Uma mudança de resolução zera os contadores de pressão/recuperação do renderer: a janela medida no buffer anterior não pode provocar fallback ou rebaixamento do buffer recém-criado. `atMinimum` considera `0.40` no software e `0.65` na política de GPU.

A redução de pixels é combinada à [omissão real dos mapas opcionais](commercial-map-pbr.md) apenas nesse mesmo modo: normal, bump, rugosidade, AO e ambiente ficam com referência `null`. `softwareMaterials.ts` apresenta cópias Lambert dos materiais Standard, conservando cores, albedo, cores de vértice, transparência e o recorte do atlas. A luz solar e o preenchimento hemisférico continuam ativos; esse caminho reduz o custo de iluminação por fragmento e deixa os reflexos PBR para a GPU e os perfis manuais. As geometrias e os materiais canônicos continuam com seus donos originais.

Ao escolher um perfil manual, o gate ocioso restaura as referências Standard e os mapas completos guardados, e o orçamento volta à escala `1`. O controlador acompanha meshes acrescentados depois do primeiro 3D e a troca dos pisos temporários por seus materiais finais. Suas cópias reutilizam as texturas, nunca as descartam e são liberadas uma vez ao fechar a instância. Em GPU, não cria cópias de materiais; a sincronização por desenho retorna imediatamente. A preparação registra referências, sem alegar custo literalmente zero.

| Parâmetro de software    | Valor                                        | Critério                                                                                                                                                                                        |
| ------------------------ | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Escala inicial           | `0.50`                                       | Renderiza 25% dos pixels do buffer de referência e deixa margem inicial para o custo de raster em software. É uma escolha de calibração; não representa uma medição nem uma garantia de 30 fps. |
| Mínimo                   | `0.40`                                       | Reserva 16% dos pixels para rasterizadores com alto custo por fragmento; custo fixo de CPU/geometria não desaparece. Não altera os perfis manuais.                                              |
| Meta / faixa neutra      | `33,33 ms` / até `34 ms`                     | Objetivo de 30 fps, com tolerância à quantização da apresentação. Não recupera resolução nessa faixa.                                                                                           |
| Pressão                  | Duas janelas consecutivas acima de `34 ms`   | Cada observação da integração contém 60 intervalos de frames ativos.                                                                                                                            |
| Pressão severa           | Uma janela acima de `50 ms`                  | Uma janela já representa pressão sustentada por muitos frames; evita uma segunda espera longa.                                                                                                  |
| Cálculo da redução       | `escala × √(33,33 / p95) × 0,97`             | Estimativa pelo crescimento quadrático da área de pixels, com 3% de margem. O passo é limitado entre `0,04` e `0,12`, respeitando o mínimo.                                                     |
| Intervalo entre mudanças | `2 s`                                        | Evita mudanças sucessivas em janelas adjacentes; não obriga manter baixa fluidez por seis segundos.                                                                                             |
| Recuperação              | `+0,025` após oito janelas abaixo de `20 ms` | Histerese ampla e recuperação lenta, até o teto `0.75`, conservam margem no software.                                                                                                           |

Reset sem opções restaura escala `1` e a política original de GPU. A configuração de software não fica implicitamente ativa após a escolha de um perfil manual. Em GPU continuam os limiares de 40/23 ms, duas/oito janelas, dwell de seis segundos, mínimo 0,65 e recuperação até 1.

Os **sete testes** verificam o detector explícito de software, metadados desconhecidos/GPU, limites de `atMinimum`, preservação da política de GPU, reação à pressão severa, limites e dwell, convergência de um modelo com custo fixo mais custo quadrático de raster, ausência de oscilação na faixa neutra, recuperação lenta, reset entre modos e rejeição de amostras inválidas. Outros seis testes verificam as cópias difusas e seu ciclo de vida. O modelo matemático não é medição de aparelho. As distribuições observadas, a perda de nitidez em baixa resolução e as limitações reais estão no [relatório integrado](commercial-map-realism-validation.md); continuidade funcional não equivale a cumprir a meta de cadência.
