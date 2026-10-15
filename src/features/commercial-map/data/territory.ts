/**
 * Indumóveis territorial revision 2026-10-15, source PDF drawing coordinates.
 * One drawing unit = 10 PDF points; x right, y down, world [x, 0, y].
 * This schematic is NOT a survey or a metre coordinate system. Never use its
 * polygon area for pricing or replace persisted space UUIDs with these IDs.
 */
export type Point = [number, number];
export type MapEntity = {
  id: string;
  kind: "lot" | "pavilion" | "support" | "road" | "landscape";
  label: string;
  location: string;
  polygon: Point[];
  anchor: Point;
  numbers?: number[];
  declaredAreaM2?: number;
  height?: number;
  source: string;
  confidence: string;
  notes?: string;
  accesses?: Point[];
};

export const SOURCES = [
  {
    id: "external-v1",
    file: "V1 - Mapa parque Externo (10).pdf",
    title: "ÁREA EXTERNA - PARQUE DE EXPOSIÇÕES",
    page: 1,
    revision: "V1 / arquivo (10)",
    units: "PDF points / 10; schematic",
    pageWidth: 1955.3776,
    pageHeight: 1062.4523,
  },
  {
    id: "pavilion-1",
    file: "Mostra Arq&Design 1.pdf",
    title: "PAVILHÃO 1 - MOSTRA ARQ&DESIGN",
    page: 1,
    revision: "arquivo 1",
  },
  {
    id: "pavilion-3",
    file: "Pav 3 - 06 - 23.09.2026.pdf",
    title: "PAVILHÃO 3 - COMÉRCIO, FORNECEDORES, CONSTRUÇÃO CIVIL E MOBILIÁRIO",
    page: 1,
    revision: "06 / 23.09.2026",
    declaredAreaM2: 1155,
  },
  {
    id: "pavilion-8",
    file: "Pav 08 - 02 - 14.11.25.pdf",
    title: "PAVILHÃO 08 - FORNECEDORES E CONSTRUÇÃO CIVIL",
    page: 1,
    revision: "02 / 14.11.25",
    declaredAreaM2: 937.32,
  },
  {
    id: "pavilion-12",
    file: "Pav 12 - 07 - 14.09.26.pdf",
    title: "PAVILHÃO 12 - MÓVEIS E SERIADOS",
    page: 1,
    revision: "07 / 14.09.26",
    declaredAreaM2: 1650,
  },
  {
    id: "pavilion-13",
    file: "Pav 13 - 07 - 17.08.26.pdf",
    title: "PAVILHÃO 13 - SALÃO DE IMÓVEIS",
    page: 1,
    revision: "07 / 17.08.26",
    declaredAreaM2: 850.5,
  },
] as const;

/** Excludes the grey title banner and sheet margins, retains the entrance. */
export const MAP_BOUNDS = { minX: 4, minY: 7, maxX: 187, maxY: 103 } as const;

export function sourcePoint([x, y]: readonly [number, number]): Point {
  return [x / 10, y / 10];
}
const sourcePolygon = (points: Point[]): Point[] => points.map(sourcePoint);
const rect = (x0: number, y0: number, x1: number, y1: number): Point[] =>
  sourcePolygon([
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
  ]);
const center = (polygon: Point[]): Point => {
  const xs = polygon.map((p) => p[0]);
  const ys = polygon.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
};
const main = SOURCES[0].file;

function lot(
  numbers: number[],
  bounds: [number, number, number, number],
  location: string,
  area?: number,
): MapEntity {
  const polygon = rect(...bounds);
  const group = numbers.length > 1;
  const text = numbers.map((n) => String(n).padStart(2, "0")).join(" / ");
  return {
    id: `indumoveis:external:lot:${numbers.map((n) => String(n).padStart(2, "0")).join("-")}`,
    kind: "lot",
    label: `${group ? "Lotes" : "Lote"} ${text}`,
    location,
    polygon,
    anchor: center(polygon),
    numbers,
    declaredAreaM2: group ? undefined : area,
    source: main,
    confidence: "limites visíveis na planta geral",
    notes: group
      ? `Envelope agregado ${text}. Subdivisão individual pendente de fonte; área total não declarada.`
      : area === 203
        ? "Área declarada: 203 m². Cotas do módulo: 11,3 × 18 m = 203,4 m²; diferença de arredondamento preservada."
        : area === 227
          ? "Área declarada: 227 m². Cotas do módulo: 11,3 × 20,1 m = 227,13 m²; diferença de arredondamento preservada."
          : area === 243
            ? "Área de 243 m² anotada especificamente neste lote na planta."
            : "Área não declarada para este envelope na fonte.",
  };
}

