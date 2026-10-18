<div align="center">

# SF Balancer

**Balanceador de cintas y planificador de logística para [Satisfactory](https://www.satisfactorygame.com/)**

Tu planificador te dice cuántas máquinas. Esto te dice cómo conectarlas.

[**Abrir el planificador →**](https://sf-balancer.vercel.app/es)

[English](README.md) · [Português](README.pt-BR.md) · Español

[![En línea](https://img.shields.io/badge/en%20l%C3%ADnea-sf--balancer.vercel.app-ff9b3d?style=flat-square)](https://sf-balancer.vercel.app/es)
[![Licencia: MIT](https://img.shields.io/badge/licencia-MIT-8fe3a4?style=flat-square)](LICENSE)
![Un archivo HTML](https://img.shields.io/badge/build-ninguno-15324f?style=flat-square)

<img src="docs/screenshot-es.png" alt="SF Balancer: seis líneas de origen de 455/min alimentando cinco líneas de destino de 480/min a través de un árbol de splitters" width="900">

</div>

## El problema

Una etapa de la fábrica entrega **6 líneas de 455/min** (7 refinerías cada una). La siguiente necesita **5 líneas de 480/min** (12 fundiciones cada una). ¿Cómo se conectan? ¿Cuántas líneas se llenan, cuánto sobra y dónde va el balanceador?

Puedes hacer esa cuenta a mano cada vez, o escribir las máquinas y dejar que el planificador lo dibuje.

## Qué hace

- **Agrupa las máquinas en líneas de cinta.** Máquinas por línea = capacidad de la cinta ÷ tasa por máquina, redondeado hacia abajo. Editable, con aviso cuando la cinta se pasa.
- **Conecta las líneas.** Lista todos los montajes que encuentra, el mejor primero: directo, juntando líneas enteras, una línea donante dividida en partes iguales, o el overflow de un Smart Splitter pasando el exceso a una línea a la que le falta.
- **Diseña el balanceador.** El árbol exacto de splitters ("1 splitter en 3, luego 3 en 2 = 6 partes"), si necesita loop, y la alternativa "dividir en más partes y mandar las sobrantes al sink", con diagrama.
- **Cuenta las piezas.** Mergers, splitters y Smart Splitters de cada tramo (recolección, medio, distribución), con la convención k o k−1 que prefieras.
- **Muestra el flujo.** Un diagrama animado donde el grosor de la cinta y la velocidad de los ítems siguen la tasa real.
- **Avisa.** Cinta por encima de su capacidad, demanda mayor que la oferta, parte de la donante menor que el déficit, líneas incompletas.
- **Se explica.** Cada campo y cada resultado tiene un `?` con una explicación corta, y al final de la página está la sección "Cómo funciona".
- **Tres idiomas:** English, Português (Brasil) y Español.

## Reglas del juego que respeta

| Pieza | Comportamiento |
| --- | --- |
| Cintas | Mk1 60, Mk2 120, Mk3 270, Mk4 480, Mk5 780, Mk6 1200 ítems/min (1.0). |
| Splitter | Hasta 3 salidas, divide en partes iguales. La división directa solo llega a productos de 2 y 3, así que 1/5 o 1/7 necesitan loop o partes extra al sink. |
| Merger | Hasta 3 entradas, por turnos. Una línea de complemento en serie por varios mergers deja sin ítems a los últimos, así que el planificador nunca lo sugiere. |
| Smart Splitter | La salida Overflow solo recibe ítems cuando la salida Any está llena. |
| Awesome Sink | Recibe cualquier sobrante. Retener en el origen también vale: las máquinas solo desaceleran. |

El planificador no conoce recetas. Tú escribes las tasas de tu planificador o del juego.

## Ejecutarlo en local

No hay nada que compilar. Es un solo archivo HTML.

```bash
git clone https://github.com/AdolfoCarneiro/sf-balancer.git
cd sf-balancer
# abre index.html en el navegador, o sirve la carpeta:
npx serve .
```

Tests (Node 18+, sin dependencias):

```bash
node --test tests/logic.test.js
```

## Cómo está organizado el código

```
index.html            toda la app: estilos, idiomas, lógica pura e interfaz
tests/logic.test.js   tests del bloque de lógica, contra el index.html real
vercel.json           headers, CSP y las rutas /pt y /es
```

Dentro de `index.html`, el código entre `// LOGIC-START` y `// LOGIC-END` son funciones puras (agrupamiento, clasificación de casos, árboles de splitters, simulación del flujo). Los tests extraen ese bloque y lo ejecutan en Node, sin navegador.

## Contribuir

Los issues y pull requests son bienvenidos. Unas pocas reglas mantienen el proyecto en orden:

1. **Un solo archivo, sin build.** Sin frameworks, sin bundler. Abrir `index.html` tiene que funcionar.
2. **Todo texto visible existe en los tres idiomas.** Los textos están en el objeto `I18N` (`pt`, `en`, `es`) y se leen con `t('clave')`. Una clave nueva entra en los tres en el mismo cambio; el test `idiomas: as mesmas chaves...` falla si falta alguna.
3. **La lógica va en funciones puras con tests.** Un montaje o regla nueva lleva su caso en `tests/logic.test.js`.
4. **No inventes mecánicas del juego.** Si no sabes cómo se comporta una pieza, abre un issue primero.

`AGENTS.md` tiene la especificación completa (en portugués) y sirve de instrucciones para agentes de IA.

## Apoyo

Si la herramienta te ahorró algunas cuentas, puedes [invitarme un café en Ko-fi](https://ko-fi.com/dofal). Totalmente opcional: la herramienta sigue siendo gratis.

## Licencia

[MIT](LICENSE). Herramienta hecha por fans, sin relación con Coffee Stain Studios. Satisfactory es una marca registrada de Coffee Stain Studios.
