# Validação do Pavilhão 12 · Móveis e Seriados

A planta possui **254 lotes** numerados de 1 a 254. São 36 na faixa inferior, 84 na ilha central inferior, 84 na ilha central superior e 50 na faixa superior. A revisão 1 usa pontos do PDF e mantém os dois acessos laterais, a entrada inferior e o vão entre 22 e 23. A cota de 5 m junto a 172–175 e 153–150 cobre quatro divisões por fileira no desenho. A revisão preserva as quatro divisões. [Relatório de geometria](../../pavilion-12/geometry.md).

| Vista | Captura |
| --- | --- |
| Planta fornecida, com nomes de empresas removidos da captura | [Referência](referencia-sem-ocupacoes.png) |
| Planta inteira no desktop, 1440 × 900 | [Visão geral](desktop-planta.jpg) |
| Ilha central superior, lote 172 | [Aproximação](desktop-ilha-superior.jpg) |
| Ilha central inferior, lote 85 | [Aproximação](desktop-ilha-inferior.jpg) |
| Abertura inferior, lote 23 | [Aproximação](desktop-abertura-inferior.jpg) |
| Faixa superior, lote 242 | [Aproximação](desktop-faixa-superior.jpg) |
| Planta inteira no tablet, 1024 × 768 | [Visão geral](tablet-planta.jpg) |
| Celular a 390 × 844 | [Painel](celular-painel.jpg) · [Lote localizado](celular-lote.jpg) |

No navegador, a busca por 172 preservou o enquadramento até a ação **Localizar na planta**. No celular, a ação recolheu o painel e manteve seleção e foco no lote. As setas seguiram as posições físicas das fileiras. Zoom pela roda, arraste, acesso direto, atualização, retorno ao parque e ligação a partir do Pavilhão 8 foram conferidos. Cliques na abertura inferior distinguiram os lotes 22 e 23 da circulação. Toque e pinça foram verificados com eventos simulados na suíte.

A prévia usou a geometria da revisão e uma sessão local de teste. A verificação em produção foi feita separadamente pelo Lovable. O RPC autenticado devolveu 254 lotes, todos com área individual nula. Os **1.650 m²** pertencem ao pavilhão e aparecem no cabeçalho. [Comprovação do banco](../../pavilion-12/database.md).

Os interiores dos pavilhões 1, 8 e 13 foram conferidos. O Pavilhão 14 tem ficha externa na versão-base. A sinalização lateral do Pavilhão 12 usa **Acesso**, pois o PDF não identifica os destinos dessas passagens.

Passaram 608 testes em 90 arquivos, TypeScript, build de produção e lint dos arquivos alterados. O gerador reproduziu a geometria da revisão 1 e os testes confirmaram polígonos individuais sem sobreposição.