const lots: MapEntity[] = [];
// Lower western block: original dividers, not interpolated subdivisions.
const lowerWest = [
  710.1831, 760.8624, 812.8121, 864.7618, 916.711, 968.6607, 1020.6101, 1072.5595, 1124.5099,
];
for (let i = 0; i < 8; i++)
  lots.push(
    lot(
      [i + 1],
      [lowerWest[i], 559.9367, lowerWest[i + 1], 644.229],
      "Quadras centrais · Rua Argentina",
      203,
    ),
  );
const upperWest = [
  710.1831, 760.8624, 812.8121, 864.7618, 916.711, 968.6607, 1020.6101, 1072.5595, 1124.5099,
];
for (let i = 0; i < 8; i++)
  lots.push(
    lot(
      [15 + i],
      [upperWest[i], 475.9919, upperWest[i + 1], 559.9367],
      "Quadras centrais · Rua Uruguai",
      203,
    ),
  );
const lowerEast: [number[], number, number][] = [
  [[9, 10], 1151.1096, 1258.0366],
  [[11], 1258.0366, 1309.509],
  [[12], 1309.509, 1360.6369],
  [[13], 1360.6369, 1411.7645],
  [[14], 1411.7645, 1473.7663],
];
for (const [numbers, x0, x1] of lowerEast)
  lots.push(
    lot(
      numbers,
      [x0, 559.9367, x1, 644.2976],
      "Quadras centrais · Rua Argentina / Brasília",
      numbers[0] === 14 ? 243 : 203,
    ),
  );
const upperEast = [1151.1096, 1206.5634, 1258.0366, 1309.509, 1360.6369, 1411.7645, 1473.7663];
for (let i = 0; i < 6; i++)
  lots.push(
    lot(
      [23 + i],
      [upperEast[i], 475.9919, upperEast[i + 1], 559.9367],
      "Quadras centrais · Rua Uruguai / Brasília",
      i === 5 ? 243 : 203,
    ),
  );
// Salão do Automóvel: the combined area is exactly 35,36,49,50, never 35–50.
lots.push(
  lot([29], [710.5433, 353.4922, 762.0159, 446.6278], "Salão do Automóvel · Rua Uruguai", 227),
  lot([30], [762.0159, 353.4922, 813.489, 446.6278], "Salão do Automóvel · Rua Uruguai", 227),
  lot(
    [31, 32, 33, 34],
    [813.489, 353.4922, 1018.6903, 446.6278],
    "Salão do Automóvel · Rua Uruguai",
  ),
  lot(
    [35, 36, 49, 50],
    [1018.6903, 260.3559, 1126.1273, 446.6278],
    "Salão do Automóvel · Rua Brasil / Uruguai",
  ),
  lot([37, 38], [1151.1096, 353.4922, 1258.0366, 446.2806], "Salão do Automóvel · Rua Uruguai"),
  lot([39, 40], [1258.0366, 353.4922, 1360.6369, 446.2806], "Salão do Automóvel · Rua Uruguai"),
  lot(
    [41, 42],
    [1360.6369, 353.4922, 1468.9349, 446.2806],
    "Salão do Automóvel · Rua Uruguai / Brasília",
  ),
  lot([43, 44], [710.5433, 260.3559, 813.489, 353.4922], "Salão do Automóvel · Rua Brasil"),
);
const automobileWest = [813.489, 864.9622, 916.4349, 967.5625, 1018.6903];
for (let i = 0; i < 4; i++)
  lots.push(
    lot(
      [45 + i],
      [automobileWest[i], 260.3559, automobileWest[i + 1], 353.4922],
      "Salão do Automóvel · Rua Brasil",
      227,
    ),
  );
