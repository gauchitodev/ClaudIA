// The bank of payday scenes (lib/escenas.js): four per trade and a few for everybody. A scene is a situation with two
// or three numbered options. Every number is here, in the code, and the outcome is rolled: nothing is left to the AI.
//   op(name, chance, [mult, text], [mult, text], rep): chance % of going well; the first pair is what happens then,
//     the second what happens otherwise. mult multiplies the day's wage.
//   quieto(name, mult, text, rep): the "do nothing" option, with one sure outcome. Each scene has exactly one, and
//     it's what happens when nobody answers in time.
//   rep: what choosing it moves in the person's fame, whatever comes of it: picaro (+ pícaro, − honesto) and
//     valiente (+ valiente, − cagón).
// control: true marks the scenes where somebody inspects: a known pícaro gets them more often (ESCENA.PESO_CONTROL).
// pide: "picaro" | "honesto" | "valiente" | "cagon" marks a scene only someone with that fame gets.
// test/escenas.test.mjs checks the shape of all of this and that no option is a gift or a robbery.
const op = (nombre, chance, bien, mal, rep = {}) => ({ nombre, chance, bien, mal, rep });
const quieto = (nombre, mult, texto, rep = {}) => ({ nombre, chance: 100, bien: [mult, texto], mal: null, rep, pasiva: true });

