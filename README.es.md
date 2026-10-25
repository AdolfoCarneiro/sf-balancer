<div align="center">

# SF Balancer

**Balanceador de cintas y planificador de logística para [Satisfactory](https://www.satisfactorygame.com/)**

Tu planificador te dice cuántas máquinas. Esto te dice cómo conectarlas.

[**Abrir el planificador →**](https://sf-balancer.vercel.app/es)

[English](README.md) · [Português](README.pt-BR.md) · Español

[![En línea](https://img.shields.io/badge/en%20l%C3%ADnea-sf--balancer.vercel.app-ff9b3d?style=flat-square)](https://sf-balancer.vercel.app/es)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-8fe3a4?style=flat-square)](LICENSE)
![Sitio estático](https://img.shields.io/badge/build-vite-15324f?style=flat-square)

<img src="docs/screenshot-es.png" alt="SF Balancer: seis líneas de origen de 455/min alimentando cinco líneas de destino de 480/min a través de un árbol de splitters" width="900">

</div>

## El problema

Una etapa de la fábrica entrega **6 líneas de 455/min** (7 refinerías cada una). La siguiente necesita **5 líneas de 480/min** (12 fundiciones cada una). ¿Cómo se conectan? ¿Cuántas líneas se llenan, cuánto sobra y dónde va el balanceador?

Puedes hacer esa cuenta a mano cada vez, o escribir las máquinas y dejar que el planificador lo dibuje.

## Qué hace

- **Agrupa las máquinas en líneas de cinta.** Máquinas por línea = capacidad de la cinta ÷ tasa por máquina, redondeado hacia abajo. En el destino las máquinas se dividen en líneas iguales (14 que caben 8 por línea quedan en 7 + 7), y cada grupo tiene sus propias líneas. Editable, con aviso cuando la cinta se pasa.
- **Conecta las líneas.** Lista todos los montajes que encuentra, el mejor primero: directo, juntando líneas enteras, una línea donante dividida en partes iguales, o el overflow de un Smart Splitter pasando el exceso a una línea a la que le falta. Eliges qué pasa con el exceso: se retiene en el origen (las máquinas se frenan) o va al Awesome Sink, y entonces la recomendada llena todos los destinos sin retener nada, con un Smart Splitter a la salida de cada línea que sobra.
- **Diseña el balanceador.** El árbol exacto de splitters ("1 splitter en 2, luego 2 en 3 = 6 partes", con los 2 primero porque gasta menos piezas), si necesita loop, y la alternativa "dividir en más partes y mandar las sobrantes al sink", con diagrama.
- **Biblioteca de balanceadores.** Un generador N→M que prueba diez diseños (matriz, embudo y mariposa, cada uno también con loop o sink para 5, 7, 10…, y la matriz con loop dividido, que divide cada entrada en 2 antes del loop para que la cinta llena no se atasque: el 1→5 de 14 piezas y el 1→7 de 24 que usa la comunidad), revisa cada tramo interno contra el nivel de la cinta, explica por qué eligió uno y muestra el montaje paso a paso, con la pieza del paso resaltada como el holograma de la build gun. En el plan, el balanceador es un bloque que abres con un clic para ver ese montaje.
- **Normal, mariposa o 3D.** Elige el estilo de montaje: diseños planos, mariposa (cintas mezcladas de a pares en rondas, 16 piezas en 4→4 en vez de 20 y 48 en 8→8 en vez de 88; como mezcla carriles lejanos y es más difícil de montar, el planificador solo recomienda la mariposa cuando ahorra más del 20% de las piezas, abre su 3D en pisos; cualquier N→M de 2→2 a 9→9 y más, con carriles vacíos o carriles de más en loop, y 5→5 sale con 24 piezas) o una escena 3D que puedes girar y acercar, montada en torres (las piezas de cada capa apiladas, con las cintas cruzando entre las torres) o en pisos, con el conteo de lifts y el paso a paso como el holograma de la build gun: lo ya montado queda sólido, y el paso actual queda en un holograma transparente que pulsa, con luces que recorren las cintas en el sentido del flujo. Las cintas se conectan como en el juego, una por cara: el splitter recibe por atrás y saca por el frente y los lados, el merger al revés, y las flechas arriba de cada pieza muestran qué puertos están en uso. Pasa el mouse o toca una pieza para ver solo sus conexiones, o usa Seguir para iluminar todo el camino de una entrada o salida. En el paso a paso, Por pieza va de a un splitter o merger, con cada conexión explicada: por qué lado, de dónde viene y a dónde va. Normal y mariposa se dibujan vistos desde arriba, con las cintas en curva entrando y saliendo por el lado correcto de cada pieza, como en el juego (el splitter recibe por atrás y saca por el frente y los lados, el merger al revés, nunca dos cintas por el mismo lado), y el dibujo siempre cabe entero en la pantalla. Un selector Esquema / Planta lo muestra compacto o a escala: cuadrícula de cimientos de 8 m, piezas cuadradas que ocupan ¼ de cimiento (splitter naranja con en cuántas divide, merger verde azulado), cintas que salen y entran por los lados reales, y cuánto espacio ocupa (en cimientos y metros) y en qué Blueprint Designer cabe (Mk1 4×4, Mk2 5×5, Mk3 6×6). En la planta, marcadores del Blueprint Designer a escala, con el piso y la cuadrícula de cimientos del designer, ayudan a dividir un balanceador en blueprints: el designer más pequeño en el que cabe ya aparece cubriéndolo, añades cuantos marcadores Mk1, Mk2 o Mk3 quieras, y Ctrl + arrastrar (o Mover marcador en el celular) mueve uno, encajando en la cuadrícula. Por pieza funciona en los dos, con cada pieza numerada (#1, #2…); en la planta, la cinta mezclada lleva el color de la salida a la que va, y pasar el mouse o tocar una pieza muestra solo su camino.
- **Tus blueprints primero.** Anota los blueprints de balanceador que ya tienes (empieza con 3→4) y el planificador los prefiere cuando el formato coincide.
- **Atajos si no quieres montarlo.** Junto a cada balanceador, indica el mod [Modular Load Balancers](https://ficsit.app/mod/LoadBalancers) y los blueprints de la comunidad en [Satisfactory Calculator](https://satisfactory-calculator.com/es/blueprints).
- **Cuenta las piezas.** Mergers, splitters y Smart Splitters de cada tramo (recolección, medio, distribución), con la convención k o k−1 que prefieras.
- **Muestra el flujo.** Un diagrama animado donde los ítems avanzan a la velocidad del nivel de la cinta, como en el juego, y el grosor y la separación entre ítems siguen la tasa real. Cada pieza se dibuja como en el juego (splitter con hasta 3 salidas, cascada de mergers con hasta 3 entradas, retorno del loop, Smart Splitter, un Awesome Sink por cinta), con la tasa en cada cinta; el diagrama crece y se desplaza hacia el lado, y al hacer clic en un bloque se abre su detalle.
- **Avisa.** Cinta por encima de su capacidad, demanda mayor que la oferta, parte de la donante menor que el déficit, líneas incompletas.
- **También fluidos.** Cambia a "Fluido (tubería)" y usa Pipeline Mk1 (300) y Mk2 (600 m³/min). La tubería no tiene splitter, así que en lugar del balanceador junta y divide las tuberías con Pipeline Junctions en tuberías colectoras que respetan la capacidad, y cuando una tubería de origen tiene más de lo que necesita una colectora, una junction pasa el resto a la siguiente.
- **Deshacer y rehacer.** Ctrl+Z deshace y Ctrl+Y (o Ctrl+Shift+Z, Cmd en Mac) rehace cualquier cambio en las entradas, incluso escribiendo en un campo, y el resultado vuelve con ellos. Una escritura seguida es un solo paso; el historial dura mientras la página está abierta.
- **Guarda y comparte escenarios.** Guarda todos los escenarios que quieras en el navegador, con el nombre del ítem, y copia un enlace que lleva el escenario entero, para abrirlo en otro ordenador o mandárselo a un amigo.
- **Reporta un caso raro.** Un enlace al final del plan abre un issue en GitHub ya rellenado con el enlace del escenario y el montaje mostrado, y solo describes qué parece estar mal.
- **Se explica.** Cada campo y cada resultado tiene un `?` con una explicación corta, y al final de la página está la sección "Cómo funciona".
- **Tres idiomas:** English, Português (Brasil) y Español.

## Planner 2D (beta)

Una página aparte, `/es/planner`, encadena varias etapas de recetas y muestra el medio de cada enlace (la misma lógica de la herramienta), con un botón que abre la herramienta ya rellenada. Al abrir una etapa ves las filas de máquinas a escala. La pestaña Mapa coloca toda la cadena en un plano visto desde arriba a escala (cuadrícula de cimientos de 8 m): arrastra y gira los bloques, y ve las cintas y el medio de cada enlace dibujados entre ellos, con avisos de solapamiento y cruce de cintas (fase 2). Los datos del juego se generan del Docs del juego (`node scripts/gamedata.mjs <en-US.json>`).

## Reglas del juego que respeta

| Pieza | Comportamiento |
| --- | --- |
| Cintas | Mk1 60, Mk2 120, Mk3 270, Mk4 480, Mk5 780, Mk6 1200 ítems/min (1.0). |
| Splitter | Hasta 3 salidas, divide en partes iguales. La división directa solo llega a productos de 2 y 3, así que 1/5 o 1/7 necesitan loop o partes extra al sink. |
| Merger | Hasta 3 entradas, por turnos. Una línea de complemento en serie por varios mergers deja sin ítems a los últimos, así que el planificador nunca lo sugiere. |
| Smart Splitter | La salida Overflow solo recibe ítems cuando la salida Any está llena. |
| Awesome Sink | Recibe cualquier sobrante de ítems. Retener en el origen también vale: las máquinas solo desaceleran. No acepta fluidos. |
| Tubería | Pipeline Mk1 300, Mk2 600 m³/min. Sin splitter: la Pipeline Junction (4 puertos) junta o divide y el fluido va adonde hay espacio, sin garantizar partes iguales. Para un caudal exacto, usa una Valve. |

El planificador no conoce recetas. Tú escribes las tasas de tu planificador o del juego.

## Ejecutarlo en local

Es un sitio estático construido con Vite (Node 20.19+ / 22.12+).

```bash
git clone https://github.com/AdolfoCarneiro/sf-balancer.git
cd sf-balancer
npm install
npm run dev       # servidor local
npm run build     # build de producción en dist/
```

Tests (lógica e idiomas):

```bash
npm test
```

Para probarlo como en producción (nginx sirviendo el build, con las rutas `/pt` y `/es`), ejecuta `docker compose up --build` y abre http://localhost:8080. Para limpiar: `docker compose down --rmi local`.

## Cómo está organizado el código

```
index.html            HTML base (en inglés, para los buscadores)
planner.html         entrada del planner 2D (React + TypeScript)
src/planner/          planner: model/ (puro; model/map/ es la escena del mapa), worker/ (medios fuera del hilo principal) y ui/
src/main.js           punto de entrada
src/logic/            funciones puras, sin DOM (agrupamiento, clasificación de casos, árboles de splitters, simulación del flujo)
src/i18n/             textos en pt, en y es
src/ui/               interfaz
src/view3d/           escena 3D (three.js, se carga solo al abrir la pestaña 3D)
src/styles/main.css   estilos
public/               estáticos (favicon, og.png, robots.txt, sitemap.xml)
tests/                tests de la lógica y la comparación visual
vercel.json           build, headers, CSP y las rutas /pt y /es
Dockerfile, nginx.conf, docker-compose.yml   prueba local como en producción (nginx sirviendo dist/)
```

La lógica son funciones puras que los tests importan directamente en Node, sin navegador.

## Contribuir

Los issues y pull requests son bienvenidos. Unas pocas reglas mantienen el proyecto en orden:

1. **JavaScript puro, sin framework.** Módulos ES construidos con Vite; `src/logic` no toca el DOM.
2. **Todo texto visible existe en los tres idiomas.** Los textos están en `src/i18n/` (`pt.js`, `en.js`, `es.js`) y se leen con `t('clave')`. Una clave nueva entra en los tres en el mismo cambio; el test `idiomas: as mesmas chaves...` falla si falta alguna.
3. **La lógica va en funciones puras con tests.** Un montaje o regla nueva lleva su caso en `tests/logic.test.js`.
4. **No inventes mecánicas del juego.** Si no sabes cómo se comporta una pieza, abre un issue primero.

`AGENTS.md` tiene la especificación completa (en portugués) y sirve de instrucciones para agentes de IA.

## Apoyo

Si la herramienta te ahorró algunas cuentas, puedes [invitarme un café en Ko-fi](https://ko-fi.com/dofal). Totalmente opcional: la herramienta sigue siendo gratis.

## Licencia

[MIT](LICENSE). Herramienta hecha por fans, sin relación con Coffee Stain Studios. Satisfactory es una marca registrada de Coffee Stain Studios.