const automobileEast = [1151.1096, 1206.5634, 1258.0366, 1309.509, 1360.6369, 1411.7645, 1468.9349];
for (let i = 0; i < 6; i++)
  lots.push(
    lot(
      [51 + i],
      [automobileEast[i], 260.3505, automobileEast[i + 1], 353.4922],
      "Salão do Automóvel · Rua Brasil",
      227,
    ),
  );
lots.push(lot([57], [605.6961, 146.9917, 661.087, 229.4372], "Faixa superior · Rua Brasil"));
const northWest = [
  710.5433, 762.0159, 813.489, 864.9622, 916.4349, 967.5625, 1018.6903, 1071.8809, 1126.1273,
];
for (let i = 0; i < 8; i++)
  lots.push(
    lot(
      [58 + i],
      [northWest[i], 146.9917, northWest[i + 1], 229.4372],
      "Faixa superior · Rua Brasil",
      227,
    ),
  );
const northEast = [1151.1096, 1206.5634, 1258.0366, 1309.1636];
for (let i = 0; i < 3; i++)
  lots.push(
    lot(
      [66 + i],
      [northEast[i], 146.9917, northEast[i + 1], 229.1555],
      "Faixa superior · Rua Brasil / Brasília",
      227,
    ),
  );
lots.push(
  lot(
    [69],
    [1383.4439, 678.7583, 1477.5605, 744.147],
    "Faixa dos pavilhões · ao lado da estrutura B7",
  ),
);
const lot70: MapEntity = lot(
  [70],
  [1528.9597, 669.8046, 1679.597, 874.3336],
  "Setor leste · Rua Brasília / Av. dos Imigrantes",
);
lot70.polygon = sourcePolygon([
  [1528.9597, 669.8046],
  [1679.597, 671.1031],
  [1672.4548, 874.3336],
  [1531.8811, 870.1128],
]);
lot70.anchor = center(lot70.polygon);
lots.push(lot70);

function entity(
  id: string,
  kind: MapEntity["kind"],
  label: string,
  polygon: Point[],
  location: string,
  options: Partial<MapEntity> = {},
): MapEntity {
  return {
    id: `indumoveis:${id}`,
    kind,
    label,
    location,
    polygon,
    anchor: center(polygon),
    source: main,
    confidence: "implantação esquemática conferida visualmente",
    ...options,
  };
}

