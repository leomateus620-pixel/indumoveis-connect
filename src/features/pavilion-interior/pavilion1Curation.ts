// Notes describe the exhibition artwork. The approved plan supplies room names and use.
const designNotes: Readonly<Record<string, string>> = {
  "01": "O balcão de pedra acompanha a curva da recepção. Um brise delimita a espera e mantém a vista para o salão.",
  "02": "A estante vazada organiza o acervo de materiais. A bancada central permite comparar as amostras lado a lado.",
  "03": "O aparador acompanha a mesa de jantar e dá continuidade ao canto de conversa.",
  "04": "A ilha monolítica reúne cuba e bancada sob uma linha de luz. A mesa redonda abre espaço para circular em volta.",
  "05": "As poltronas voltadas uma para a outra e o banco baixo formam dois lugares de escuta e conversa.",
  "06": "Pedestais de alturas diferentes aproximam a coleção de cerâmicas da mesa de trabalho.",
  "07": "A cabeceira tramada, o armário e o canto de vestir compõem uma suíte de materiais táteis.",
  "08": "O estar abre para o terraço. A mesa redonda e o sofá marcam a passagem entre receber e descansar.",
  "09": "A biblioteca vazada filtra as vistas entre leitura e trabalho e deixa a luz atravessar a marcenaria.",
  "10": "A mesa de amostras põe os tecidos ao alcance das mãos. O tapete e os estofados mostram sua aplicação em escala real.",
  "11": "A bancada de preparo se abre para a mesa coletiva, aproximando quem cozinha de quem se senta para comer.",
  "12": "A pérgola e a parede de galeria conectam os espaços de estar, jantar e trabalho ao terraço.",
  "13": "Duas ilhas de exposição alternam mobiliário e cerâmica e permitem observar as peças por vários lados.",
  "14": "A bancada contínua organiza o preparo do café. As mesas ocupam os dois braços do ambiente e liberam o caminho da saída.",
  "15": "As bancadas de lavatório e as divisórias das cabines acompanham os dois recintos da planta.",
  salon:
    "O banco-jardim desenha uma curva no salão. Uma sequência de pórticos com luz linear marca o percurso entre as peças.",
};

export function pavilion1DesignNote(code: string): string | undefined {
  return designNotes[code];
}