export const ESCENAS = {
  tambero: [
    { id: "parto", texto: "Son las 3 de la mañana y la Manchada se pone a parir. Llueve de costado.", opciones: [
      op("Meter mano vos", 60, [1.7, "Sacaste el ternero vos solo, con barro hasta las cejas. Ternero sano, patrón contento."], [0.6, "Tiraste para el lado que no era. Hubo que llamar al veterinario igual, y de urgencia."], { valiente: 2 }),
      op("Llamar al veterinario", 85, [1.1, "El veterinario llegó en pijama y lo resolvió en diez minutos. Te cobró, pero salió bien."], [0.7, "El veterinario no atendió hasta las 7. La vaca se arregló sola y vos pagaste la visita igual."], { picaro: -1 }),
      quieto("Seguir durmiendo", 0.8, "Te diste vuelta en la cama. A la mañana había ternero, y un patrón que preguntaba dónde estabas.", { valiente: -2 }),
    ] },
    { id: "leche-aguada", texto: "La cooperativa paga por litro y el tanque quedó un poquito abajo de la marca. La manguera está ahí nomás.", control: true, opciones: [
      op("Estirarla con agua", 50, [1.8, "Nadie midió nada. Litros son litros."], [0.4, "Justo hoy tocaba análisis. Te devolvieron el tanque entero y una carta con membrete."], { picaro: 2, valiente: 1 }),
      quieto("Entregar lo que hay", 1, "Entregaste lo que había, que es lo que había.", { picaro: -1 }),
    ] },
    { id: "toro", texto: "El toro del vecino saltó el alambrado y está muy cómodo entre tus vaquillonas.", opciones: [
      op("Sacarlo a los gritos", 45, [1.6, "Lo corriste con una bolsa de ración y un palo. El toro te respetó, vaya uno a saber por qué."], [0.5, "El toro no te respetó. Terminaste arriba del tanque australiano hasta que se aburrió."], { valiente: 2 }),
      op("Cobrarle el servicio al vecino", 55, [1.5, "Le dijiste al vecino que el toro 'consumió'. Pagó por no discutir."], [0.7, "El vecino te pasó la cuenta al revés: el toro es de pedigrí y el servicio lo debés vos."], { picaro: 2 }),
      quieto("Esperar que se vaya solo", 0.9, "Se fue solo, a los dos días. En nueve meses te enterás de lo demás.", { valiente: -1 }),
    ] },
    { id: "ordenadora", texto: "Se rompió la ordeñadora y hay ochenta vacas mirándote con la ubre llena.", opciones: [
      op("Ordeñar a mano", 70, [1.5, "Ochenta vacas a mano. No sentís los dedos, pero la leche salió."], [0.7, "Llegaste a la vaca cuarenta y se te acalambró hasta el apellido."], { valiente: 1, picaro: -1 }),
      op("Arreglarla con alambre", 50, [1.6, "Alambre, cinta y fe. Anda mejor que antes."], [0.5, "El arreglo duró tres vacas y ahora hay que cambiar la bomba entera."], { picaro: 1 }),
      quieto("Esperar al técnico", 0.75, "El técnico venía 'en un rato'. Vino al otro día. Se perdió un ordeñe.", { valiente: -1 }),
    ] },
  ],
  camionero: [
    { id: "caminera", texto: "Te para la caminera en la ruta 5. Venís con exceso de carga y lo sabés.", control: true, opciones: [
      op("Coimear", 50, [1.5, "'¿No habrá forma de arreglarlo acá, jefe?' Había. Seguiste viaje con la carga entera."], [0.3, "El inspector era nuevo y con vocación. Multa, acta por intento de coima y sermón."], { picaro: 2, valiente: 1 }),
      op("Discutir", 40, [1.4, "Le discutiste la balanza, el decreto y la calibración. Te dejó ir por cansancio."], [0.5, "Discutiste tanto que te revisaron también las luces, las cubiertas y el matafuego."], { valiente: 2 }),
      quieto("Pagar la multa", 0.7, "Pagaste la multa sin chistar. Duele, pero dormís tranquilo.", { picaro: -1, valiente: -1 }),
    ] },
    { id: "atajo", texto: "El GPS te ofrece un atajo por un camino vecinal que ahorra una hora. Anoche llovió.", opciones: [
      op("Meterle por el atajo", 50, [1.7, "El camino estaba firme. Llegaste una hora antes y cobraste el premio por puntualidad."], [0.5, "Te enterraste hasta el eje. Te sacó un tractor que cobra por metro."], { valiente: 2 }),
      quieto("Seguir por la ruta", 1, "Seguiste por la ruta, a 80 y con la radio. Llegaste a la hora de siempre."),
    ] },
    { id: "carga-extra", texto: "En la estación un tipo te ofrece plata por llevarle 'unas cajitas' a Tacuarembó. No dice de qué.", control: true, opciones: [
      op("Llevarlas sin preguntar", 55, [1.8, "Eran repuestos de moto. O eso dijo el que las recibió. Plata fácil."], [0.3, "Las cajitas eran cigarrillos sin estampilla y Aduanas estaba en el peaje."], { picaro: 2, valiente: 1 }),
      op("Pedirle la factura", 70, [1.2, "Tenía factura y todo. Flete en regla, con propina por desconfiado."], [0.9, "El tipo se ofendió, agarró sus cajitas y se fue con otro."], { picaro: -2 }),
      quieto("Decirle que no", 1, "Le dijiste que no llevás nada que no esté en el remito. Viaje normal.", { picaro: -1, valiente: -1 }),
    ] },
    { id: "sueno", texto: "Van catorce horas de ruta, se te cierran los ojos y faltan 200 kilómetros.", opciones: [
      op("Mate, ventanilla y seguir", 55, [1.6, "Con mate lavado y cumbia al mango llegaste. Cobraste el viaje entero y el extra."], [0.4, "Cabeceaste, mordiste la banquina y reventaste dos cubiertas. Salió caro el apuro."], { valiente: 2 }),
      quieto("Parar a dormir", 0.85, "Dormiste cuatro horas en la cabina. Llegaste tarde y te descontaron la demora.", { valiente: -1 }),
    ] },
  ],
  peon: [
    { id: "potro", texto: "El patrón trajo un potro que ya tiró a tres domadores. Te mira a vos.", opciones: [
      op("Subirte", 45, [2, "Ocho corcovos y te quedaste arriba. El patrón sacó la billetera sin que le pidieras."], [0.5, "Volaste por arriba del palenque. El potro quedó invicto y vos, de reposo."], { valiente: 3 }),
      op("Decir que te duele la cintura", 80, [1, "Te creyeron lo de la cintura. Arreglaste alambrados todo el día."], [0.7, "Nadie te creyó lo de la cintura. Ahora te dicen 'el lumbalgia'."], { valiente: -2, picaro: 1 }),
      quieto("Hacerte el que no lo viste", 0.9, "Miraste para el molino hasta que subió otro. Jornal de siempre, con alguna cargada.", { valiente: -1 }),
    ] },
    { id: "oveja-menos", texto: "En el recuento falta una oveja. Vos sabés que el domingo hubo asado en el galpón.", control: true, opciones: [
      op("Echarle la culpa al zorro", 55, [1.3, "'Anda un zorro bravo, patrón.' El patrón mandó poner trampas y no preguntó más."], [0.4, "El patrón encontró el cuero colgado atrás del galpón. La oveja te la descontó a precio de exposición."], { picaro: 2 }),
      op("Confesar el asado", 60, [1.2, "Confesaste. El patrón se rio y preguntó por qué no lo invitaron."], [0.6, "Confesaste. Te la descontó y encima ahora cuenta las ovejas él."], { picaro: -2, valiente: 1 }),
      quieto("Contar de nuevo, despacito", 0.9, "Contaste tres veces, cada vez más lento. Faltaba igual. Te descontaron una parte.", { valiente: -1 }),
    ] },
    { id: "tormenta", texto: "Se viene una tormenta negra y hay doscientos novillos en el potrero del bajo, al lado del arroyo.", opciones: [
      op("Salir a traerlos", 60, [1.8, "Los sacaste con el agua en los estribos. No se perdió ni uno."], [0.6, "Te agarró la piedra a mitad de camino. Volviste con la mitad y el caballo ofendido."], { valiente: 2 }),
      quieto("Quedarte en el galpón", 0.75, "Tomaste mate mirando llover. El arroyo se llevó tres novillos y parte de tu jornal.", { valiente: -2 }),
    ] },
    { id: "esquila", texto: "Zafra de esquila: pagan por oveja, y el capataz no mira cómo queda, mira cuántas van.", opciones: [
      op("Esquilar a lo bruto", 55, [1.7, "Sesenta ovejas en la mañana. Quedaron medio escalonadas, pero la planilla dice sesenta."], [0.5, "Le hiciste un tajo a un carnero de cabaña. Te lo descontaron con veterinario incluido."], { picaro: 1, valiente: 1 }),
      quieto("Esquilar prolijo", 1, "Esquilaste prolijo, a tu ritmo. Menos ovejas, ninguna queja.", { picaro: -1 }),
    ] },
  ],
  guardavidas: [
    { id: "bandera-roja", texto: "Bandera roja, mar picado, y un turista argentino se mete igual 'porque él sabe nadar'.", opciones: [
      op("Meterte a sacarlo", 65, [1.8, "Lo sacaste de los pelos. La familia te dio propina en dólares."], [0.6, "Lo sacaste, pero la tabla quedó en las rocas y te la cobraron."], { valiente: 2 }),
      op("Pitarle desde la silla", 50, [1.1, "Al décimo pitazo salió, enojado. Nadie se ahogó."], [0.5, "Hubo que llamar a Prefectura. En el informe figura que no te moviste de la silla."], { valiente: -2 }),
      quieto("Mirar para otro lado", 0.7, "Salió solo, de milagro. Lo filmaron con vos de fondo mirando el celular.", { valiente: -2, picaro: 1 }),
    ] },
    { id: "sombrillas", texto: "El de las sombrillas te ofrece una comisión por mandarle gente 'porque ahí es más seguro bañarse'.", control: true, opciones: [
      op("Aceptar la comisión", 60, [1.6, "'Bañarse acá es más seguro, señora.' Sombrillas llenas, sobre para vos."], [0.5, "Un vecino te denunció en la intendencia. Suspendido el fin de semana."], { picaro: 2 }),
      quieto("Decirle que no", 1, "Le dijiste que el mar es el mismo en todos lados. Sueldo de siempre.", { picaro: -2 }),
    ] },
    { id: "aguaviva", texto: "Una aguaviva picó a un nene y la madre te exige que 'hagas algo ya'.", opciones: [
      op("Vinagre y calma", 80, [1.3, "Vinagre, agua de mar y paciencia. La madre te quiso adoptar."], [0.8, "No tenías vinagre en el botiquín. Fuiste a pedir al parador y quedaste pegado."], { picaro: -1 }),
      op("El remedio de la abuela", 40, [1.5, "Arena tibia y un verso. Al nene se le pasó de puro asombro."], [0.5, "El remedio de la abuela lo empeoró. La madre te hizo una reseña de una estrella."], { picaro: 1, valiente: 1 }),
      quieto("Mandarlos a la policlínica", 0.9, "Los mandaste a la policlínica, que queda a doce cuadras. Cumpliste, digamos.", { valiente: -1 }),
    ] },
    { id: "lobo-marino", texto: "Un lobo marino se echó a dormir en el medio de la playa y la gente se saca selfies a medio metro.", opciones: [
      op("Correr a la gente", 65, [1.4, "Armaste un perímetro con sillas y cara de pocos amigos. Salió en el noticiero."], [0.7, "Un veraneante te discutió que la playa es pública. El lobo aplaudía."], { valiente: 1 }),
      op("Correr al lobo", 35, [2, "Lo arreaste al agua con un toallón. Nadie sabe cómo. Vos tampoco."], [0.4, "El lobo te corrió a vos. Hay video, tiene música de Benny Hill."], { valiente: 3 }),
      quieto("Dejarlo dormir", 0.9, "Lo dejaste dormir. Se fue con la marea, después de morder una heladerita.", { valiente: -1 }),
    ] },
  ],
  chofer: [
    { id: "boleto", texto: "Sube una señora con un billete de 2000 para un boleto, y no tenés cambio.", opciones: [
      op("Dejarla pasar gratis", 70, [1.2, "La dejaste pasar. Te bendijo a vos y a toda tu familia, y el pasaje aplaudió."], [0.7, "Justo arriba iba el inspector. El boleto de la señora salió de tu bolsillo, con recargo."], { picaro: -1, valiente: 1 }),
      op("Quedarte el vuelto 'a cuenta'", 45, [1.6, "'En la terminal le doy el vuelto, doña.' La doña se bajó antes."], [0.4, "La doña se acordó, fue a la terminal y pidió el libro de quejas."], { picaro: 3 }),
      quieto("Hacerla bajar", 0.9, "La hiciste bajar a buscar cambio. El ómnibus entero te miró feo hasta Durazno.", { valiente: -1 }),
    ] },
    { id: "atrasado", texto: "Salís veinte minutos atrasado y en la terminal te espera el encargado con el reloj en la mano.", opciones: [
      op("Pisarlo en la ruta", 50, [1.6, "Recuperaste los veinte minutos. Los pasajeros llegaron peinados para atrás."], [0.4, "Radar en Florida. La foto salió divina y la multa también."], { valiente: 2, picaro: 1 }),
      op("Saltearte un par de paradas", 55, [1.4, "Nadie esperaba en esas paradas. Llegaste en hora."], [0.6, "En una de las paradas esperaba la cuñada del dueño."], { picaro: 2 }),
      quieto("Llegar tarde nomás", 0.8, "Llegaste veinte minutos tarde y te comiste el descuento y el discurso.", { picaro: -1 }),
    ] },
    { id: "encomienda", texto: "Un gaucho te para en la ruta con un lechón vivo: quiere mandarlo de encomienda a Montevideo.", control: true, opciones: [
      op("Llevarlo en la bodega, por unos pesos", 55, [1.7, "El lechón viajó callado entre las valijas. Plata en mano, sin boleta."], [0.4, "El lechón se soltó en Canelones y recorrió el pasillo. Hubo acta."], { picaro: 2, valiente: 1 }),
      quieto("Explicarle que no se puede", 1, "Le explicaste el reglamento. El gaucho y el lechón te miraron con la misma cara.", { picaro: -1 }),
    ] },
    { id: "pasajero-pesado", texto: "Un pasajero tomado no para de cantar a los gritos y el resto te mira por el espejo.", opciones: [
      op("Pararle el carro", 60, [1.5, "Paraste el ómnibus, te diste vuelta y hubo silencio hasta Montevideo. Te aplaudieron."], [0.6, "El hombre se ofendió y te tiró el termo. Hubo que parar en la comisaría."], { valiente: 2 }),
      op("Subir la radio", 70, [1.1, "Subiste la radio. Ahora cantaban los dos, pero afinado."], [0.8, "Con la radio cantó más fuerte. Tres pasajeros pidieron la devolución."], { valiente: -1 }),
      quieto("Hacerte el sordo", 0.9, "Manejaste mirando al frente cuatro horas. El libro de quejas quedó lleno.", { valiente: -2 }),
    ] },
  ],
  oficinista: [
    { id: "error-planilla", texto: "Encontrás un error en la planilla que ya se mandó a la gerencia. La hiciste vos.", opciones: [
      op("Avisar del error", 65, [1.4, "Avisaste antes de que nadie lo viera. Te felicitaron por 'proactivo'."], [0.7, "Avisaste y te tocó rehacer el trimestre entero, sin horas extra."], { picaro: -2, valiente: 1 }),
      op("Echarle la culpa al sistema", 55, [1.3, "'Fue la migración.' Nadie sabe qué es la migración, así que pasó."], [0.5, "El de sistemas trajo el historial de cambios. Con tu usuario y la hora."], { picaro: 2 }),
      quieto("Callarte y rezar", 0.85, "No dijiste nada. Lo encontraron a la semana y hubo descuento parejo para el sector.", { valiente: -2 }),
    ] },
    { id: "viaticos", texto: "Rendición de viáticos: te falta una boleta, y el del bar de abajo tiene el talonario flojo.", control: true, opciones: [
      op("Pedirle una boleta 'generosa'", 50, [1.7, "Almuerzo ejecutivo para seis, dice la boleta. Comiste una empanada."], [0.3, "Auditoría cruzó las boletas con el bar. El bar no abre los feriados."], { picaro: 3 }),
      quieto("Rendir lo que hay", 0.95, "Rendiste lo que tenías y pusiste la diferencia de tu bolsillo.", { picaro: -1 }),
    ] },
    { id: "reunion", texto: "Reunión de las cinco de la tarde un viernes. El gerente pregunta: '¿alguien tiene algo más?'", opciones: [
      op("Proponer tu idea", 50, [1.8, "Tu idea le gustó al gerente, que ya la está contando como suya. Pero hubo bono."], [0.6, "Tu idea generó otra reunión. El lunes a las ocho. Tus compañeros no te saludan."], { valiente: 2 }),
      quieto("Mirar la mesa", 1, "Miraste la mesa con mucha atención. A las cinco y diez estabas afuera.", { valiente: -1 }),
    ] },
    { id: "cafe", texto: "Se rompió la cafetera de la oficina y hay una colecta. Vos manejás la plata.", control: true, opciones: [
      op("Comprar la más barata y guardarte la diferencia", 55, [1.5, "Compraste una de feria. Hace café con gusto a cable, pero nadie hizo cuentas."], [0.4, "La cafetera duró dos días y alguien pidió ver la boleta."], { picaro: 2 }),
      op("Comprar una buena y rendir cuentas", 80, [1.2, "Cafetera buena, boleta pegada en la cartelera. Sos leyenda en el piso 3."], [0.9, "Rendiste al peso, y alguno igual dijo que era cara."], { picaro: -2 }),
      quieto("Pasarle la colecta a otro", 1, "Le pasaste el sobre a la de Recursos Humanos. Un problema menos.", { valiente: -1 }),
    ] },
  ],
  dj: [
    { id: "patovica", texto: "En la puerta del boliche el patovica no te deja entrar el equipo: 'no figurás en la lista'.", opciones: [
      op("Plantarte", 50, [1.6, "'Sin mí no hay fiesta, maestro.' Llamó al dueño, y el dueño te abrió con disculpas."], [0.5, "El patovica mide dos metros y no escucha razones. Tocaste una hora tarde y cobraste menos."], { valiente: 2 }),
      op("Entrar por la cocina", 60, [1.4, "Entraste por atrás con los parlantes entre los cajones de cerveza. Nadie se enteró."], [0.6, "Te agarró el de seguridad de la cocina, que es el hermano del de la puerta."], { picaro: 2 }),
      quieto("Esperar al dueño", 0.8, "Esperaste al dueño en la vereda con los bafles. Llegó a las dos. Tocaste media noche.", { valiente: -1 }),
    ] },
    { id: "pedido", texto: "El padre de la quinceañera te pide, billete en mano, que pongas a Los Wawancó. La quinceañera te pidió todo lo contrario.", opciones: [
      op("Agarrar el billete", 60, [1.6, "Sonó Los Wawancó. Los tíos coparon la pista y el padre dobló la propina."], [0.6, "La quinceañera lloró en el medio de la pista. El padre te descontó 'por arruinar el cumple'."], { picaro: 2 }),
      op("Mezclar las dos cosas", 45, [1.8, "Cumbia vieja con base de trap. Bailaron los tíos y las amigas. Sos un genio."], [0.6, "La mezcla no la bailó nadie. Pista vacía y la torta antes de hora."], { valiente: 2 }),
      quieto("Respetar la lista", 1, "Pusiste lo que decía la lista. El padre se guardó el billete.", { picaro: -1 }),
    ] },
    { id: "corte-luz", texto: "Fiesta al mango y se corta la luz en toda la cuadra.", opciones: [
      op("Seguir a capela con un bombo", 50, [1.9, "Conseguiste un bombo, armaste una murga improvisada y nadie se fue. Noche histórica."], [0.6, "Tu voz no era para eso. La gente se fue yendo de a poco, con respeto."], { valiente: 2 }),
      op("Cobrar igual, 'la luz no es problema mío'", 55, [1.3, "Cobraste la noche entera con el contrato en la mano."], [0.6, "El dueño tampoco considera que sea problema suyo. Cobraste la mitad y perdiste el cliente."], { picaro: 2 }),
      quieto("Esperar que vuelva", 0.8, "La luz volvió a las cuatro. Quedaban el mozo y dos primos.", { valiente: -1 }),
    ] },
    { id: "pendrive", texto: "Llegás al casamiento y el pendrive con la música quedó en tu casa. El vals es en diez minutos.", opciones: [
      op("Tocar desde el celular con datos", 55, [1.5, "El vals salió de YouTube. Nadie notó el aviso de seguros en el medio. Bueno, casi nadie."], [0.5, "Se cortó la señal en pleno vals. Los novios bailaron el tono de llamada."], { picaro: 1, valiente: 1 }),
      op("Confesarle al novio", 60, [1.2, "El novio tenía una playlist y te salvó. Le hiciste precio."], [0.6, "El novio se lo contó a la suegra. La suegra te descontó."], { picaro: -2 }),
      quieto("Estirar con el micrófono", 0.85, "Animaste media hora con chistes mientras tu primo traía el pendrive. Larguísima media hora.", { valiente: -1 }),
    ] },
  ],
  mecanico: [
    { id: "ruidito", texto: "Un cliente trae el auto por 'un ruidito'. Era una moneda suelta en el cenicero.", control: true, opciones: [
      op("Cobrarle 'tren delantero'", 55, [1.8, "'Era el tren delantero, quedó como nuevo.' Pagó agradecido."], [0.3, "El cliente es perito de una aseguradora. Pidió ver las piezas cambiadas."], { picaro: 3 }),
      quieto("Devolverle la moneda", 1, "Le devolviste la moneda y le cobraste la revisión. Va a volver.", { picaro: -2 }),
    ] },
    { id: "repuesto", texto: "El repuesto original demora quince días. En la feria hay uno 'igualito' por la tercera parte.", opciones: [
      op("Poner el de la feria", 55, [1.6, "El de la feria anduvo perfecto. La diferencia quedó en casa."], [0.4, "Duró cuarenta kilómetros. Hubo que hacerlo de nuevo, gratis y con grúa."], { picaro: 2 }),
      op("Fabricarlo vos en el torno", 45, [1.9, "Lo hiciste en el torno, mejor que el de fábrica. El cliente te recomendó a medio pueblo."], [0.6, "Tres intentos y medio día de torno para terminar pidiendo el original igual."], { valiente: 2 }),
      quieto("Esperar el original", 0.85, "Esperaste el original. Quince días con el auto ocupando el elevador.", { picaro: -1 }),
    ] },
    { id: "auto-patron", texto: "El dueño de la automotora deja su camioneta nueva 'para un service rapidito'. Las llaves quedan puestas y es viernes.", control: true, opciones: [
      op("Dar una vueltita de prueba, larga", 50, [1.4, "Fuiste hasta la rambla y volviste. 'Prueba de ruta', anotaste en la orden."], [0.3, "Un bollo en el estacionamiento del súper. No hay prueba de ruta que lo explique."], { picaro: 2, valiente: 1 }),
      quieto("Service y nada más", 1, "Aceite, filtros y las llaves al tablero. Aburrido y correcto.", { picaro: -1 }),
    ] },
    { id: "cosechadora", texto: "Plena zafra: se trancó una cosechadora en el medio del campo y te vienen a buscar un domingo.", opciones: [
      op("Ir y cobrar urgencia", 65, [1.7, "La arreglaste en el campo, con el sol en la nuca. Tarifa de domingo y un cordero de regalo."], [0.7, "Era la computadora, no los fierros. Perdiste el domingo y cobraste la visita."], { valiente: 2 }),
      quieto("Decir que hasta el lunes no", 0.9, "Dijiste que el lunes. El lunes ya la había arreglado el de la competencia.", { valiente: -1 }),
    ] },
  ],
  mozo: [
    { id: "cuenta", texto: "Una mesa de ocho pide la cuenta. Ya van por la cuarta botella y nadie está para sumar.", control: true, opciones: [
      op("Agregar un postre fantasma", 55, [1.6, "Un flan que nadie pidió, repartido entre ocho. Nadie miró."], [0.3, "Uno era contador. Sumó con el celular y llamó al encargado."], { picaro: 3 }),
      quieto("Cobrar lo que es", 1.05, "Cobraste lo justo. Dejaron el diez por ciento, redondeado para abajo.", { picaro: -1 }),
    ] },
    { id: "mosca", texto: "Un cliente te llama con el dedo: hay una mosca en la sopa. El cocinero está de malas.", opciones: [
      op("Enfrentar al cocinero", 50, [1.5, "Le plantaste el plato en la mesada. Hizo otra sopa, rezongando. El cliente dejó propina grande."], [0.6, "El cocinero te tiró con un repasador y la sopa nueva salió de tu sueldo."], { valiente: 2 }),
      op("Decir que es pimienta", 40, [1.4, "'Es pimienta de Cayena, señor.' El señor se la tomó."], [0.4, "La pimienta salió volando. Hay una reseña con foto."], { picaro: 2, valiente: 1 }),
      quieto("Cambiar el plato y pedir disculpas", 0.9, "Cambiaste el plato, pediste disculpas y pagaste la sopa a medias con la casa.", { picaro: -1 }),
    ] },
    { id: "bandeja", texto: "Sábado a la noche, salón lleno, y faltó tu compañero. Hay doce mesas para vos solo.", opciones: [
      op("Llevar todo junto", 50, [1.9, "Cuatro platos por brazo, como en el circo. Propinas de todas las mesas."], [0.5, "Cuatro platos por brazo, hasta el escalón. Se escuchó desde la vereda."], { valiente: 2 }),
      quieto("Ir de a una mesa", 0.9, "Fuiste de a una. Nadie se quemó, y la mesa doce cenó a la una de la mañana.", { valiente: -1 }),
    ] },
    { id: "propina-caja", texto: "Las propinas van a un frasco común. Una mesa te dejó un billete grande a vos en la mano.", control: true, opciones: [
      op("Al bolsillo", 60, [1.6, "Al bolsillo y cara de póker. El frasco ni se enteró."], [0.4, "La cajera vio todo por el espejo de la barra. Asamblea de mozos."], { picaro: 2 }),
      quieto("Al frasco", 1.1, "Fue al frasco. Tus compañeros te miran distinto, y te tocó tu parte.", { picaro: -2 }),
    ] },
  ],
  feriante: [
    { id: "balanza", texto: "La balanza del puesto pesa 'un poquito de más' desde que se cayó. Arreglarla sale plata.", control: true, opciones: [
      op("Dejarla así", 55, [1.6, "Cada kilo tuyo tiene 900 gramos y mucho cariño. Buena feria."], [0.3, "Cayó el inspector de la IMM con una pesa patrón. Multa y balanza precintada."], { picaro: 3 }),
      quieto("Arreglarla", 0.9, "La mandaste a arreglar. El kilo volvió a pesar un kilo y la caja lo sintió.", { picaro: -2 }),
    ] },
    { id: "cajon-pasado", texto: "Te quedó un cajón de duraznos que mañana ya no se vende. La feria termina en una hora.", opciones: [
      op("'¡Especiales para dulce!'", 65, [1.5, "Los vendiste a precio de oferta como 'especiales para dulce'. Técnicamente cierto."], [0.7, "Nadie quería hacer dulce. Volviste con el cajón y las moscas."], { picaro: 1 }),
      op("Ponerlos abajo de los buenos", 50, [1.7, "Arriba los lindos, abajo los otros. Se fue el cajón entero."], [0.4, "Una clienta de toda la vida abrió la bolsa en el puesto. Perdiste la clienta y la cuadra."], { picaro: 2 }),
      quieto("Regalarlos", 0.85, "Los regalaste al final de la feria. Plata no, pero la vecina te trajo dulce.", { picaro: -2 }),
    ] },
    { id: "lugar", texto: "Llegás a las 4 de la mañana y un puesto nuevo está armado en TU lugar de hace quince años.", opciones: [
      op("Plantarte y que se corra", 55, [1.6, "Le explicaste la antigüedad con el toldo en la mano. Se corrió. Vendiste como siempre."], [0.5, "Se armó. Vino el inspector y los mandó a los dos al fondo, al lado del baño químico."], { valiente: 2 }),
      op("Armar al lado y bajarle los precios", 55, [1.5, "Le clavaste todo diez pesos menos. A las diez levantó y se fue."], [0.7, "Bajó él también. Los dos vendieron a pérdida y ganó la clientela."], { picaro: 2 }),
      quieto("Armar donde haya lugar", 0.8, "Armaste en la otra punta. Tus clientes te encontraron a las once, cuando ya habían comprado.", { valiente: -2 }),
    ] },
    { id: "billete", texto: "Una señora mayor te paga con un billete de mil. Al tacto, el billete es más falso que promesa de campaña.", opciones: [
      op("Pasárselo al próximo como vuelto", 50, [1.3, "El billete siguió su camino por la feria. No es tu problema. Ya no."], [0.4, "El próximo era policía de civil comprando acelga."], { picaro: 3 }),
      op("Decírselo con cuidado", 75, [1.2, "La señora se puso colorada y pagó con otro. Te dejó un 'Dios te lo pague' y dos de propina."], [0.8, "La señora se ofendió, devolvió los tomates y te hizo fama de desconfiado."], { picaro: -2, valiente: 1 }),
      quieto("Aceptarlo y comerte la pérdida", 0.7, "Lo aceptaste por no hacerle pasar vergüenza. Mil pesos de papel pintado.", { valiente: -1, picaro: -1 }),
    ] },
  ],
  taxista: [
    { id: "turista", texto: "Sube un turista en Tres Cruces: va a Pocitos y no tiene idea de dónde queda.", control: true, opciones: [
      op("Pasearlo por el Cerro", 55, [1.8, "City tour completo: Cerro, Prado y rambla. Pagó contento y sacó fotos."], [0.3, "Tenía el mapa abierto en el celular. Denuncia en la Intendencia y viaje gratis."], { picaro: 3 }),
      quieto("Ir derecho", 1, "Fuiste derecho por Bulevar. Diez minutos y a otra cosa.", { picaro: -1 }),
    ] },
    { id: "parto-taxi", texto: "Sube una embarazada con contracciones cada dos minutos. El Pereira Rossell queda a veinte cuadras y hay embotellamiento.", opciones: [
      op("Meterle por la vereda", 60, [1.9, "Vereda, contramano y bocina. Llegaron. Al bebé le pusieron tu nombre de segundo."], [0.6, "Llegaron, pero con una multa por cada cuadra y sin paragolpes."], { valiente: 3 }),
      op("Llamar a la ambulancia y esperar", 70, [1, "La ambulancia llegó enseguida. Vos cobraste la bajada de bandera."], [0.6, "La ambulancia no llegó a tiempo y el tapizado de atrás hay que cambiarlo entero."], { valiente: -2 }),
      quieto("Seguir en el embotellamiento", 0.8, "Fuiste a paso de hombre tocando bocina. Llegaron justo. Nadie te dio las gracias.", { valiente: -1 }),
    ] },
    { id: "olvido", texto: "Al limpiar el asiento de atrás encontrás una billetera gorda. Hay cédula y dirección.", control: true, opciones: [
      op("Devolverla", 70, [1.6, "La devolviste entera. El dueño te dio una recompensa y salió en la radio."], [0.9, "La devolviste y el dueño contó los billetes delante tuyo, dos veces."], { picaro: -3 }),
      op("Devolverla más flaca", 50, [1.5, "Devolviste la billetera 'como la encontraste'. El dueño agradeció igual."], [0.3, "El dueño sabía exactamente cuánto llevaba. Y tu número de móvil."], { picaro: 3 }),
      quieto("Dejarla en la base", 1, "La dejaste en la base para que se arreglen ellos.", { valiente: -1 }),
    ] },
    { id: "madrugada", texto: "Cuatro de la mañana. Te hacen seña tres tipos en una esquina oscura: quieren ir 'hasta el fondo de la Gruta'.", opciones: [
      op("Llevarlos", 55, [1.8, "Eran panaderos que entraban a las cinco. Pagaron de más y te dieron bizcochos."], [0.3, "No eran panaderos. Te quedaste sin la recaudación y sin el celular."], { valiente: 3 }),
      quieto("Seguir de largo", 0.9, "Pasaste mirando para adelante. Viaje perdido, taxi entero.", { valiente: -2 }),
    ] },
  ],
  enfermero: [
    { id: "guardia", texto: "Faltó el relevo y te piden que te quedes otro turno. Ya van doce horas.", opciones: [
      op("Quedarte", 70, [1.6, "Veinticuatro horas de corrido. Cobraste el doble y dormiste parado en el ascensor."], [0.8, "Te quedaste, y a la hora dieciocho pusiste un suero al revés. Nada grave, pero quedó anotado."], { valiente: 2, picaro: -1 }),
      op("Negociar el recargo primero", 55, [1.6, "'Me quedo, pero con nocturnidad y feriado.' Firmaron. Sindicalista de alma."], [0.7, "Mientras negociabas apareció otro que se quedaba sin pedir nada."], { picaro: 2 }),
      quieto("Irte a tu casa", 0.9, "Marcaste tarjeta y te fuiste. El jefe de piso se acordó de vos al armar los francos.", { valiente: -1 }),
    ] },
    { id: "familiar", texto: "Un familiar furioso exige a los gritos ver 'al médico de verdad'. El médico está en el quirófano.", opciones: [
      op("Pararlo en seco", 55, [1.5, "'Acá se habla bajo o se espera afuera.' Se sentó. El piso entero te respeta."], [0.6, "Gritó más. Vino seguridad, hubo acta, y te tocó declarar en tu día libre."], { valiente: 2 }),
      op("Decirle que sos el médico", 40, [1.6, "Túnica cerrada, voz grave. Se calmó y hasta te dijo doctor."], [0.3, "Apareció el médico de verdad en el medio de tu explicación."], { picaro: 3 }),
      quieto("Dejarlo gritar", 0.9, "Lo dejaste gritar hasta que se cansó. Cuarenta minutos, cronometrados.", { valiente: -2 }),
    ] },
    { id: "muestras", texto: "Un visitador médico te ofrece 'una atención' si le recomendás su marca a los pacientes.", control: true, opciones: [
      op("Aceptar la atención", 55, [1.6, "Lapiceras, un termo y un sobre. La marca es buena, te decís."], [0.4, "La dirección se enteró por otro visitador, celoso. Sumario."], { picaro: 2 }),
      quieto("Decirle que hable con farmacia", 1, "Lo mandaste a farmacia. Te quedaste con una lapicera, que eso no es delito.", { picaro: -2 }),
    ] },
    { id: "vena", texto: "Paciente con venas imposibles. Dos colegas ya fallaron y te lo pasan a vos, con público.", opciones: [
      op("A la primera, sin mirar", 50, [1.8, "Entró a la primera. El paciente pidió que de ahora en más fueras siempre vos."], [0.6, "Tercer pinchazo fallido del día. El paciente pidió por favor que fuera cualquier otro."], { valiente: 2 }),
      quieto("Llamar al de anestesia", 0.95, "Llamaste al anestesista, que la agarró con ecógrafo. Sin gloria y sin moretón.", { valiente: -1 }),
    ] },
  ],
  maestra: [
    { id: "inspectora", texto: "Cae la inspectora sin avisar. La planificación de este mes no está hecha.", control: true, opciones: [
      op("Mostrarle la del año pasado", 50, [1.4, "Le cambiaste la fecha con corrector. 'Muy completa', anotó."], [0.4, "La inspectora era la misma del año pasado. Reconoció hasta la mancha de mate."], { picaro: 3 }),
      op("Decirle la verdad", 65, [1.3, "Le dijiste que entre el comedor y los piojos no hubo tiempo. Te entendió."], [0.7, "Te entendió, y te lo anotó igual en el informe."], { picaro: -2, valiente: 1 }),
      quieto("Improvisar una clase", 0.9, "Diste una clase de lo que saliera. Salió el ciclo del agua, otra vez.", { valiente: -1 }),
    ] },
    { id: "padre", texto: "Un padre viene a exigir que le cambies la nota al hijo. Es el dueño de la barraca que dona los materiales.", opciones: [
      op("Mantener la nota", 60, [1.5, "La nota quedó. El padre se fue rezongando y la directora te bancó."], [0.6, "La nota quedó, y la escuela sin donación de pintura este año."], { valiente: 2, picaro: -2 }),
      op("Subirle un puntito", 60, [1.3, "Un puntito 'por participación'. Llegaron dos baldes de pintura."], [0.5, "Los otros padres se enteraron. Ahora hay fila en la puerta."], { picaro: 2, valiente: -1 }),
      quieto("Derivarlo a la directora", 0.95, "Lo mandaste a hablar con la directora. Que para algo cobra más.", { valiente: -1 }),
    ] },
    { id: "paseo", texto: "Paseo al zoológico: en el recuento del ómnibus de vuelta te falta un gurí.", opciones: [
      op("Volver corriendo a buscarlo", 70, [1.5, "Estaba mirando los monos, lo más tranquilo. Nadie se enteró."], [0.7, "Estaba en la boletería, con megáfono, diciendo tu nombre completo."], { valiente: 2 }),
      op("Contar de nuevo, por las dudas", 50, [1.1, "Estaba abajo del asiento. Susto y nada más."], [0.5, "Contaste tres veces mientras el ómnibus arrancaba. Hubo que volver desde el peaje."], { valiente: -2 }),
      quieto("Avisar a la directora", 0.8, "Llamaste a la directora. Apareció el gurí, y también un acta.", { picaro: -1, valiente: -1 }),
    ] },
    { id: "rifa", texto: "Te toca vender las rifas de la comisión de fomento. Te quedan cuarenta números y el sorteo es mañana.", opciones: [
      op("Encajárselas a los padres en la salida", 60, [1.5, "Nadie le dice que no a la maestra. Cuarenta números en diez minutos."], [0.7, "Los padres salieron por el portón del fondo."], { picaro: 1, valiente: 1 }),
      op("Anotarlas a nombre tuyo y jugar", 30, [2.4, "Compraste los cuarenta. Ganaste la canasta, el lechón y el segundo premio."], [0.5, "Compraste los cuarenta y salió el número de la portera."], { valiente: 2 }),
      quieto("Devolver las que sobran", 0.9, "Devolviste los números. La comisión te mira como si hubieras faltado a la patria.", { valiente: -1 }),
    ] },
  ],
  futbolista: [
    { id: "penal", texto: "Minuto 90, penal a favor, cancha llena. El técnico pregunta quién lo patea.", opciones: [
      op("Pedir la pelota", 55, [2, "A un palo, el arquero al otro. Premio por partido ganado y tapa del diario del pueblo."], [0.5, "A la tribuna. La pelota todavía no apareció."], { valiente: 3 }),
      quieto("Atarte los cordones", 0.9, "Te agachaste a atarte los cordones hasta que pateó otro.", { valiente: -2 }),
    ] },
    { id: "simular", texto: "Te rozan en el área. El juez está lejos y de espaldas.", control: true, opciones: [
      op("Tirarte y rodar", 50, [1.7, "Tres vueltas y un grito. Penal. El Oscar es tuyo."], [0.4, "El línea vio todo. Amarilla por simular, y el video está en todos los grupos."], { picaro: 3 }),
      quieto("Seguir la jugada", 1, "Seguiste de pie. La jugada murió en el córner, con honor.", { picaro: -2 }),
    ] },
    { id: "barra", texto: "Perdieron el clásico 4 a 0 y la barra espera en la puerta del vestuario.", opciones: [
      op("Salir a dar la cara", 50, [1.5, "Hablaste con el capo de la barra. Te respetaron por salir. Los demás se fueron por el techo."], [0.5, "Diste la cara y te la devolvieron cambiada."], { valiente: 3 }),
      op("Salir en el baúl del utilero", 75, [1, "Saliste en el baúl, entre las pelotas. Digno no, pero entero."], [0.7, "El utilero paró a cargar nafta justo enfrente a la sede."], { valiente: -3 }),
      quieto("Esperar adentro", 0.85, "Te quedaste en el vestuario hasta las dos de la mañana. Te perdiste el ómnibus.", { valiente: -1 }),
    ] },
    { id: "representante", texto: "Un tipo de lentes oscuros dice ser representante y te ofrece una prueba en Europa. Hay que poner 'una platita para los trámites'.", opciones: [
      op("Poner la platita", 30, [2.4, "Era verdad. Bueno, Europa no: la B de Chipre. Pero firmaste y cobraste prima."], [0.4, "El tipo, los lentes y la platita se fueron en el mismo ómnibus."], { valiente: 2 }),
      op("Pedirle la platita a él", 50, [1.5, "'Si soy tan bueno, adelantame algo vos.' Te adelantó. Nunca más lo viste."], [0.8, "Se ofendió y se fue a hablar con el nueve."], { picaro: 2 }),
      quieto("Decirle que no", 1, "Le dijiste que no. Seguís en el ascenso, con la plata en el bolsillo.", { valiente: -1 }),
    ] },
  ],
  naranjita: [
    { id: "municipal", texto: "Aparece la camioneta de la Intendencia en la esquina. Tenés la cuadra llena.", control: true, opciones: [
      op("Quedarte y decir que sos vecino", 45, [1.6, "'Yo vivo acá, estoy esperando a mi cuñado.' Con el trapo en el bolsillo. Coló."], [0.4, "El inspector te conoce: te tiene visto en cuatro cuadras distintas."], { picaro: 2, valiente: 2 }),
      quieto("Hacerte humo", 0.7, "Desapareciste media hora. Cuando volviste, la mitad de los autos se había ido sin pagar.", { valiente: -2 }),
    ] },
    { id: "auto-caro", texto: "Estaciona un auto alemán que vale más que la cuadra. El dueño te tira: 'me lo cuidás bien, ¿no?'", opciones: [
      op("Tarifa especial, por adelantado", 50, [1.7, "'Este es premium, jefe.' Pagó sin discutir, para no quedar de rata."], [0.6, "Pagó, y a la vuelta te descontó un rayón que ya traía."], { picaro: 2 }),
      op("Cuidarlo de verdad", 75, [1.4, "No te moviste de al lado. Hasta le espantaste una paloma. Billete grande."], [0.8, "Lo cuidaste dos horas y te dejó monedas. De las chicas."], { picaro: -2 }),
      quieto("A la gorra, como todos", 1, "Le dijiste que a voluntad. Su voluntad fue promedio."),
    ] },
    { id: "competencia", texto: "Otro cuidacoches se instaló en la otra punta de TU cuadra y ya está cobrando.", opciones: [
      op("Ir a marcarle la cancha", 50, [1.6, "Charla corta, con gestos. Se mudó a la otra cuadra."], [0.5, "Era más grande de cerca. Ahora la cuadra es de él y vos tenés la mitad del fondo."], { valiente: 3 }),
      op("Proponerle sociedad", 60, [1.4, "Sociedad anónima: él los pares, vos los impares. Se llenan las dos veredas."], [0.7, "Aceptó la sociedad. Ya te está debiendo tres días."], { picaro: 1 }),
      quieto("Dejarlo pasar", 0.8, "Te quedaste con tu media cuadra y la bronca.", { valiente: -2 }),
    ] },
    { id: "llaves", texto: "Un apurado te deja las llaves: 'estacionámelo vos, flaco, que llego tarde'. No tenés libreta.", opciones: [
      op("Estacionarlo", 55, [1.8, "Entró a la primera, a un dedo de cada lado. Propina de chofer profesional."], [0.3, "La marcha atrás estaba donde no era. El contenedor quedó en la otra cuadra."], { valiente: 2, picaro: 1 }),
      quieto("Decirle que no manejás", 0.9, "Le devolviste las llaves. Se fue a un estacionamiento pago.", { picaro: -1, valiente: -1 }),
    ] },
  ],
  streamer: [
    { id: "donacion", texto: "Un seguidor te ofrece una donación grande si te teñís el pelo de verde en vivo.", opciones: [
      op("Teñirte", 65, [1.7, "Verde flúor. El clip dio la vuelta y la donación era de verdad."], [0.6, "Te teñiste, y la donación era con tarjeta robada: te la reversaron. El verde no se reversa."], { valiente: 2 }),
      op("Usar una peluca y decir que es teñido", 45, [1.6, "Con la luz baja pasó. El chat lo dio por bueno."], [0.4, "Se te ladeó la peluca en pleno directo. El clip se llama 'el estafador verde'."], { picaro: 3 }),
      quieto("Decir que no", 0.9, "Dijiste que tu imagen no se vende. Catorce espectadores, como siempre.", { valiente: -1 }),
    ] },
    { id: "sponsor", texto: "Una casa de apuestas rara, con sede en una isla, te ofrece plata por promocionarla.", control: true, opciones: [
      op("Promocionarla", 55, [1.8, "Leíste el texto con cara seria. Pagaron en fecha, quién diría."], [0.4, "La página cerró a la semana con la plata de tus seguidores adentro. Te quieren ver."], { picaro: 3 }),
      quieto("Rechazarla", 1, "Les dijiste que no. Tu canal sigue pobre pero limpio.", { picaro: -2 }),
    ] },
    { id: "troll", texto: "Un troll entra al chat y empieza a contar cosas tuyas del liceo. Tiene fotos.", opciones: [
      op("Contestarle en vivo", 50, [1.7, "Lo dejaste regulando con tres frases. El chat explotó y llovieron suscripciones."], [0.5, "Te sacó de las casillas. El clip tuyo gritando ya tiene remix."], { valiente: 2 }),
      op("Banearlo calladito", 80, [1.1, "Baneado sin anuncio. El directo siguió."], [0.8, "Volvió con otra cuenta. Y con otra. Y con las fotos."], { valiente: -1 }),
      quieto("Cortar el directo", 0.75, "'Problemas técnicos.' Cortaste una hora antes.", { valiente: -2 }),
    ] },
    { id: "maraton", texto: "Si llegás a las 24 horas seguidas en vivo, la plataforma te destaca en la portada. Vas por la 16.", opciones: [
      op("Aguantar", 55, [2, "Veinticuatro horas. Terminaste hablando con el ventilador, pero saliste en portada."], [0.5, "Te dormiste en la hora 21, en vivo. Seis mil personas te vieron roncar."], { valiente: 2 }),
      op("Poner un video tuyo en loop y dormir", 45, [1.7, "Nadie notó que repetiste la misma partida cuatro veces."], [0.4, "El chat lo notó a la segunda vuelta. La plataforma también."], { picaro: 3 }),
      quieto("Cortar e irte a dormir", 0.9, "Cortaste en la 16 y dormiste como una persona normal.", { valiente: -1 }),
    ] },
  ],
  panadero: [
    { id: "pan-ayer", texto: "Sobraron tres bandejas de bizcochos de ayer. El horno todavía está caliente.", control: true, opciones: [
      op("Recalentarlos y venderlos como del día", 55, [1.6, "Un golpe de horno y azúcar por arriba. 'Recién salidos', dijiste. Volaron."], [0.4, "Doña Elvira, cuarenta años de clienta, mordió uno y te miró a los ojos."], { picaro: 3 }),
      op("Venderlos a mitad de precio", 80, [1.2, "'Bizcochos de ayer, mitad de precio.' Se fueron todos antes de las ocho."], [0.9, "Se vendieron los de ayer y quedaron los de hoy."], { picaro: -2 }),
      quieto("Hacer pan rallado", 0.9, "Los rallaste. No es negocio, pero no se tira nada.", { picaro: -1 }),
    ] },
    { id: "encargo", texto: "A las 6 de la tarde te encargan 500 sándwiches de miga para un velorio. Es para las 9.", opciones: [
      op("Agarrarlo", 55, [2, "Quinientos sándwiches en tres horas, con toda la familia cortando. El difunto, bien despedido."], [0.5, "Llegaste con trescientos y a las diez. En un velorio nadie reclama fuerte, pero tampoco paga entero."], { valiente: 2 }),
      quieto("Decir que no llegás", 0.9, "Dijiste que no llegabas. Se los encargaron a la competencia.", { valiente: -1 }),
    ] },
    { id: "harina", texto: "El proveedor te ofrece harina a mitad de precio. Las bolsas no tienen marca y él no quiere dar boleta.", control: true, opciones: [
      op("Comprarle", 50, [1.7, "Harina es harina. El pan salió igual y el margen, el doble."], [0.3, "Bromatología encontró las bolsas sin rotular. Clausura de un día y multa."], { picaro: 2, valiente: 1 }),
      quieto("Seguir con la de siempre", 1, "Seguiste con tu harina de siempre, con boleta y todo.", { picaro: -1 }),
    ] },
    { id: "horno", texto: "Tres de la mañana y el horno no prende. El gasista atiende desde las ocho.", opciones: [
      op("Meterle mano vos", 45, [1.8, "Era el piloto. Soplaste, rezaste y prendió. El barrio tuvo pan."], [0.4, "Te quedaste sin cejas y el barrio sin pan. El gasista cobró el doble por el desarme."], { valiente: 3 }),
      op("Hornear en lo del vecino pizzero", 65, [1.4, "El pizzero te prestó el horno. El pan salió con un dejo a muzzarella que gustó."], [0.7, "El pizzero te cobró el horno por hora, como si fuera salón de fiestas."], { picaro: 1 }),
      quieto("Esperar al gasista", 0.7, "Esperaste al gasista. A las ocho no había pan, y a las nueve tampoco.", { valiente: -2 }),
    ] },
  ],
  politico: [
    { id: "periodista", texto: "Un periodista te pregunta en vivo por los viáticos del viaje a Cancún.", control: true, opciones: [
      op("'Es una operación en mi contra'", 50, [1.5, "Hablaste de operaciones, de la prensa y de tu abuela. La pregunta se perdió sola."], [0.4, "El periodista tenía las boletas. Y la foto de la reposera."], { picaro: 3 }),
      op("Contestar la verdad", 45, [1.6, "Dijiste cuánto fue y lo devolviste. Nadie lo podía creer. Subiste en las encuestas."], [0.6, "Dijiste la verdad y fue tapa igual, con la peor foto que encontraron."], { picaro: -3, valiente: 2 }),
      quieto("'Sin comentarios'", 0.85, "'Sin comentarios', y caminaste rápido hasta el auto. Salió en todos lados igual.", { valiente: -2 }),
    ] },
    { id: "acto", texto: "Acto en el club del barrio. Hay más militantes pagos que vecinos, y el micrófono acopla.", opciones: [
      op("Prometer el saneamiento", 55, [1.6, "'¡Para marzo, saneamiento!' Ovación. No dijiste de qué año."], [0.5, "Un vecino tenía grabada la misma promesa de hace cinco años y la puso en el parlante."], { picaro: 2 }),
      op("Bajar a hablar mano a mano", 55, [1.5, "Bajaste del escenario y tomaste mate con todos. Dos horas. Salieron votos de ahí."], [0.6, "Una señora te agarró del brazo y te tuvo cuarenta minutos con el tema del contenedor."], { valiente: 2, picaro: -1 }),
      quieto("Leer el discurso y saludar", 0.9, "Leíste el discurso de siempre. Aplaudieron los que cobraban por aplaudir.", { valiente: -1 }),
    ] },
    { id: "sobre", texto: "Un empresario te deja un sobre arriba del escritorio 'para la campaña', justo antes de la licitación.", control: true, opciones: [
      op("Guardarlo en el cajón", 45, [1.9, "El sobre al cajón y la licitación, a quien correspondía. A quien correspondía según el sobre."], [0.25, "Había cámara. El video tiene mejor rating que tu campaña."], { picaro: 3, valiente: 1 }),
      op("Devolverlo con testigos", 70, [1.4, "Lo devolviste delante de la secretaria y el portero. La historia corrió sola."], [0.9, "Lo devolviste. El empresario ahora financia a tu rival."], { picaro: -3 }),
      quieto("No tocarlo", 1, "No lo tocaste. Sigue ahí, arriba del escritorio. Nadie habla del sobre.", { valiente: -1 }),
    ] },
    { id: "debate", texto: "Debate por televisión. Tu rival acaba de decir un dato que es mentira y vos lo sabés.", opciones: [
      op("Retrucarle con el dato", 55, [1.7, "Sacaste el papel con el número correcto. Quedó tartamudeando en cadena nacional."], [0.5, "Sacaste el papel y era la lista del supermercado."], { valiente: 2, picaro: -1 }),
      op("Inventar un dato más grande", 50, [1.5, "'¡El 140 % de los uruguayos!' Nadie hizo la cuenta hasta el otro día."], [0.4, "Los verificadores hicieron la cuenta en vivo."], { picaro: 3 }),
      quieto("Tomar agua", 0.9, "Tomaste agua, despacio. El moderador pasó al siguiente bloque.", { valiente: -2 }),
    ] },
  ],
};