const pavilions: MapEntity[] = [
  entity(
    "pavilion:1",
    "pavilion",
    "Pavilhão 1 · Mostra Arq & Design",
    rect(307.6543, 550.3308, 601.4092, 661.8483),
    "Mostra · Calçada do Arvoredo",
    {
      height: 3.2,
      source: `${main}; ${SOURCES[1].file}`,
      accesses: [sourcePoint([601.4092, 607])],
      notes:
        "Edifício independente do pavilhão 14. Recepção 01, café 14 e sanitários 15 são funções internas; áreas externas vinculadas não são novos lotes. Cobertura e altura são apresentação estimada.",
    },
  ),
  entity(
    "pavilion:14",
    "pavilion",
    "Pavilhão 14 · SINDUSCOM",
    rect(329.4879, 697.8562, 554.3595, 869.8982),
    "Faixa dos pavilhões · oeste",
    {
      height: 3.6,
      accesses: [],
      notes:
        "Apenas edifício confirmado na planta geral. Planta interna e posição exata dos acessos pendentes; não aplicar a planta da Mostra. Altura estimada para apresentação.",
    },
  ),
  entity(
    "pavilion:12",
    "pavilion",
    "Pavilhão 12 · Móveis e seriados",
    sourcePolygon([
      [647.1247, 703.7982],
      [934.3511, 703.7982],
      [935.5507, 871.5627],
      [648.324, 871.5627],
    ]),
    "Faixa dos pavilhões · entre 14 e 8",
    {
      height: 4.1,
      declaredAreaM2: 1650,
      source: `${main}; ${SOURCES[4].file}`,
      accesses: [sourcePoint([648, 785]), sourcePoint([935, 785]), sourcePoint([817, 871.56])],
      notes:
        "1.650 m² é área total declarada do edifício, não área vendável. Duas ilhas e acessos laterais da planta específica preparados para revisão posterior; sem estandes nesta fase.",
    },
  ),
  entity(
    "pavilion:8",
    "pavilion",
    "Pavilhão 8 · Fornecedores e construção civil",
    rect(954.5698, 679.3176, 1060.5818, 860.3455),
    "Faixa dos pavilhões · entre 12 e 13",
    {
      height: 3.8,
      declaredAreaM2: 937.32,
      source: `${main}; ${SOURCES[3].file}`,
      accesses: [
        sourcePoint([979, 860.3455]),
        sourcePoint([1031, 860.3455]),
        sourcePoint([1060.5818, 741]),
        sourcePoint([954.5698, 767]),
        sourcePoint([1055, 679.3176]),
      ],
      notes:
        "937,32 m² é área total do edifício. A planta específica mostra 01 e 03–08, sem 02; corredor livre de saída preservado para o interior futuro. Acessos projetados por posição relativa na planta, sem precisão cadastral.",
    },
  ),
  entity(
    "pavilion:13",
    "pavilion",
    "Pavilhão 13 · Salão de Imóveis",
    rect(1060.5818, 688.7159, 1158.7329, 867.7935),
    "Faixa dos pavilhões · entre 8 e 3",
    {
      height: 3.7,
      declaredAreaM2: 850.5,
      source: `${main}; ${SOURCES[5].file}`,
      accesses: [
        sourcePoint([1090, 867.7935]),
        sourcePoint([1131, 867.7935]),
        sourcePoint([1060.5818, 778]),
        sourcePoint([1158.7329, 778]),
        sourcePoint([1098, 688.7159]),
        sourcePoint([1132, 688.7159]),
      ],
      notes:
        "850,5 m² é área total do edifício. RESERVADO impresso não gera estado comercial. Interior futuro deve verificar lacunas numéricas; nenhum estande criado nesta fase.",
    },
  ),
  entity(
    "pavilion:3",
    "pavilion",
    "Pavilhão 3 · Comércio e mobiliário",
    rect(1158.7329, 678.8834, 1296.1471, 878.5793),
    "Faixa dos pavilhões · leste",
    {
      height: 4,
      declaredAreaM2: 1155,
      source: `${main}; ${SOURCES[2].file}`,
      accesses: [
        sourcePoint([1200, 878.5793]),
        sourcePoint([1232, 878.5793]),
        sourcePoint([1296.1471, 788]),
        sourcePoint([1225, 678.8834]),
      ],
      notes:
        "1.155 m² é área total declarada. Fonte específica com faixas laterais, ilha central e frente/fundos identificados; projeção relativa de acessos, sem importar parcelamento FenaSoja.",
    },
  ),
];

const roads: MapEntity[] = [
  entity(
    "road:argentina",
    "road",
    "Rua Argentina",
    rect(661.1, 644.75, 1477.56, 669.5),
    "Entre quadras e pavilhões",
  ),
  entity(
    "road:uruguai",
    "road",
    "Rua Uruguai",
    rect(710.18, 446.7, 1477.56, 475.8),
    "Entre faixas centrais de quadras",
  ),
  entity(
    "road:brasil",
    "road",
    "Rua Brasil",
    rect(49.5, 229.5, 1477.56, 260.1),
    "Acima do Salão do Automóvel",
  ),
  entity(
    "road:mercosul",
    "road",
    "Alameda Mercosul",
    rect(661.2, 78.18, 710.1, 697.8),
    "Entre Mostra / bosque e quadras",
  ),
  entity(
    "road:brasilia",
    "road",
    "Rua Brasília",
    sourcePolygon([
      [1477.6, 260.1],
      [1528.9, 260.1],
      [1528.9, 876],
      [1439, 974],
      [1416, 958],
      [1477.6, 873],
    ]),
    "Limite das quadras centrais e acesso ao Portão 03",
    { anchor: sourcePoint([1503, 486]) },
  ),
  entity(
    "road:la-paz",
    "road",
    "Rua La Paz",
    sourcePolygon([
      [1841.4, 260.75],
      [1870, 260.75],
      [1862, 879],
      [1830.3, 879],
    ]),
    "Limite direito da planta",
  ),
  entity(
    "road:benvenuto",
    "road",
    "Av. Benvenuto de Conti",
    rect(263.6, 933, 1439, 958),
    "Borda inferior · orientação da planta",
  ),
  entity(
    "road:imigrantes",
    "road",
    "Avenida dos Imigrantes",
    rect(1439, 941, 1841.3, 979),
    "Contexto inferior direito",
  ),
  entity(
    "road:arvoredo",
    "road",
    "Calçada do Arvoredo",
    rect(555.8, 262.2, 661.08, 514.3),
    "Café / Mostra · passeio",
    { notes: "Passeio, não área comercial; jardim esquemático simplificado." },
  ),
  entity(
    "road:east-walk-upper",
    "road",
    "Passeio · Espaço de eventos",
    rect(1690.04, 260.7521, 1725.7, 446.2369),
    "Setor leste",
    { notes: "Circulação sem numeração comercial." },
  ),
  entity(
    "road:east-walk-lower",
    "road",
    "Passeio · setor leste",
    sourcePolygon([
      [1672.2799, 874.3421],
      [1718.6715, 876.1172],
      [1725.3326, 671.4586],
      [1679.161, 671.0135],
    ]),
    "Ao lado do lote 70",
    { notes: "Circulação; não cortar nem estender a geometria comercial do lote 70." },
  ),
];

