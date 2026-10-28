// Sobrevida — dados do PokéSurvivor usados pela extensão (tirados do código público do jogo, github.com/JPTER78/pokesurvivor,
// js/data/starters.js e js/data/pokedex.js, e do ranking Histórico por Pokémon lido em 2026-10-28). Não executa nada do jogo.
// sol = índice da resposta (0-3) em cada uma das 8 perguntas que faz o teste dar esse Pokémon.
// twin = Pokémon com os MESMOS dois traços: o jogo sorteia entre os dois (50%), então a Sobrevida termina pelo "Escolher outro".
// lb = ranking Histórico daquele Pokémon: [recorde em s, 10º lugar em s, mediana do top 50 em s].
// idle = folha Idle.png do jogo (assets/pokemon/{dex}/Idle.png): [largura, altura, quadros, duração de cada quadro em 1/60 s].
globalThis.SV_DADOS = {
  versaoJogo: '2026-10-28',
  perguntas: 8, respostas: 4,
  // recomendado: maior recorde e maior mediana do top 50 entre os 29 no ranking Histórico (ver vault: pokesurvivor/decisoes)
  melhor: 54,
  starters: [
    {"dex":1,"name":"Bulbasaur","types":["grass","poison"],"move":"vine-whip","traits":["leal","paciente"],"hp":90,"spd":97,"pa":0.97,"sa":1.06,"df":49,"sd":65,"sol":[0,0,2,1,1,1,0,0],"twin":null,"lb":[2085,1964,1894],"idle":[32,40,3,[40,6,6]]},
    {"dex":4,"name":"Charmander","types":["fire"],"move":"ember","traits":["valiente","impulsivo"],"hp":88,"spd":105,"pa":0.99,"sa":1.03,"df":43,"sd":50,"sol":[0,3,0,0,3,0,1,0],"twin":null,"lb":[2700,1902,1827],"idle":[32,40,4,[12,8,8,8]]},
    {"dex":7,"name":"Squirtle","types":["water"],"move":"water-gun","traits":["prudente","leal"],"hp":90,"spd":96,"pa":0.96,"sa":0.97,"df":65,"sd":64,"sol":[1,3,1,0,0,1,1,0],"twin":null,"lb":[2018,1910,1733],"idle":[32,32,8,[30,2,2,4,4,4,2,2]]},
    {"dex":152,"name":"Chikorita","types":["grass"],"move":"vine-whip","traits":["dulce","paciente"],"hp":90,"spd":97,"pa":0.97,"sa":0.97,"df":65,"sd":65,"sol":[3,0,3,2,0,1,2,2],"twin":null,"lb":[1939,495,416],"idle":[24,48,6,[40,2,4,3,1,1]]},
    {"dex":155,"name":"Cyndaquil","types":["fire"],"move":"ember","traits":["tímido","impulsivo"],"hp":88,"spd":105,"pa":0.99,"sa":1.03,"df":43,"sd":50,"sol":[2,3,0,2,1,0,0,0],"twin":null,"lb":[1974,1835,1015],"idle":[24,32,2,[40,16]]},
    {"dex":158,"name":"Totodile","types":["water"],"move":"water-gun","traits":["travieso","valiente"],"hp":92,"spd":96,"pa":1.06,"sa":0.94,"df":64,"sd":48,"sol":[3,0,1,1,1,0,3,1],"twin":null,"lb":[1922,1501,745],"idle":[32,48,7,[30,4,2,6,3,2,3]]},
    {"dex":252,"name":"Treecko","types":["grass"],"move":"razor-leaf","traits":["sereno","astuto"],"hp":88,"spd":107,"pa":0.95,"sa":1.06,"df":35,"sd":55,"sol":[2,2,1,1,2,0,1,0],"twin":656,"lb":[1847,694,426],"idle":[32,40,3,[40,4,2]]},
    {"dex":255,"name":"Torchic","types":["fire"],"move":"ember","traits":["alegre","valiente"],"hp":90,"spd":97,"pa":1.03,"sa":1.08,"df":40,"sd":50,"sol":[0,3,2,0,0,0,0,0],"twin":null,"lb":[1965,1376,889],"idle":[24,40,5,[30,3,4,3,3]]},
    {"dex":258,"name":"Mudkip","types":["water"],"move":"water-gun","traits":["tenaz","leal"],"hp":92,"spd":95,"pa":1.08,"sa":0.97,"df":50,"sd":50,"sol":[1,1,3,0,1,0,0,0],"twin":null,"lb":[2047,1889,1365],"idle":[24,40,7,[38,2,2,5,3,3,2]]},
    {"dex":387,"name":"Turtwig","types":["grass"],"move":"vine-whip","traits":["paciente","tenaz"],"hp":95,"spd":91,"pa":1.07,"sa":0.95,"df":64,"sd":55,"sol":[0,1,3,2,2,1,0,2],"twin":null,"lb":[1844,643,384],"idle":[24,32,4,[40,12,16,12]]},
    {"dex":390,"name":"Chimchar","types":["fire"],"move":"ember","traits":["travieso","alegre"],"hp":90,"spd":104,"pa":1.02,"sa":1.02,"df":44,"sd":44,"sol":[3,2,1,1,0,1,3,0],"twin":null,"lb":[1954,1829,833],"idle":[24,40,5,[30,2,4,6,2]]},
    {"dex":393,"name":"Piplup","types":["water"],"move":"bubble","traits":["orgulloso","prudente"],"hp":94,"spd":95,"pa":0.98,"sa":1.04,"df":53,"sd":56,"sol":[1,3,3,1,0,1,0,1],"twin":912,"lb":[2033,1866,872],"idle":[24,40,6,[40,2,4,4,4,2]]},
    {"dex":495,"name":"Snivy","types":["grass"],"move":"razor-leaf","traits":["orgulloso","astuto"],"hp":90,"spd":104,"pa":0.95,"sa":0.95,"df":55,"sd":55,"sol":[0,2,0,1,2,3,0,3],"twin":null,"lb":[1924,741,380],"idle":[32,40,4,[40,30,35,30]]},
    {"dex":498,"name":"Tepig","types":["fire"],"move":"ember","traits":["tenaz","alegre"],"hp":99,"spd":97,"pa":1.05,"sa":0.95,"df":45,"sd":45,"sol":[2,1,2,0,0,2,0,1],"twin":null,"lb":[1880,492,353],"idle":[24,48,6,[40,2,3,4,3,2]]},
    {"dex":501,"name":"Oshawott","types":["water"],"move":"water-gun","traits":["valiente","travieso"],"hp":95,"spd":97,"pa":1,"sa":1.05,"df":45,"sd":45,"sol":[0,0,1,0,0,0,3,0],"twin":null,"lb":[2014,1829,744],"idle":[24,40,6,[40,2,4,4,4,2]]},
    {"dex":650,"name":"Chespin","types":["grass"],"move":"vine-whip","traits":["travieso","tenaz"],"hp":95,"spd":94,"pa":1.04,"sa":0.96,"df":65,"sd":45,"sol":[3,2,3,0,2,1,3,3],"twin":null,"lb":[1088,363,335],"idle":[24,40,6,[40,2,4,4,4,2]]},
    {"dex":653,"name":"Fennekin","types":["fire"],"move":"ember","traits":["astuto","sereno"],"hp":88,"spd":103,"pa":0.95,"sa":1.04,"df":40,"sd":60,"sol":[0,2,1,0,2,3,3,0],"twin":null,"lb":[1944,875,565],"idle":[40,32,4,[36,12,12,12]]},
    {"dex":656,"name":"Froakie","types":["water"],"move":"water-gun","traits":["sereno","astuto"],"hp":88,"spd":108,"pa":1.01,"sa":1.04,"df":40,"sd":44,"sol":[2,2,1,1,2,0,1,0],"twin":252,"lb":[1997,1899,1705],"idle":[24,40,7,[38,2,2,5,3,3,2]]},
    {"dex":722,"name":"Rowlet","types":["grass","flying"],"move":"razor-leaf","traits":["sereno","dulce"],"hp":101,"spd":96,"pa":1,"sa":0.97,"df":55,"sd":50,"sol":[2,0,1,2,1,2,1,0],"twin":null,"lb":[2041,1429,626],"idle":[24,32,6,[40,2,4,4,4,2]]},
    {"dex":725,"name":"Litten","types":["fire"],"move":"ember","traits":["solitario","orgulloso"],"hp":90,"spd":107,"pa":1.06,"sa":1.03,"df":40,"sd":40,"sol":[2,0,3,1,2,0,0,1],"twin":null,"lb":[1899,1414,977],"idle":[24,24,4,[40,12,20,12]]},
    {"dex":728,"name":"Popplio","types":["water"],"move":"bubble","traits":["alegre","dulce"],"hp":92,"spd":95,"pa":1,"sa":1.06,"df":54,"sd":56,"sol":[2,0,2,2,0,2,2,0],"twin":null,"lb":[1986,492,364],"idle":[32,24,2,[30,20]]},
    {"dex":810,"name":"Grookey","types":["grass"],"move":"vine-whip","traits":["alegre","travieso"],"hp":92,"spd":105,"pa":1.06,"sa":0.92,"df":50,"sd":40,"sol":[2,2,2,0,0,1,0,0],"twin":null,"lb":[1469,553,349],"idle":[24,32,2,[16,16]]},
    {"dex":813,"name":"Scorbunny","types":["fire"],"move":"ember","traits":["impulsivo","alegre"],"hp":92,"spd":107,"pa":1.09,"sa":0.92,"df":40,"sd":40,"sol":[1,0,0,0,0,0,0,1],"twin":null,"lb":[1964,1401,1108],"idle":[24,40,4,[12,8,8,8]]},
    {"dex":816,"name":"Sobble","types":["water"],"move":"water-gun","traits":["tímido","astuto"],"hp":92,"spd":107,"pa":0.92,"sa":1.08,"df":40,"sd":40,"sol":[2,2,3,2,0,3,2,0],"twin":null,"lb":[1939,1832,759],"idle":[24,40,4,[40,5,5,5]]},
    {"dex":906,"name":"Sprigatito","types":["grass"],"move":"razor-leaf","traits":["solitario","astuto"],"hp":88,"spd":105,"pa":1.04,"sa":0.95,"df":54,"sd":45,"sol":[2,2,0,0,2,3,1,1],"twin":null,"lb":[1965,1206,603],"idle":[24,48,7,[38,2,2,5,3,3,2]]},
    {"dex":909,"name":"Fuecoco","types":["fire"],"move":"ember","traits":["tranquilo","tenaz"],"hp":100,"spd":93,"pa":0.95,"sa":1.05,"df":59,"sd":40,"sol":[0,1,1,0,3,2,0,2],"twin":null,"lb":[2275,1569,838],"idle":[24,32,4,[60,6,6,6]]},
    {"dex":912,"name":"Quaxly","types":["water"],"move":"water-gun","traits":["orgulloso","prudente"],"hp":95,"spd":99,"pa":1.06,"sa":0.97,"df":45,"sd":45,"sol":[1,3,3,1,0,1,0,1],"twin":393,"lb":[1820,564,374],"idle":[24,32,4,[16,20,16,20]]},
    {"dex":54,"name":"Psyduck","types":["water"],"move":"confusion","traits":["caótico","tímido"],"hp":92,"spd":101,"pa":0.99,"sa":1.06,"df":48,"sd":50,"sol":[3,3,1,3,3,3,0,0],"twin":null,"lb":[3205,1997,1908],"idle":[24,40,4,[16,20,16,20]]},
    {"dex":79,"name":"Slowpoke","types":["water","psychic"],"move":"confusion","traits":["tranquilo","paciente"],"hp":110,"spd":84,"pa":1.06,"sa":0.92,"df":65,"sd":40,"sol":[0,2,1,2,0,1,0,2],"twin":null,"lb":[2068,850,493],"idle":[24,32,4,[40,8,8,8]]},
  ],
  corTipo: { normal:'#b0a99f', fire:'#ff7b3d', water:'#4b9bff', grass:'#5fcb6a', poison:'#b45ec4', flying:'#9bb8ff', psychic:'#ff5f9e' },
};