// For any trade. The last four are only for whoever earned that fame.
export const ESCENAS_GENERALES = [
  { id: "sobre-equivocado", texto: "Te pagaron de más: en el sobre hay casi el doble de lo que te toca.", control: true, opciones: [
    op("Callarte la boca", 55, [1.8, "Nadie reclamó. Regalo del cielo, o de contaduría."], [0.5, "Contaduría se dio cuenta el mismo día. Te lo descontaron con multa por 'vivo'."], { picaro: 2 }),
    quieto("Avisar y devolver", 1.05, "Avisaste. Te miraron raro y te dieron algo por honrado.", { picaro: -2 }),
  ] },
  { id: "companero-falta", texto: "Tu compañero faltó sin avisar y te pide por mensaje que lo cubras: 'decí que estoy en el baño'.", opciones: [
    op("Cubrirlo y hacer su parte", 65, [1.5, "Hiciste el laburo de dos. Tu compañero te debe una y el jefe ni se enteró."], [0.7, "El jefe preguntó tres veces por el baño. A la cuarta, entró."], { valiente: 1, picaro: 1 }),
    op("Cobrarle el favor", 55, [1.4, "'Te cubro, pero el asado lo pagás vos y algo más.' Pagó."], [0.8, "Se ofendió y ahora dice por ahí que sos un rata."], { picaro: 2 }),
    quieto("No contestarle", 1, "Dejaste el mensaje en visto. Que se arregle.", { valiente: -1 }),
  ] },
  { id: "paro", texto: "El sindicato llama a paro. El patrón avisa que el que venga a trabajar cobra doble.", opciones: [
    op("Ir a trabajar", 55, [1.9, "Fuiste, cobraste doble y te fuiste por la puerta de atrás."], [0.5, "Te esperaban en el portón con bombos. No entraste, y ahora te dicen carnero."], { picaro: 2, valiente: 1 }),
    op("Ir al paro, adelante de la marcha", 60, [1.3, "Marcha, choripán y fondo de huelga. Te vieron todos."], [0.6, "El patrón también te vio. Descuento del día y cara larga por un mes."], { valiente: 2, picaro: -1 }),
    quieto("Quedarte en tu casa", 0.85, "Ni carnero ni militante: te quedaste durmiendo. Día descontado a medias.", { valiente: -1 }),
  ] },
  { id: "feriado", texto: "Mañana es feriado laborable. Te ofrecen hacerlo doble, pero era el asado de tu cuñado.", opciones: [
    op("Laburar el feriado", 80, [1.5, "Feriado pago doble y sin nadie que moleste. Tu cuñado todavía está ofendido."], [0.9, "Fuiste, y a media mañana se cortó la luz. Te pagaron simple y te perdiste el asado."], { picaro: -1 }),
    quieto("Ir al asado", 0.9, "Fuiste al asado. La plata va y viene, las mollejas no.", { valiente: -1 }),
  ] },
  { id: "inspeccion-sorpresa", pide: "picaro", control: true, texto: "Con la fama que te hiciste, hoy cayó una inspección sorpresa. Preguntaron por vos, con nombre y apellido.", opciones: [
    op("Recibirlos con bizcochos", 50, [1.4, "Bizcochos, café y simpatía. Revisaron por arriba y se fueron llenos."], [0.4, "Los bizcochos figuran en el acta como 'intento de dádiva'."], { picaro: 2 }),
    op("Mostrar todo en regla", 55, [1.3, "Por una vez tenías todo en regla. Se fueron desconfiando igual."], [0.5, "Todo en regla, menos el cajón de abajo."], { picaro: -2 }),
    quieto("Dejar que revisen", 0.75, "Revisaron hasta el termo. Algo encontraron, siempre encuentran.", { valiente: -1 }),
  ] },
  { id: "caja-chica", pide: "honesto", texto: "Como sos de confianza, te dejan a cargo de la caja chica mientras el encargado se va de licencia.", opciones: [
    op("Llevarla al peso", 85, [1.4, "Cerró al peso todos los días. Te pagaron el plus por responsabilidad."], [0.9, "Faltaron veinte pesos que pusiste de tu bolsillo por no explicar."], { picaro: -1 }),
    op("'Tomar prestado' hasta el viernes", 45, [1.8, "Sacaste el lunes y repusiste el viernes. Nadie supo. Vos sí."], [0.3, "El encargado volvió el jueves."], { picaro: 4 }),
    quieto("Decir que no querés ese lío", 1, "Dijiste que la plata ajena te pone nervioso. Se la dieron a otro.", { valiente: -1 }),
  ] },
  { id: "lo-bravo", pide: "valiente", texto: "Hay un trabajo que nadie quiere agarrar, y todos dicen lo mismo: 'llamalo a ese, que no le tiene miedo a nada'.", opciones: [
    op("Agarrarlo", 55, [2, "Lo hiciste, como siempre. Pagaron lo que pediste y un poco más, de puro alivio."], [0.6, "Esta vez era bravo de verdad. Lo terminaste, rengueando."], { valiente: 1 }),
    quieto("Decir que hoy no", 0.9, "Dijiste que hoy no. Hubo un silencio largo en el teléfono.", { valiente: -2 }),
  ] },
  { id: "nadie-te-llama", pide: "cagon", texto: "Salió un trabajo bravo y bien pago. A vos ni te llamaron: 'no, ese se achica'.", opciones: [
    op("Presentarte igual", 50, [1.9, "Caíste sin que te llamaran y lo hiciste sin pestañear. Hubo que verlo para creerlo."], [0.6, "Fuiste, viste de qué se trataba y te volviste desde el portón. Confirmado."], { valiente: 3 }),
    quieto("Quedarte en el molde", 0.95, "Te quedaste con lo de siempre. Tranquilo, eso sí.", { valiente: -1 }),
  ] },
];