const supports: MapEntity[] = [
  entity(
    "support:cafe",
    "support",
    "Café",
    rect(450.0045, 262.5762, 555.7187, 320.4145),
    "Bosque / Calçada do Arvoredo",
    { height: 2.2 },
  ),
  entity(
    "support:bar",
    "support",
    "Bar",
    rect(450.0045, 321.1023, 555.7187, 391.0581),
    "Bosque / Calçada do Arvoredo",
    { height: 2.2 },
  ),
  entity(
    "support:restaurant",
    "support",
    "Restaurante",
    rect(450.0045, 391.7459, 555.7187, 459.2199),
    "Bosque / Calçada do Arvoredo",
    { height: 2.2 },
  ),
  entity(
    "support:events",
    "support",
    "Espaço de eventos",
    rect(1529.9915, 260.7521, 1690.0435, 446.0663),
    "Leste · Rua Brasília",
    { height: 2.4 },
  ),
  entity(
    "support:mao-na-massa",
    "support",
    "Espaço Mão na Massa",
    sourcePolygon([
      [1529.6451, 475.0352],
      [1624.8498, 475.0352],
      [1624.8498, 568.583],
      [1530.6792, 568.583],
    ]),
    "Leste · Rua Brasília",
    { height: 2.3 },
  ),
  entity(
    "support:b7",
    "support",
    "Estrutura B7",
    rect(1356.4854, 752.0209, 1411.6757, 878.6145),
    "Leste dos pavilhões · Portão 03",
    {
      height: 2.8,
      notes:
        "B7 é o código impresso na planta Indumóveis; não equivale ao B7 da FenaSoja e sua função não foi inferida.",
    },
  ),
  entity(
    "support:b7-annex-a",
    "support",
    "Apoio B7",
    rect(1423.4598, 752.0232, 1447.3624, 775.9269),
    "Ao lado da estrutura B7",
    { height: 1.8 },
  ),
  entity(
    "support:b7-annex-b",
    "support",
    "Apoio B7",
    rect(1423.4598, 786.6041, 1447.3624, 810.507),
    "Ao lado da estrutura B7",
    { height: 1.8 },
  ),
  entity(
    "support:gate-03",
    "support",
    "Portão 03",
    rect(1416.3939, 895.2952, 1438.8999, 931.3893),
    "Entrada · Av. Benvenuto de Conti / Rua Brasília",
    {
      height: 0.65,
      notes:
        "Posição da entrada conforme a planta; a seta gráfica de legenda não é uma edificação.",
    },
  ),
];

