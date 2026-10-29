// Sobrevida — novidades por versão (regra 12). Atualizar em toda versão nova, nos três idiomas.
// Frases curtas, do ponto de vista de quem usa. Aparece uma vez, na primeira abertura depois da atualização.
globalThis.SV_NOVIDADES = {
  pt: {
    '0.6.0': [
      "Visual novo da partida, no estilo do jogo: card do seu Pokémon com o sprite animado, nível, vida (verde, amarela e vermelha, com o rastro do dano) e experiência embaixo.",
      "Buffs com timer: cada um mostra os acúmulos, os segundos que faltam e uma barrinha, e pisca nos 2 últimos segundos.",
      "Relógio com derrotados e moedas, painel do chefe com o retrato e a porcentagem, e barra de golpes com a recarga em forma de relógio e os segundos do golpe ativo.",
      "Dá para voltar ao visual do jogo no menu da Sobrevida (\"Visual novo da partida\"). Funciona também com o farm desligado.",
    ],
    '0.5.0': [
      "Loja Kecleon automática: entre as partidas, o farm calcula quanto cada natureza, cada habilidade e cada MT do dia deixam o parceiro mais forte. Quando vale a pena, compra a Menta, a Cápsula ou a MT e usa na ficha do Pokémon, pelos botões do jogo.",
      "Só compra quando o ganho passa do mínimo e rende mais por moeda que a próxima melhoria de Força. Usa também o que já estiver na Mochila. Dá para desligar nas Opções do farm.",
      "Os cálculos agora usam a natureza e a habilidade de verdade de cada Pokémon. O painel mostra as duas embaixo da build.",
    ],
    '0.4.1': [
      "Tutorial, novidades e aviso de versão nova agora só aparecem fora da partida (no menu). Se uma partida começa com um deles aberto, ele some e volta no menu.",
      "Versão urgente: a partida em andamento termina normalmente; o farm pausa só no menu.",
    ],
    '0.4.0': [
      "Base de cálculo: a Sobrevida lê do próprio jogo os dados de todos os Pokémon, golpes e inimigos e calcula, para cada Pokémon, o valor de cada golpe (dano por segundo, lado físico/especial, monotipo, clima e eficácia contra os inimigos que vão aparecer na partida).",
      "Com isso o farm monta a build de cada Pokémon (2 ataques principais, buffs e o parceiro de troca) e escolhe cartas, melhorias e fusões por ela. A build aparece no painel do farm.",
      "Melhorias: além de comprar, o farm agora configura o Golpe inicial, o Segundo golpe inicial e o Veto pela base de cálculo (veta primeiro os buffs fora da build e os golpes mais fracos).",
      "Aprende jogando: mede o dano real de cada golpe nas suas partidas e corrige os cálculos nas próximas.",
      "O parceiro mais forte agora é escolhido pela força calculada da build, e o farm sai do caminho das investidas dos inimigos que miram antes de correr.",
    ],
    '0.3.0': [
      "Troca de ataque sozinho: logo depois que um golpe sai, o farm troca para o outro espaço, que o jogo deixa quase pronto. Os buffs (Danza Espada, Fortaleza…) agora são usados e ficam carregados. No laboratório, de 3 a 7 vezes mais dano por segundo.",
      "Desvio de tiros pela trajetória inteira: no laboratório, o dano tomado de tiros caiu de 66 para menos de 20 por minuto.",
      "Prefere o ataque super eficaz contra o inimigo da vez.",
      "Build: pega um 3º ataque para servir de parceiro de troca e volta a entrar nas fendas depois de juntar os ataques (tickets, ×10, moedas).",
    ],
    '0.2.6': [
      "Farm com dois modos separados no menu do coração: Sozinho (partidas sozinho em loop, com missões, gacha, parceiro e melhorias) e Em grupo (partidas com amigos: joga só o seu Pokémon e nunca mexe no menu).",
      "Em grupo: se você criou a sala, ligue quando quiser; como convidado, ligue na sala antes de a partida começar. O painel diz se o modo escolhido não serve para a partida em que você está.",
    ],
    '0.2.5': [
      "Na partida, a barrinha da Sobrevida aparece sempre no canto superior direito, mesmo com o farm desligado: clique nela para abrir o menu, ou em \"Ligar\" para o farm assumir na hora.",
      "Cooperativo: se você criou a sala, pode ligar o farm no meio da partida em grupo. Como convidado, ligue antes de a partida começar.",
    ],
    '0.2.4': [
      "Modo cooperativo: o farm agora joga em grupo com os amigos, sendo você o anfitrião ou convidado. Ligue o farm antes de a partida em grupo começar.",
      "Em grupo, entre as partidas o farm não mexe no menu (nada de gacha, troca de parceiro ou partida sozinho) e não volta da tela final sozinho.",
      "A partida em grupo com o farm não entra no ranking, nem para os amigos.",
    ],
    '0.2.3': [
      "Na partida, a barrinha do farm agora fica no canto superior direito, onde não cobre nada do jogo.",
    ],
    '0.2.2': [
      "O farm agora luta com o chefe da fenda e com os chefes do mapa: chega na distância do ataque que você está usando (encosta se for de perto) em vez de só fugir. Com pouca vida, volta a desviar.",
      "Na luta com chefe, o farm prefere o ataque que alcança de longe, quando ele é tão bom quanto o outro.",
      "Parceiro: o farm termina as melhorias do Pokémon atual até 100% e só depois troca para o mais forte que você tem. Se você escolher outro no jogo, ele respeita.",
      "Pokémon grandes (como o Yveltal) aparecem inteiros no painel.",
    ],
    '0.2.1': [
      'Se a Sobrevida for atualizada com o jogo aberto, o painel avisa e mostra o botão "Recarregar agora" (antes o farm ficava parado esperando).',
      'Só uma aba joga por vez: com duas abas do PokéSurvivor abertas, a outra mostra que o farm está na primeira.',
    ],
    '0.2.0': [
      'Farm automático: no menu do coração, "Ligar farm" (ou Alt+F). Ele joga sozinho em loop: desvia, pega experiência, escolhe cartas, entra em fenda e abre baús.',
      'Entre as partidas: recolhe as missões, tira o gacha (Noite Espectral no Halloween), troca para o melhor parceiro que ainda não está 100% e compra as melhorias dele.',
      'No Halloween compra as skins de bruxa com os doces. Mostra moedas por hora e o que fez.',
      'As partidas do farm nunca vão para o ranking.',
    ],
    '0.1.0': [
      'Escolha seu parceiro antes do teste: menu com os 29 Pokémon iniciais, com sprites, tipos, ataque inicial e atributos do próprio jogo.',
      'A Sobrevida responde as 8 perguntas por você e o Pokémon vem certo, até nos pares que o jogo sorteia.',
      'O ⭐ marca o melhor parceiro pelo ranking do jogo.',
    ],
  },
  en: {
    '0.6.0': [
      "New in-run look, in the game's style: your Pokémon's card with its animated sprite, level, HP (green, yellow and red, with a damage trail) and EXP underneath.",
      "Buffs with timers: each one shows its stacks, seconds left and a small bar, and blinks in the last 2 seconds.",
      "Clock with defeated count and coins, a boss panel with portrait and percentage, and a moves bar with a clock-style cooldown and the active move's seconds.",
      "You can switch back to the game's look in the Sobrevida menu (\"New in-run look\"). It works with the farm off too.",
    ],
    '0.5.0': [
      "Automatic Kecleon Shop: between runs, the farm works out how much stronger each nature, each ability and each of today's TMs would make your partner. When it's worth it, it buys the Mint, Capsule or TM and uses it on the Pokémon's page, through the game's own buttons.",
      "It only buys when the gain clears the minimum and pays off better per coin than the next Strength upgrade. It also uses what's already in the Bag. You can turn it off in the farm Options.",
      "The math now uses each Pokémon's real nature and ability. The panel shows both under the build.",
    ],
    '0.4.1': [
      "The tutorial, What's new and new-version notices now only show outside a run (in the menu). If a run starts with one open, it hides and comes back in the menu.",
      "Urgent version: the current run finishes normally; the farm only pauses in the menu.",
    ],
    '0.4.0': [
      "Calculation base: Sobrevida reads the data of every Pokémon, move and enemy from the game itself and works out, for each Pokémon, the value of each move (damage per second, physical/special side, mono-type, weather and effectiveness against the enemies coming up in the run).",
      "The farm builds each Pokémon's loadout from it (2 main attacks, buffs and the switching partner) and picks cards, upgrades and fusions accordingly. The build shows in the farm panel.",
      "Upgrades: besides buying them, the farm now sets the Starting move, the Second starting move and the Bans from the calculation base (it bans buffs outside the build and the weakest moves first).",
      "Learns as it plays: it measures the real damage of each move in your runs and corrects the calculations in the next ones.",
      "The strongest partner is now chosen by the build's calculated strength, and the farm gets out of the way of enemies that aim before charging.",
    ],
    '0.3.0': [
      "Attack switching by itself: right after a move fires, the farm switches to the other slot, which the game leaves almost ready. Buffs (Swords Dance, Harden…) are now used and kept stacked. In the lab, 3 to 7 times more damage per second.",
      "Dodges shots along their whole path: in the lab, damage taken from shots dropped from 66 to under 20 per minute.",
      "Prefers the super-effective move against the current target.",
      "Build: takes a 3rd attack as a switching partner and goes back into rifts after merging its attacks (tickets, ×10, coins).",
    ],
    '0.2.6': [
      "The farm has two separate modes in the heart menu: Solo (solo runs in a loop, with missions, gacha, partner and upgrades) and Group (runs with friends: it only plays your Pokémon and never touches the menu).",
      "Group: if you created the room, turn it on any time; as a guest, turn it on in the room before the run starts. The panel tells you when the chosen mode doesn't fit the run you're in.",
    ],
    '0.2.5': [
      "During a run, the Sobrevida bar always shows in the top-right corner, even with the farm off: click it to open the menu, or \"Start\" to let the farm take over right away.",
      "Co-op: if you created the room, you can turn the farm on in the middle of a group run. As a guest, turn it on before the run starts.",
    ],
    '0.2.4': [
      "Co-op: the farm now plays in a group with your friends, whether you're the host or a guest. Turn the farm on before the group run starts.",
      "In a group, the farm doesn't touch the menu between runs (no gacha, partner switch or solo run) and doesn't leave the results screen by itself.",
      "A group run with the farm doesn't go to the leaderboard, not even for your friends.",
    ],
    '0.2.3': [
      "During a run, the farm bar now sits in the top-right corner, where it doesn't cover anything in the game.",
    ],
    '0.2.2': [
      "The farm now fights the rift boss and map bosses: it moves to the range of the attack you're using (up close for short attacks) instead of only running. Low on HP, it goes back to dodging.",
      "In boss fights the farm prefers the long-range attack when it's as good as the other one.",
      "Partner: the farm finishes the current Pokémon's upgrades to 100% and only then switches to the strongest one you own. If you pick another one in the game, it keeps it.",
      "Big Pokémon (like Yveltal) show up whole in the panel.",
    ],
    '0.2.1': [
      'If Sobrevida is updated with the game open, the panel tells you and shows a "Reload now" button (before, the farm just sat waiting).',
      'Only one tab plays at a time: with two PokéSurvivor tabs open, the other one shows the farm is running in the first.',
    ],
    '0.2.0': [
      'Auto farm: in the heart menu, "Start farm" (or Alt+F). It plays by itself in a loop: dodges, picks up XP, chooses cards, enters rifts and opens chests.',
      'Between runs: claims missions, pulls gacha (Spectral Night during Halloween), switches to the best partner not at 100% yet and buys its upgrades.',
      'During Halloween it buys the witch skins with candy. Shows coins per hour and what it did.',
      'Farm runs never go to the leaderboard.',
    ],
    '0.1.0': [
      'Choose your partner before the quiz: a menu with the 29 starters, with the game\'s own sprites, types, starting move and stats.',
      'Sobrevida answers the 8 questions for you and you get exactly that Pokémon, even for the pairs the game picks at random.',
      '⭐ marks the best partner according to the game\'s leaderboard.',
    ],
  },
  es: {
    '0.6.0': [
      "Visual nuevo de la partida, al estilo del juego: tarjeta de tu Pokémon con el sprite animado, nivel, vida (verde, amarilla y roja, con el rastro del daño) y experiencia debajo.",
      "Buffs con temporizador: cada uno muestra las cargas, los segundos que quedan y una barrita, y parpadea en los 2 últimos segundos.",
      "Reloj con derrotados y monedas, panel del jefe con retrato y porcentaje, y barra de golpes con la recarga en forma de reloj y los segundos del golpe activo.",
      "Puedes volver al visual del juego en el menú de Sobrevida (\"Visual nuevo de la partida\"). También funciona con el farm apagado.",
    ],
    '0.5.0': [
      "Tienda Kecleon automática: entre partidas, el farm calcula cuánto más fuerte dejan al compañero cada naturaleza, cada habilidad y cada MT del día. Cuando compensa, compra la Menta, la Cápsula o la MT y la usa en la ficha del Pokémon, con los botones del juego.",
      "Solo compra cuando la ganancia supera el mínimo y rinde más por moneda que la siguiente mejora de Fuerza. También usa lo que ya está en la Mochila. Se puede desactivar en las Opciones del farm.",
      "Los cálculos ahora usan la naturaleza y la habilidad reales de cada Pokémon. El panel las muestra debajo de la build.",
    ],
    '0.4.1': [
      "El tutorial, las novedades y el aviso de versión nueva ahora solo aparecen fuera de la partida (en el menú). Si empieza una partida con uno abierto, se oculta y vuelve en el menú.",
      "Versión urgente: la partida en curso termina normalmente; el farm solo se pausa en el menú.",
    ],
    '0.4.0': [
      "Base de cálculo: Sobrevida lee del propio juego los datos de todos los Pokémon, golpes y enemigos y calcula, para cada Pokémon, el valor de cada golpe (daño por segundo, lado físico/especial, monotipo, clima y eficacia contra los enemigos que van a salir en la partida).",
      "Con eso el farm arma la build de cada Pokémon (2 ataques principales, potenciadores y el compañero de cambio) y elige cartas, mejoras y fusiones según ella. La build aparece en el panel del farm.",
      "Mejoras: además de comprarlas, el farm ahora configura el Golpe inicial, el Segundo golpe inicial y el Veto con la base de cálculo (veta primero los potenciadores fuera de la build y los golpes más flojos).",
      "Aprende jugando: mide el daño real de cada golpe en tus partidas y corrige los cálculos en las siguientes.",
      "El compañero más fuerte ahora se elige por la fuerza calculada de la build, y el farm se aparta de las embestidas de los enemigos que apuntan antes de correr.",
    ],
    '0.3.0': [
      "Cambio de ataque solo: justo después de que sale un golpe, el farm cambia al otro hueco, que el juego deja casi listo. Los potenciadores (Danza Espada, Fortaleza…) ahora se usan y se mantienen cargados. En el laboratorio, de 3 a 7 veces más daño por segundo.",
      "Esquiva los disparos por toda su trayectoria: en el laboratorio, el daño recibido de disparos bajó de 66 a menos de 20 por minuto.",
      "Prefiere el ataque súper eficaz contra el enemigo de turno.",
      "Build: coge un 3.er ataque como compañero de cambio y vuelve a entrar en las grietas después de fusionar sus ataques (tickets, ×10, monedas).",
    ],
    '0.2.6': [
      "El farm tiene dos modos separados en el menú del corazón: Solo (partidas en solitario en bucle, con misiones, gacha, compañero y mejoras) y En grupo (partidas con amigos: solo juega tu Pokémon y nunca toca el menú).",
      "En grupo: si creaste la sala, actívalo cuando quieras; como invitado, actívalo en la sala antes de que empiece la partida. El panel avisa si el modo elegido no sirve para la partida en la que estás.",
    ],
    '0.2.5': [
      "En la partida, la barrita de Sobrevida aparece siempre en la esquina superior derecha, aunque el farm esté apagado: haz clic para abrir el menú, o en \"Activar\" para que el farm tome el control al momento.",
      "Cooperativo: si creaste la sala, puedes activar el farm en medio de la partida en grupo. Como invitado, actívalo antes de que empiece.",
    ],
    '0.2.4': [
      "Cooperativo: el farm ahora juega en grupo con tus amigos, seas el anfitrión o un invitado. Activa el farm antes de que empiece la partida en grupo.",
      "En grupo, entre partidas el farm no toca el menú (ni gacha, ni cambio de compañero, ni partida en solitario) y no sale solo de la pantalla final.",
      "La partida en grupo con el farm no entra en el ranking, ni para tus amigos.",
    ],
    '0.2.3': [
      "En la partida, la barrita del farm ahora va en la esquina superior derecha, donde no tapa nada del juego.",
    ],
    '0.2.2': [
      "El farm ahora pelea con el jefe de la grieta y los jefes del mapa: se pone a la distancia del ataque que usas (pegado si es de cerca) en vez de solo huir. Con poca vida, vuelve a esquivar.",
      "En la pelea con jefes, el farm prefiere el ataque de largo alcance cuando es tan bueno como el otro.",
      "Compañero: el farm termina las mejoras del Pokémon actual hasta el 100% y solo después cambia al más fuerte que tengas. Si eliges otro en el juego, lo respeta.",
      "Los Pokémon grandes (como Yveltal) se ven enteros en el panel.",
    ],
    '0.2.1': [
      'Si Sobrevida se actualiza con el juego abierto, el panel avisa y muestra el botón "Recargar ahora" (antes el farm se quedaba esperando).',
      'Solo una pestaña juega a la vez: con dos pestañas de PokéSurvivor abiertas, la otra muestra que el farm está en la primera.',
    ],
    '0.2.0': [
      'Farm automático: en el menú del corazón, "Activar farm" (o Alt+F). Juega solo en bucle: esquiva, recoge experiencia, elige cartas, entra en grietas y abre cofres.',
      'Entre partidas: recoge misiones, tira el gacha (Noche Espectral en Halloween), cambia al mejor compañero que aún no está al 100% y compra sus mejoras.',
      'En Halloween compra las skins de bruja con los caramelos. Muestra monedas por hora y lo que hizo.',
      'Las partidas del farm nunca van al ranking.',
    ],
    '0.1.0': [
      'Elige a tu compañero antes del test: un menú con los 29 iniciales, con los sprites, tipos, movimiento inicial y estadísticas del propio juego.',
      'Sobrevida responde las 8 preguntas por ti y te toca justo ese Pokémon, incluso en las parejas que el juego sortea.',
      '⭐ marca el mejor compañero según el ranking del juego.',
    ],
  },
};