// The nickname each trade gives for each fame: [masculine, feminine], or one text for both.
export const APODOS = {
  tambero: { picaro: ["el Aguador del Tambo", "la Aguadora del Tambo"], honesto: ["el Rey del Ordeñe", "la Reina del Ordeñe"], valiente: ["el Partero de la Manchada", "la Partera de la Manchada"], cagon: ["el Asustado del Toro", "la Asustada del Toro"] },
  camionero: { picaro: ["el Coimero de la Ruta 5", "la Coimera de la Ruta 5"], honesto: ["el Santo de la Balanza", "la Santa de la Balanza"], valiente: ["el Loco del Atajo", "la Loca del Atajo"], cagon: ["el Ochenta por Hora", "la Ochenta por Hora"] },
  peon: { picaro: ["el Zorro del Galpón", "la Zorra del Galpón"], honesto: ["el Derecho de la Estancia", "la Derecha de la Estancia"], valiente: ["el Domador de lo Imposible", "la Domadora de lo Imposible"], cagon: "Lumbalgia" },
  guardavidas: { picaro: ["el Socio de las Sombrillas", "la Socia de las Sombrillas"], honesto: ["el Incorruptible del Parador", "la Incorruptible del Parador"], valiente: ["el Terror de las Olas", "la Terror de las Olas"], cagon: ["el Pitador de la Silla", "la Pitadora de la Silla"] },
  chofer: { picaro: ["el Rey del Vuelto", "la Reina del Vuelto"], honesto: ["el Boleto Exacto", "la Boleto Exacto"], valiente: ["el Fitipaldi de la Ruta 8", "la Fitipaldi de la Ruta 8"], cagon: ["el Sordo del Volante", "la Sorda del Volante"] },
  oficinista: { picaro: ["el Mago de los Viáticos", "la Maga de los Viáticos"], honesto: ["el Boleta Pegada", "la Boleta Pegada"], valiente: ["el que Habló en la Reunión", "la que Habló en la Reunión"], cagon: ["el Mirador de Mesas", "la Miradora de Mesas"] },
  dj: { picaro: ["el Vendido de los Wawancó", "la Vendida de los Wawancó"], honesto: ["el Fiel a la Lista", "la Fiel a la Lista"], valiente: ["el Domador de Patovicas", "la Domadora de Patovicas"], cagon: ["el Patovica Arrepentido", "la Patovica Arrepentida"] },
  mecanico: { picaro: ["el Tren Delantero", "la Tren Delantero"], honesto: ["el Devuelvemonedas", "la Devuelvemonedas"], valiente: ["el Tornero Loco", "la Tornera Loca"], cagon: ["el Hasta el Lunes No", "la Hasta el Lunes No"] },
  mozo: { picaro: ["el Flan Fantasma", "la Flan Fantasma"], honesto: ["el Santo del Frasco", "la Santa del Frasco"], valiente: ["el Malabarista del Salón", "la Malabarista del Salón"], cagon: ["el De a Una Mesa", "la De a Una Mesa"] },
  feriante: { picaro: ["el Kilo de 900", "la Kilo de 900"], honesto: ["el Kilo Justo", "la Kilo Justo"], valiente: ["el Dueño de la Cuadra", "la Dueña de la Cuadra"], cagon: ["el del Fondo de la Feria", "la del Fondo de la Feria"] },
  taxista: { picaro: ["el City Tour", "la City Tour"], honesto: ["el Devolvedor de Billeteras", "la Devolvedora de Billeteras"], valiente: ["el Contramano", "la Contramano"], cagon: ["el Sigo de Largo", "la Sigo de Largo"] },
  enfermero: { picaro: ["el Doctor Trucho", "la Doctora Trucha"], honesto: ["el Insobornable del Piso 3", "la Insobornable del Piso 3"], valiente: ["el Vena a la Primera", "la Vena a la Primera"], cagon: ["el que Llama al Anestesista", "la que Llama al Anestesista"] },
  maestra: { picaro: ["el del Corrector en la Fecha", "la del Corrector en la Fecha"], honesto: ["el Nota Firme", "la Nota Firme"], valiente: ["el Terror de los Padres", "la Terror de los Padres"], cagon: ["el Derivador a Dirección", "la Derivadora a Dirección"] },
  futbolista: { picaro: ["el Piscinero del Área", "la Piscinera del Área"], honesto: ["el Fair Play", "la Fair Play"], valiente: ["el Dueño del Penal", "la Dueña del Penal"], cagon: ["el Atacordones", "la Atacordones"] },
  naranjita: { picaro: ["el Tarifa Premium", "la Tarifa Premium"], honesto: ["el Cuidador de Verdad", "la Cuidadora de Verdad"], valiente: ["el Patrón de la Cuadra", "la Patrona de la Cuadra"], cagon: ["el Houdini del Trapo", "la Houdini del Trapo"] },
  streamer: { picaro: ["el Estafador Verde", "la Estafadora Verde"], honesto: ["el Canal Limpio", "la Canal Limpio"], valiente: ["el Veinticuatro Horas", "la Veinticuatro Horas"], cagon: ["el Problemas Técnicos", "la Problemas Técnicos"] },
  panadero: { picaro: ["el Recién Salido de Ayer", "la Recién Salida de Ayer"], honesto: ["el Pan con Boleta", "la Pan con Boleta"], valiente: ["el Sin Cejas", "la Sin Cejas"], cagon: ["el Espero al Gasista", "la Espero al Gasista"] },
  politico: { picaro: ["el del Sobre en el Cajón", "la del Sobre en el Cajón"], honesto: ["el Bicho Raro del Palacio", "la Bicho Raro del Palacio"], valiente: ["el Retrucador", "la Retrucadora"], cagon: ["el Sin Comentarios", "la Sin Comentarios"] },
};