const landscapes: MapEntity[] = [
  entity(
    "landscape:grove",
    "landscape",
    "Bosque da Mostra",
    sourcePolygon([
      [49.5043, 260.7536],
      [395.4796, 261.6],
      [395.4796, 322.2234],
      [439.632, 322.2234],
      [439.632, 514.3568],
      [243.9524, 514.3568],
      [243.9524, 676.4804],
      [264.0586, 676.4804],
      [264.0586, 796.122],
      [49.5043, 796.1382],
    ]),
    "Atrás e ao lado do Pavilhão 1",
    {
      anchor: sourcePoint([218, 415]),
      notes:
        "Área natural, sem números comerciais. Copas reduzidas para preservar edifício e acessos; posições interpretadas dos símbolos da própria planta.",
    },
  ),
  entity(
    "landscape:upper-west",
    "landscape",
    "Área sem identificação comercial",
    sourcePolygon([
      [50.7373, 78.1828],
      [661.087, 78.1828],
      [661.087, 146.9917],
      [605.6961, 146.9917],
      [605.6961, 229.4372],
      [50.7373, 229.4372],
    ]),
    "Faixa superior · oeste",
    { notes: "Verde sem número; função não confirmada. Não representa disponibilidade comercial." },
  ),
  entity(
    "landscape:upper-middle",
    "landscape",
    "Área sem identificação comercial",
    rect(710.5433, 78.1828, 1126.1273, 146.9917),
    "Faixa superior · centro",
    { notes: "Faixa sem número, não transformada em lote." },
  ),
  entity(
    "landscape:upper-east",
    "landscape",
    "Área sem identificação comercial",
    rect(1151.1096, 78.1783, 1309.1636, 146.9917),
    "Faixa superior · leste",
  ),
  entity(
    "landscape:upper-support",
    "landscape",
    "Área de apoio sem identificação",
    rect(1309.8515, 78.1783, 1469.7196, 229.1558),
    "Faixa superior · leste",
    { notes: "Envelope taupe sem identificação; uso e limites internos pendentes." },
  ),
  entity(
    "landscape:event-east",
    "landscape",
    "Área aberta · eventos",
    sourcePolygon([
      [1725.7, 260.7536],
      [1841.3257, 260.7536],
      [1833.8842, 446.0677],
      [1725.7, 446.0677],
    ]),
    "Leste do espaço de eventos",
  ),
  entity(
    "landscape:workshop-east",
    "landscape",
    "Área aberta · Mão na Massa",
    sourcePolygon([
      [1624.8504, 475.0352],
      [1820.3134, 475.0352],
      [1814.9975, 649.2537],
      [1624.8504, 647.0662],
    ]),
    "Leste do Espaço Mão na Massa",
  ),
  entity(
    "landscape:workshop-south",
    "landscape",
    "Apoio · Mão na Massa",
    rect(1530.6809, 568.583, 1624.8504, 647.1231),
    "Abaixo do Espaço Mão na Massa",
  ),
  entity(
    "landscape:lot70-east",
    "landscape",
    "Área sem identificação comercial",
    sourcePolygon([
      [1725.3326, 672.0762],
      [1837.3757, 673.0505],
      [1830.2335, 878.5535],
      [1718.6715, 875.6321],
    ]),
    "Leste do lote 70 · além do passeio",
    { notes: "Sem número; não pertence automaticamente ao lote 70." },
  ),
  entity(
    "landscape:b7-west",
    "landscape",
    "Área aberta · B7",
    rect(1309.0014, 678.7583, 1383.4439, 752.0209),
    "Entre pavilhão 3 e B7",
  ),
  entity(
    "landscape:frontage",
    "landscape",
    "Faixa verde dos pavilhões",
    rect(554.36, 878.62, 1356.48, 914.74),
    "Entre edifícios e avenida",
  ),
  entity(
    "landscape:p14-front",
    "landscape",
    "Jardim do pavilhão 14",
    rect(263.77, 869.9, 554.36, 914.74),
    "Oeste · Av. Benvenuto de Conti",
  ),
];

export const ENTITIES: MapEntity[] = [...landscapes, ...roads, ...lots, ...supports, ...pavilions];

/** Sparse source-symbol centres, independent of FenaSoja's complete tree set. */
export const TREES: Point[] = [
  [145, 303],
  [300, 310],
  [110, 423],
  [224, 398],
  [177, 494],
  [262, 488],
  [88, 533],
  [212, 565],
  [152, 620],
  [58, 645],
  [230, 677],
  [110, 710],
  [200, 745],
  [324, 816],
  [309, 887],
].map((point) => sourcePoint([point[0], point[1]]));
