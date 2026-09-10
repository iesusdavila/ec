# Estado del proyecto y traspaso

Documento para retomar este proyecto (persona o IA) sin tener que reconstruir
el contexto. Incluye lo que funciona, **lo que no**, y por qué cada decisión
está tomada así.

Última actualización: tras la ronda de correcciones sobre las dinámicas de los
juegos y las interfaces.

---

## 1. Qué es

Plataforma web de juegos casuales multijugador presenciales. Una pantalla
grande actúa como **monitor** (crea sesión, muestra PIN, corre el juego) y los
teléfonos se conectan como **controles** vía PIN.

- Stack: **Next.js 16.3.4** (App Router, Turbopack) + React 19 + TypeScript +
  Tailwind 4.
- Tiempo real: **Pusher Channels** (canales presence).
- 3D: **Three.js** (solo el juego experimental del cubo).
- Estado: **Zustand**.
- Sin base de datos, sin login, sin cuentas. La sesión es un PIN + un canal.

Documentos relacionados:
- `README.md` — documentación de producto y despliegue.
- `docs/ESPECIFICACION.md` — el brief original completo que originó el proyecto.
- Este archivo — estado real, deuda y trampas.

---

## 2. Cómo ejecutarlo (imprescindible)

```bash
npm install
cp .env.example .env.local   # completar con credenciales de Pusher
npm run dev
```

Variables necesarias (`.env.local`, ya ignorado por git):

```
PUSHER_APP_ID=
PUSHER_SECRET=
NEXT_PUBLIC_PUSHER_KEY=
NEXT_PUBLIC_PUSHER_CLUSTER=
```

### Dos requisitos que no son obvios y rompen todo si faltan

1. **"Enable client events" debe estar activado** en el dashboard de Pusher
   (App Settings). Toda la comunicación de juego usa eventos `client-*` entre
   navegadores. Si está apagado, `channel.trigger()` **devuelve `true` igual**
   y el mensaje se descarta en silencio: los jugadores se conectan, el monitor
   los ve, pero al iniciar un juego el teléfono se queda en "esperando".
   Ya está diagnosticado y ocurrió una vez.
2. **Los sensores de movimiento exigen HTTPS.** En `http://192.168.x.x:3000`
   Chrome de Android **oculta** `DeviceOrientationEvent`/`DeviceMotionEvent`, y
   la app muestra "Sensores no disponibles". No es un bug de la app. Opciones:
   probar desde el despliegue de Vercel (HTTPS real), un túnel HTTPS, o
   `next dev --experimental-https` + instalar el certificado en el teléfono.
   `next.config.ts` ya incluye `allowedDevOrigins` para IPs de red local.

Despliegue: Vercel, importando el repo de GitHub y definiendo esas 4 variables
en el proyecto. Sin configuración extra.

---

## 3. Arquitectura (y por qué)

```
src/
├── app/
│   ├── page.tsx                  Pantalla inicial (Monitor / Jugador)
│   ├── monitor/page.tsx          Flujo completo del monitor (máquina de estados)
│   ├── monitor/GameGrid.tsx      Selector de juegos
│   ├── monitor/GameOptionsPanel.tsx  Opciones previas a iniciar
│   ├── monitor/ResultScreen.tsx  Resultado + "Jugar de nuevo"
│   ├── jugador/page.tsx          Flujo completo del jugador
│   ├── dev/sensores/             Pantalla de depuración (solo desarrollo)
│   └── api/
│       ├── pusher/auth/route.ts      Firma canales presence
│       └── session/create/route.ts   Genera un PIN libre
├── core/
│   ├── realtime/     Cliente/servidor Pusher, canal, eventos, hooks
│   ├── session/      Máquina de estados + store Zustand
│   ├── sensors/      SensorService (única capa que toca las APIs del navegador)
│   └── utils/
├── games/            Un módulo por juego + runtime genérico
└── components/       UI compartida
```

### Decisiones que conviene NO deshacer

**El monitor es la autoridad.** Los teléfonos solo envían entradas y pintan el
último estado recibido. Toda la lógica de juego corre en el navegador del
monitor (`GameRuntimeHost`). Esto evita divergencias entre pantallas.

**Un canal presence por sesión.** `presence-session-<PIN>`. La lista de
jugadores conectados **es** la lista de miembros del canal: por eso no hace
falta base de datos. `/api/pusher/auth` solo firma; no valida identidad porque
no hay cuentas (juego presencial, el PIN se comparte en voz alta).

**Nada de `<canvas>` en los juegos 2D.** Se usó al principio y dio pantallas
negras/congeladas en GPUs móviles al redimensionar el bitmap 60 veces por
segundo. Todos los juegos 2D pintan **elementos DOM/SVG posicionados en %**
dentro de `GameStage` (que fija la relación de aspecto por CSS). Es igual de
fluido con la cantidad de objetos que manejan y mucho más robusto.
`GameStage` existe justamente para eso: no volver a canvas.

**Nada hace scroll: todo cabe en el alto de la ventana.** `Screen` y las
páginas de monitor/jugador usan `h-dvh` + `overflow-hidden` (no `min-h-dvh`),
y la cadena de contenedores flex lleva `min-h-0` para que los hijos puedan
encogerse. Sin ese `min-h-0`, un hijo flex nunca baja de su alto de contenido
y el escenario desbordaba la pantalla. `GameStage` tiene además un modo `fill`
(usado por Corta frutas) que ocupa todo el contenedor en vez de imponer una
relación de aspecto: con relación fija, el alto se deriva del ancho y en un
monitor apaisado se salía por abajo. En modo `fill` el escenario declara
`container-type: size` y los objetos se miden en `cqmin`, para que su tamaño
sea coherente lo mismo en un carril ancho que en uno estrecho.

**Los estados de juego se mutan in-place y se re-emiten.** Por eso
`GameRuntimeHost` guarda el estado en una "caja" (`{ value }`) — si pasara la
misma referencia a `setState`, React haría bail-out por `Object.is` y el
monitor no se re-renderizaría nunca. **No quitar esa caja.**

**Sin emojis como gráficos.** Todos los objetos de juego son SVG propios en
`src/components/icons/GameIcons.tsx`: `AppleIcon`, `WatermelonIcon`,
`OrangeIcon`, `BananaIcon`, `BombIcon`, `SliceFlash`, `DartIcon`, `CarIcon`,
`HurdleIcon`. Fue un pedido explícito del usuario.

**Puerta de "listos" antes de arrancar.** El reloj de la ronda no arranca hasta
que todos los teléfonos confirman (`client-player-ready`) que pasaron permisos
y calibración, con tope de 6s (`READY_TIMEOUT_MS`). Sin esto, el jugador perdía
segundos de reacción mientras aún calibraba.

**Retransmisión de reconciliación.** El estado de sesión se reenvía cada 1s y
el de juego cada 600ms (`HEARTBEAT_MS`), además de al cambiar. Los eventos de
Pusher se pueden perder; sin esto un jugador se quedaba colgado para siempre
en la pantalla anterior.

---

## 4. Contrato de juegos

Cada juego vive en `src/games/<id>/` con:

- `logic.ts` — motor puro (`start`, `handleInput`, `tick`, `isFinished`,
  `getResult`, `cleanup`). No sabe nada de React ni de Pusher.
- `MonitorView.tsx` — pintado en la pantalla grande.
- `PlayerView.tsx` — controles en el teléfono.
- `Thumbnail.tsx` — icono SVG del selector.
- `definition.tsx` — metadatos (`GameDefinition`).

Registrar en `src/games/index.ts`. **Nada más del core se toca.**

### Opciones configurables antes de iniciar

`GameDefinition.duration` define un rango con `unit`:

| unit | Significado | Lo usa |
|---|---|---|
| `seconds` | Duración de la ronda | frutas, carrera, laberinto, cubo |
| `throws` | Tiros por jugador | dardos |
| `lives` | Errores permitidos | simón |

Llega al motor como `context.options.roundValue`. `supportsSplitScreen: true`
añade el selector compartido/dividido (solo lo usa Corta frutas).

---

## 5. Estado juego por juego

| Juego | Control | Configurable | Verificado en navegador | Probado con sensores reales |
|---|---|---|---|---|
| Simón dice | 8 botones táctiles (N…NO) | Vidas 1–5 | Sí | No aplica (ya no usa sensores) |
| Corta frutas | **Mover el teléfono por el espacio**; barrer el puntero o tocar para cortar | Duración 30–120s + modo | Sí (E2E: corte por barrido y por toque, fruta vs bomba, tasa de mensajes, sin scroll; rastreo de posición con cámara falsa) | Sí (ronda 4); el rastreo de posición **no** (ronda 7) |
| Dardos | Mantener presionado + inclinar, soltar | Tiros 3–9 | Sí | **No** |
| Carrera | Agitar + inclinar | Duración 30–120s | Parcial | **No** |
| Laberinto | Inclinar | Duración 30–180s | Sí | **No** |
| Torre infinita | Botones (◀ ▶ saltar) | Duración 45–150s | Sí (E2E: el mando mueve al personaje; 18 comprobaciones de motor) | **No** |
| Pólvora | Botones (cruceta + bomba) | Duración 60–180s | Sí (E2E: las bombas matan y la partida acaba; 24 comprobaciones de motor) | **No** |
| Cubo 3D | Inclinar | Duración 20–90s | Renderiza en headless | **No — ver §6** |

Detalles relevantes:

- **Simón dice** pasó de gestos a **botones a propósito**: detectar 8
  direcciones por inclinación era impreciso y frustrante. Como ya no necesita
  sensores, `requiredSensors: []` y `jugador/page.tsx` **salta la pantalla de
  permisos** para juegos sin sensores.
- **Corta frutas** es el más trabajado: modo compartido o pantalla dividida
  (un carril independiente por jugador), +10 / −10 con números flotantes,
  explosión roja + sacudida al cortar bomba, fruta partida en dos mitades al
  cortarla, y dificultad progresiva (aparecen más rápido con el tiempo).
  - **El teléfono es un puntero, no un sacudidor.** Su POSICIÓN en el espacio
    mueve un cursor (punto rojo con halo en el monitor, uno por jugador). Se
    corta de
    dos formas: **barriendo** el puntero por encima de un objeto, o **tocando**
    la pantalla del teléfono para cortar en el punto exacto. Antes
    `handleInput` ignoraba la puntería y cortaba "el primer objeto vivo del
    carril", así que una bomba junto a una fruta se cortaba sí o sí. Ahora
    `logic.ts` hace un hit-test posicional contra el trazo del puntero
    (distancia punto-segmento, `SLICE_RADIUS`), replicando el arco del monitor
    (`arcY`, importado por `MonitorView` para que no puedan divergir).
  - El barrido solo corta si el gesto es rápido (`SWIPE_MIN_SPEED`): así se
    puede recolocar el puntero despacio junto a una bomba sin detonarla, y
    hace falta un gesto decidido para cortar.
  - Toda la pantalla del teléfono es el botón de cortar: apuntar con una mano
    y acertar un botón pequeño con la otra era innecesariamente difícil.
  - **Posición, no inclinación (ronda 7).** Hasta la ronda 6 el cursor salía
    del ÁNGULO del teléfono, y eso lo convertía en el joystick de una consola:
    centro fijo, el aparato se queda donde está y solo se gira. Ahora el mando
    se mueve por el espacio y el cursor lo acompaña. Ver §5.1.
  - Por eso `requiredSensors: ["orientation", "gyroscope"]`,
    `needsCalibration: true` y `needsPositionTracking: true`. El motor tipa su
    entrada como `FruitSliceInput` (`{type:"aim"}` / `{type:"slice"}`), y esa
    parte NO cambió: al monitor le sigue llegando una posición 0..1 de
    escenario, así que `logic.ts`, `clockSync` y el hit-test son los mismos.
  - Fondo: `FruitBackdrop.tsx`, cielo nocturno oscuro con mariposas en tonos
    fríos desaturados y translúcidos, a propósito para no confundirse con
    frutas (cálidas/saturadas) ni bomba (casi negra). Animación 100% CSS en
    `FRUIT_SLICE_CSS`, inyectada una sola vez desde `MonitorView`; respeta
    `prefers-reduced-motion`. Sobre ese fondo, cada objeto lleva un "plato"
    tenue y `drop-shadow` para seguir siendo legible (la bomba, un halo rojo).
  - Atributos `data-obj-kind` / `data-obj-sliced` en el monitor: puntos de
    enganche para pruebas E2E de puntería, no afectan al render.
- **Laberinto** encadena niveles mientras quede tiempo (`LEVELS` en
  `levels.ts`, rotación en `levelRotation.ts`).
- **Carrera** escala la longitud de pista con la duración elegida.

---

### 5.1 Rastreo de posición del teléfono (ronda 7)

El pedido era claro: *"mi teléfono inicia en la posición 0,0 y yo lo muevo a la
1,0, 2,0, 1,1 — me muevo con el teléfono alrededor de todo el espacio"*, en vez
del centro fijo de un joystick. Solo X e Y; acercar o alejar el teléfono no debe
hacer nada.

**Lo primero que hay que saber, porque ahorra perder un día: esto NO se puede
hacer con el acelerómetro.** No es cuestión de escribir mejor el código, la
información no está en la señal. Un acelerómetro mide fuerza específica, y
"quieto pero inclinado 0,5°" produce EXACTAMENTE la misma lectura que
"acelerando a 0,086 m/s²": son indistinguibles. Al integrar dos veces, ese error
crece al cuadrado:

| tiempo | deriva de posición |
|---|---|
| 1 s | 4 cm |
| 2 s | 17 cm |
| 3 s | 39 cm |
| 5 s | 1,07 m |

El espacio de juego (hombro a hombro, pecho a cabeza) mide ~50-60 cm: el cursor
se saldría de la pantalla en dos o tres segundos de cada ronda. Ningún filtro lo
arregla, tampoco el Kalman, porque un filtro corrige contra una referencia
absoluta y aquí no hay ninguna. Tampoco es una limitación del navegador: la
Generic Sensor API define ocho sensores (acelerómetro, giroscopio, gravedad,
magnetómetro, orientación absoluta y relativa, luz) y ninguno da posición;
Android tampoco tiene un sensor de posición, ARCore la construye con la cámara.

La única fuente real de posición en un teléfono es **la cámara**. De ahí los dos
rastreadores de `core/sensors/tracking/`, que `positionTracking.enable()` elige
por orden:

1. **`XrPoseTracker`** — delega en ARCore vía WebXR. Preciso (deriva de
   centímetros) y con escala métrica real. Peajes: la pose 6DoF **solo** existe
   dentro de una sesión `immersive-ar` (está así en el estándar), lo que obliga
   a `dom-overlay` para poner la interfaz sobre la vista de cámara; y solo hay
   WebXR en Android.
2. **`OpticalFlowTracker`** — lo calculamos nosotros, y es la red universal:
   funciona también en iPhone y no secuestra la pantalla.
3. Si ninguno arranca, el juego **cae a la inclinación de siempre**. Nunca se
   deja a un jugador sin mando: `SensorGate` lo explica y ofrece seguir.

Todo esto necesita **HTTPS** (cámara y WebXR son de contexto seguro).

#### Cómo funciona el flujo óptico

El problema de fondo: en la imagen, girar la cámara y trasladarla producen el
mismo tipo de desplazamiento. Sin separarlos, girar la muñeca movería el cursor,
que es justo el comportamiento de joystick que se quería quitar.

La clave es que el giroscopio mide la rotación bien y sin deriva relevante en la
escala de un fotograma, y que el flujo que produce una rotación es lineal en el
ángulo: `m = M·g`. En vez de deducir `M` de la geometría —haría falta la focal,
la orientación con la que el navegador entrega los frames y si hay espejado,
distinto en cada teléfono— **se aprende por mínimos cuadrados mientras se
juega**. Lo que sobra al restar `M·g` es traslación pura.

La matemática vive en `flowEstimator.ts`, aparte del worker y **sin nada del
navegador**, para poder probarla con imágenes sintéticas (ver §8.1). El análisis
de imagen corre en un Web Worker: meterlo en el hilo principal reproduciría a lo
grande el bug de retardo de §7.6.

#### Qué NO está resuelto

- **Nada de esto se ha probado en un teléfono físico.** Lo verificado es la
  matemática (§8.1) y la cadena completa en Chromium con cámara falsa. Falta
  la prueba real, que es la que dirá si `AIM_HALF_RANGE` está bien elegido.
- El rastreo es **relativo**: mide desplazamiento, no una referencia absoluta,
  así que a lo largo de una partida el centro puede correrse unos centímetros.
  Hay un botón "Recentrar aquí" en la pantalla del jugador. Se descartó
  recentrar solo porque cualquier muelle automático se siente como el joystick
  que se acaba de quitar.
- **Barridos muy rápidos** desenfocan la imagen y degradan el seguimiento —el
  mismo riesgo en ARCore—. Es el punto que más conviene mirar en la prueba real.
- La ganancia depende de **la distancia a lo que enfoca la cámara trasera**: la
  misma partida en un pasillo estrecho y en un salón grande no se sienten igual.
- En sesión AR, el `requestAnimationFrame` de la ventana puede no dispararse
  (lo conduce `XRSession`). El bucle del jugador lleva un vigilante que toma el
  relevo a ~20 fps para que el juego no se congele; feo, pero jugable.
- La página de depuración `/dev/posicion` (solo en desarrollo) muestra qué
  rastreador se eligió y las lecturas en vivo, y deja el servicio en
  `window.__positionTracking` para trastear desde la consola del teléfono.

### 5.2 Los dos juegos de mando (ronda 8)

Pedido: dos juegos multijugador donde el teléfono sea **solo botones**, nada
más en pantalla. Se hicieron a propósito lo más distintos posible entre sí:
uno de reflejos y otro de cabeza.

**Torre infinita** (`src/games/tower-climb/`) — todos trepan la MISMA torre y
la cámara sube sola: sigue al que va primero y además tiene una velocidad
mínima que crece. Quien se queda abajo sale por el borde y pierde una vida (de
tres). Es lo que lo hace multijugador de verdad y no varias partidas de un
jugador en la misma pantalla: **el que va delante decide el ritmo de todos**.
Plataformas normales, móviles, que se rompen, muelles y hielo; y se puede
rebotar en la cabeza de otro. Mando: ◀ ▶ y saltar.

**Pólvora** (`src/games/bomb-arena/`) — arena de 13×11 casillas, bloques
rompibles, mejoras (más bombas, más alcance, más velocidad), detonación en
cadena y muerte súbita que va cerrando la arena en espiral al final de la
ronda, para que la partida termine siempre en enfrentamiento y no por reloj.
Mando: cruceta + bomba.

#### Lo que comparten

- **`runtime/GamepadPlayerView.tsx`** — el teléfono como mando y nada más. El
  botón se ilumina y vibra en el mismo `pointerdown`, sin esperar a la red: eso
  es lo que hace que se sienta inmediato aunque el monitor vaya unas decenas de
  ms por detrás.
- **`runtime/padInput.ts`** — el protocolo. Cada mensaje lleva DOS cosas: qué
  está pulsado ahora (`h`, estado absoluto, se autocorrige si se pierde un
  mensaje) y qué se pulsó desde el último envío (`p`, acumulativo). Lo segundo
  es imprescindible: con la cuota de Pusher los envíos van agrupados, y entre
  dos envíos cabe un toque entero de 60 ms. Mandando solo "qué está pulsado
  ahora", ese salto se perdería — y en un juego de saltar, perder saltos es
  perder el juego.

#### Trampas que costaron encontrar

- **`React.memo` en la vista del monitor deja el juego congelado.** El motor
  muta su estado EN EL SITIO por rendimiento, así que la prop `state` es
  siempre el mismo objeto: `memo` la da por sin cambios y no vuelve a pintar
  nunca. La partida seguía por dentro —Pólvora llegaba a terminar con
  ganador— mientras la pantalla se quedaba clavada en el primer fotograma, con
  el reloj incluido. Lo mismo vale para `useMemo` con el estado en las
  dependencias. **No memoizar estas vistas**; memoizar sí los subcomponentes
  que reciben datos primitivos (`Grid` en Pólvora).
- **La subida forzada de la cámara no puede sumarse al seguimiento.** En Torre,
  la cámara sumaba su velocidad mínima POR ENCIMA de la posición del líder, así
  que acababa adelantándolo y se lo comía por muy bien que jugara: un bot capaz
  de subir 302 unidades acababa igual sin vidas. Ahora hay un tope
  (`CAMERA_MIN_LEAD`) y la presión castiga a quien se queda atrás, no a quien
  va primero.
- **Reaparecer regalaba puntuación.** Al perder una vida se reaparece cerca del
  borde inferior de la cámara, que puede estar mucho más arriba de donde caíste.
  Sin descontarlo, morir SUBÍA la puntuación: en una partida de prueba ganó el
  jugador que no tocó un botón. Ahora se descuenta (`liftedByRespawn`), y
  además no se reaparece sobre muelles, que disparaban al jugador hacia arriba
  por su cuenta.
- **Las plataformas móviles tienen que guardar su posición ACTUAL** en el
  estado, no la de origen, o el monitor las dibuja donde no están.
- **Las plataformas que se rompen deben volver.** Sin eso, romper una podía
  dejar un hueco de dos bandas —24 unidades sobre un salto de 18— y quien
  estuviera debajo se quedaba encerrado sin forma de subir.

#### Qué NO está probado

Ningún humano ha jugado a estos juegos todavía. Verificado están el motor (18
y 24 comprobaciones, §8.1) y la cadena completa monitor↔teléfono con Playwright,
pero la sensación —si el salto responde bien con la latencia real de Pusher, si
la torre da la dificultad justa, si la arena se cierra demasiado pronto— pide
una partida de verdad. Las perillas están en la cabecera de cada `logic.ts`.


---

## 6. Problemas abiertos (leer antes de tocar nada)

### 6.1 Cubo 3D no se ve en el hardware del usuario — SIN RESOLVER

El usuario reporta pantalla negra en su **laptop Asus F15** y en su **tablet
Samsung**. En pruebas con Chromium headless **renderiza correctamente**
(plataforma, obstáculo, meta y cubo visibles), por lo que no se pudo
reproducir ni confirmar la causa.

Lo que ya se hizo como endurecimiento a ciegas en `cube3d/MonitorView.tsx`:
- `MeshBasicMaterial` en vez de materiales con iluminación (evita escena negra
  por luces mal calibradas).
- `antialias: false`, `powerPreference: "default"`,
  `failIfMajorPerformanceCaveat: false` (drivers/GPU integradas problemáticas).
- `setPixelRatio(min(devicePixelRatio, 2))`.
- Detección previa de WebGL + manejo de `webglcontextlost`.
- Contenedor con `aspectRatio` y `minHeight: 260` (evita colapso de layout).
- Mensaje claro + botón **Reintentar** en vez de quedarse en negro.

**Siguiente paso sugerido:** pedir al usuario qué ve exactamente (¿negro total,
o el mensaje "No se pudo mostrar el gráfico 3D"?) y qué dice
`chrome://gpu`. Sin ese dato, seguir tocando el renderer es adivinar. Si el
tiempo apremia, es un juego declaradamente experimental: se puede ocultar del
registro (`src/games/index.ts`) sin afectar al resto.

### 6.2 Nada se ha probado con sensores físicos reales

Todo el juego basado en movimiento se validó **inyectando eventos sintéticos**
(`deviceorientation` / `devicemotion`) en un navegador headless. Los umbrales
de gestos y el mapeo de inclinación son estimaciones razonables, no valores
calibrados contra un teléfono real:

- `SensorService.GESTURE_TRIGGER_THRESHOLD = 18` (m/s² para detectar un
  "agitón"), `GESTURE_COOLDOWN_MS = 350`.
- Laberinto/cubo: `MAX_TILT_DEG = 30`, `MAX_ACCEL`, `DAMPING_PER_S`.
- Dardos: `AIM_RANGE_DEG = 35`.
- Corta frutas, **la perilla principal**: `AIM_HALF_RANGE = 0.13` en
  `core/sensors/tracking/OpticalFlowTracker.ts`. Es cuánto movimiento del
  teléfono equivale a medio escenario, medido como razón traslación/profundidad
  (una cámara sola no puede dar metros). En un salón donde la cámara trasera
  enfoca la pared de enfrente a ~2,5 m son ~32 cm del centro al borde. **Depende
  de la habitación**: cuanto más lejos esté aquello a lo que apunta la cámara,
  más movimiento real hace falta. Si va lento, baja el número; si se dispara,
  súbelo. `/dev/posicion` existe para ajustarlo sin entrar a una partida.
- Corta frutas en modo AR: `XR_HALF_RANGE_M = 0.26` en `XrPoseTracker.ts`. Ahí
  sí son metros de verdad, porque ARCore da escala real. **Va emparejado con
  `AIM_HALF_RANGE`: si tocas uno, toca el otro.** Son dos caminos distintos
  para lo mismo, y es fácil arreglar uno y dejar el otro atrás — pasó con los
  ajustes de la ronda 8 y hubo que volver a por el de AR.
- Corta frutas, plan B de inclinación: `AIM_RANGE_DEG = 24` en `PlayerView.tsx`;
  `SLICE_RADIUS = 0.19` en `logic.ts`. Si cuesta acertar, sube `SLICE_RADIUS`.

Si en el teléfono un juego se siente demasiado sensible o demasiado sordo,
**esos números son la primera perilla que hay que mover**, no la arquitectura.

### 6.3 Otras limitaciones conocidas

- **iOS/Safari sin probar** en absoluto.
- **Reconexión:** si un jugador recarga la página obtiene un id nuevo, así que
  entra como jugador distinto. Es coherente con "sesiones temporales", pero si
  se quiere reconexión real hay que persistir el id en `sessionStorage`.
- **Cualquiera con el PIN puede entrar** y hasta declararse host. Aceptado por
  diseño (juego presencial, sin cuentas).
- **Cuota de Pusher:** el plan gratuito da 200k mensajes/día. Con broadcast a
  ~14/s por partida alcanza de sobra para uso familiar, pero un bucle infinito
  de partidas la consumiría.

---

## 7. Trampas del entorno (esto ya costó tiempo)

1. **Next.js 16 + reglas nuevas de React ESLint.** `react-hooks/set-state-in-effect`
   y `react-hooks/refs` son errores, no avisos. No se puede llamar `setState`
   directamente en el cuerpo de un `useEffect` ni leer/escribir `ref.current`
   durante el render. El patrón usado en el código para casos legítimos es
   `queueMicrotask(() => setState(...))`, y para valores estables
   `useState(() => valorInicial)` en vez de `useRef`.
2. **Chrome moderno pide permiso de sensores como iOS.** Este Chrome ya expone
   `DeviceOrientationEvent.requestPermission`. El código lo detecta
   dinámicamente (no asume iOS), así que funciona en ambos.
3. **`notFound()` no es para componentes cliente.** Por eso `dev/sensores` está
   partido en `page.tsx` (servidor, hace el `notFound()` en producción) y
   `SensorDebugClient.tsx`.
4. **`npm run lint` y `npm run build` deben quedar limpios.** Ambos pasan hoy.
5. **Pusher limita los eventos de cliente a 10 por segundo y por conexión.**
   Esta es la trampa más cara hasta ahora, porque **falla en silencio**: al
   pasarse, Pusher descarta los mensajes sobrantes y `channel.trigger()` sigue
   devolviendo `true`, así que no hay ni error ni aviso en consola.

   Le pasó a Corta frutas: el teléfono enviaba la posición del puntero cada
   50 ms (20 msg/s, el doble del límite) y el resultado en un móvil real fue
   que **el puntero se movía a trompicones y el juego no cortaba nada**, porque
   el mensaje de corte era justo el que se perdía en el descarte.

   Regla para cualquier control continuo que se añada a otro juego: **el límite
   es de MENSAJES, no de bytes**. No tires muestras para caber en la cuota:
   agrúpalas y mándalas juntas, cada una con su marca de tiempo. Ver
   `AimSample` en `fruit-slice/logic.ts` y el bucle de `PlayerView.tsx`.

   La cuenta de la cuota ya no la lleva cada emisor por su lado con su propio
   `throttle`, sino `core/realtime/clientEventBudget.ts`, que la mira en una
   ventana deslizante de un segundo para toda la conexión: los flujos continuos
   preguntan con `canStream()` y los eventos discretos (jugador listo, cierre
   de sesión) pasan siempre, con reserva propia. Verificado intentando enviar
   en cada milisegundo durante 5 s: 45 envíos, **máximo 9 en cualquier ventana
   de 1 s**, espaciados 100-200 ms (sin ráfagas).

   **Y para que ~9/s no se vea a tirones, extrapola; no basta con interpolar.**
   Interpolar hacia la última posición recibida deja el cursor siempre por
   detrás, porque persigue un punto que ya es viejo: se ve lento por mucho que
   se afine el suavizado. Lo que funciona es que el teléfono mande también su
   VELOCIDAD y el monitor avance el cursor por su cuenta entre mensajes
   (`MAX_EXTRAPOLATION_MS` + `CURSOR_EASE_TAU_MS` en `fruit-slice/logic.ts`),
   con topes de tiempo y de distancia para que no se escape si dejan de llegar
   mensajes, y con una puerta de velocidad para no extrapolar el ruido del
   sensor cuando la mano está quieta.

   Tercera pata: **posiciona con `transform: translate3d`, no con `left`/`top`**.
   Animar `left`/`top` recalcula layout 60 veces por segundo; un `translate3d`
   lo resuelve el compositor. En modo `fill` el escenario declara
   `container-type: size`, así que `calc(fracción * 100cqw)` convierte las
   coordenadas 0..1 en píxeles sin tener que medir nada desde React.

6. **El hilo principal del teléfono es parte de la latencia de red.** Es la
   continuación de la trampa anterior y costó más todavía, porque desde el
   escritorio no se ve: ahí sobra CPU y el síntoma no aparece.

   Los eventos de Pusher salen por el mismo hilo que renderiza React. Si el
   teléfono está ocupado renderizando, los envíos esperan turno. Corta frutas
   hacía `setState` con la vista previa 31 veces por segundo, y encima el
   runtime hacía otro `setState` por cada snapshot del host —el estado
   completo, con la posición de cada fruta—. Unos 40 renders por segundo en un
   móvil de gama media: la puntería se quedaba en cola y el jugador percibía
   **uno o dos segundos** de retardo con la red perfectamente sana.

   Reglas que salieron de ahí:

   - Un control continuo **no usa estado de React en su bucle**. Se escribe el
     `transform` directamente en el nodo (ver `dotRef` en `PlayerView.tsx`) y
     se dejan los `setState` para lo esporádico.
   - Un juego cuyo teléfono es solo un mando **recorta lo que recibe** con
     `GameDefinition.toPlayerState`. Y como el host no reenvía si la proyección
     no cambió, un recorte pequeño y estable ahorra además casi toda la cuota.

   Medido en simulación (red 65 ms ± 15 ms, mismo gesto en ambos casos, con el
   motor y el filtro reales):

   | | desfase medio del cursor | peor caso | msg/s | renders/s en el móvil |
   |---|---|---|---|---|
   | Antes | 129 ms | 195 ms | 7,5 | ~40 |
   | Ahora | **82 ms** | **121 ms** | 8,5 | **0** |

   El host, además, emitía por encima del límite (`BROADCAST_INTERVAL_MS` 70 ms
   ≈ 14/s + heartbeat + estado de sesión ≈ 16/s), o sea que Pusher le tiraba
   ~6 mensajes por segundo al azar. Ya no: emite cuando hay cuota y cuando hay
   algo que contar.

7. **Compensar latencia con una constante es apostar.** El hit-test evaluaba
   cada objeto donde estaba hace 0, 90 y 180 ms (`LAG_SAMPLES_MS`), números
   puestos a ojo: en una wifi buena sobran y en datos móviles se quedan cortos,
   y en ningún caso hay forma de saber cuál era el bueno.

   Ahora se mide, y sin gastar un mensaje extra: el host sella cada snapshot
   con su reloj, el teléfono devuelve ese sello junto con cuánto tiempo lo tuvo
   retenido, y el host resta (`core/realtime/clockSync.ts`). Los relojes no
   necesitan estar sincronizados porque cada resta ocurre dentro de un mismo
   aparato. La mediana de las últimas muestras es la que compensa el hit-test,
   y se ve en pantalla en la píldora de latencia del monitor.

---

## 8. Cómo se verificó (para repetirlo)

No hay suite de tests. Se verifica de dos maneras según lo que se toque.

### 8.1 Números (filtros, latencia, cuota, hit-test)

Node 22 ejecuta TypeScript directamente, y las piezas de esta parte no dependen
de React ni del DOM: `KalmanFilter.ts`, `clientEventBudget.ts`, `clockSync.ts` y
`fruit-slice/logic.ts` (esta última solo importa un valor, de `clockSync`). Así
que se copian a un directorio temporal, se les reescribe ese import a una ruta
relativa y se comparan contra la versión anterior sacada de git:

```bash
mkdir -p /tmp/verify && cd /tmp/verify
cp .../src/core/sensors/KalmanFilter.ts .
cp .../src/core/realtime/clientEventBudget.ts .
cp .../src/core/realtime/clockSync.ts .
cp .../src/games/fruit-slice/logic.ts .
git show HEAD~1:src/games/fruit-slice/logic.ts > logicOld.ts   # el "antes"
sed -i 's#@/core/realtime/clockSync#./clockSync.ts#' logic.ts
node --experimental-strip-types harness.ts
```

Dos detalles que hacen falta: el modo "strip-only" de Node **no admite
propiedades de parámetro** (`constructor(private x: T)`), hay que expandirlas en
la copia; y los imports necesitan extensión `.ts` explícita.

**El estimador de flujo óptico tiene su arnés escrito y se ejecuta con un solo
comando** (es la excepción a "no hay tests": comprueba cosas que no se pueden
mirar a ojo en un teléfono):

```bash
node --experimental-strip-types docs/verificacion-flujo-optico.ts
```

Los motores de los dos juegos de mando tienen el suyo, y esos sí necesitan el
resolvedor de alias (importan `@/games/runtime/padInput`):

```bash
node --import ./docs/alias-loader.mjs --experimental-strip-types docs/verificacion-torre.ts
node --import ./docs/alias-loader.mjs --experimental-strip-types docs/verificacion-polvora.ts
```

`docs/alias-loader.mjs` enseña a Node a resolver `@/...` a `src/...`, así que un
arnés importa **del árbol de verdad** en vez de una copia. Sustituye al baile de
copiar a un temporal y reescribir imports con `sed` que se describe más abajo;
ese sigue funcionando, pero ya no hace falta.

De lo que encontraron, lo que más vale la pena saber: en Torre, que la torre SE
PUEDA subir no se fía a que un bot lo consiga —su resultado varía demasiado de
una ejecución a otra para servir de criterio, y ajustar el juego para contentar
al bot sería justo lo que no hay que hacer— sino a una comprobación **geométrica**
banda a banda sobre 40 torres. El bot se conserva como diagnóstico, sin
aserciones sobre su ritmo.

Fabrica una textura y recorta "fotogramas" de ella; mover la ventana de recorte
equivale exactamente a que la escena se desplace, así que la respuesta correcta
se conoce con precisión de subpíxel. Comprueba el signo y la magnitud de la
traslación en ambos ejes, que la rotación pura NO mueva nada, que la regresión
aprenda la focal real (se simula una distinta de la semilla a propósito), que
una escena sin textura devuelva confianza 0 en vez de "quieto", y que todo siga
funcionando con la imagen girada 90°, 180° o espejada.

Encontró dos fallos antes de que nada llegara a un teléfono: la búsqueda SSD
devuelve el desplazamiento de la VENTANA, que es el negativo del flujo (el
cursor se habría movido al revés); y el peso del valor previo de la regresión
estaba ~10.000 veces por encima de la escala real de g², con lo que la focal
jamás se habría aprendido y girar la muñeca habría seguido moviendo el cursor.

Lo que conviene medir ahí, porque es lo que se rompió al hacerlo:

- **Ruido contra retardo del filtro**, con ruido de sensor sintético. La primera
  versión del Kalman salía *cuatro veces* más ruidosa que el suavizado que venía
  a sustituir: el NIS de una sola muestra sigue una chi-cuadrado, se pasa del
  umbral una de cada seis veces solo por ruido, y el filtro se quedaba abierto.
  Se arregló promediando el NIS antes de decidir.
- **Cortes accidentales con la mano quieta**, con una bomba justo bajo el
  puntero. Al pasar a muestreo de 60 Hz, dos muestras separadas 17 ms convierten
  el ruido del sensor en 0,7 pantallas/s de velocidad falsa, rozando el umbral
  de barrido: **el 7% de los lotes detonaba la bomba solo**. Por eso la
  velocidad del gesto se mide sobre una ventana de ~50 ms (`cursor.recent`)
  aunque el tramo que corta siga siendo el fino. Hoy: 0 de 40 lotes.
- **Cuota de Pusher**, intentando enviar en cada milisegundo durante 5 s y
  comprobando el máximo en cualquier ventana de 1 s.

### 8.2 Interfaz y flujo completo

Con **Playwright**, instalado y desinstalado temporalmente (no está en
`package.json` a propósito):

```bash
npm install -D playwright && npx playwright install chromium
# script que abre monitor (1920x1080) + 1-2 jugadores (390x844),
# se une con el PIN leído del DOM, lanza cada juego, inyecta eventos
# sintéticos de sensores y toma capturas.
npm uninstall playwright
```

Puntos clave para escribir ese script:
- El permiso de sensores se simula con `context.addInitScript` sobreescribiendo
  `DeviceOrientationEvent.requestPermission` para que resuelva `"granted"`.
- El PIN se lee de `span.text-5xl`.
- Tras terminar una partida la pantalla es la de resultado: ahí **no existe**
  el botón "Cancelar", sino "Elegir otro juego".
- Volver a hacer clic en una tarjeta ya seleccionada la **deselecciona**.

---

## 9. Pedidos del usuario y qué se hizo con cada uno

Ronda 1 (juegos "hechos de pésima forma"):

| Pedido | Estado |
|---|---|
| Simón demasiado sensible | Resuelto: se cambió a botones |
| Frutas: todo negro, sin frutas | Resuelto: fuera canvas, SVG + corte + desaparición |
| Dardos: no se ve dónde cayó | Resuelto: dardo grande + botón mantener-para-apuntar |
| Laberinto: no se mueve nada | Resuelto: mismo cambio de canvas a DOM |
| Cubo 3D: todo negro | **No confirmado** — ver §6.1 |
| Sin emojis, usar imágenes | Resuelto: SVG propios |

Ronda 2:

| Pedido | Estado |
|---|---|
| 1. Simón con 8 direcciones | Hecho |
| 2. Frutas termina muy rápido | Hecho (duración configurable, 45s por defecto) |
| 3. Dardo muy pequeño | Hecho |
| 4. Laberinto podría ser mejor | Hecho (niveles encadenados + pulido visual) |
| 5. Cubo 3D sigue sin funcionar | **No confirmado** — ver §6.1 |
| 6. Configurar tiempo en todos los juegos | Hecho (segundos / tiros / vidas) |
| 7. Botón repetir sin volver al menú | Hecho ("Jugar de nuevo") |
| 8. Monitor se ve muy pequeño | Hecho (escalado en pantallas ≥1024px) |
| 9. Puntaje +10/−10 y efecto de bomba | Hecho |
| 10. Frutas: colores por jugador y pantalla dividida | Hecho |
| 11. "Toda la inteligencia" al juego de frutas | Hecho (dificultad progresiva, corte, popups) |

Ronda 3 (solo Corta frutas):

| Pedido | Estado |
|---|---|
| El teléfono no apunta a un punto: corta lo que salga y siempre revienta la bomba | Hecho: corte posicional. El teléfono mueve un cursor por inclinación y el toque corta el objeto bajo ese cursor (`nearestSliceable` en `logic.ts`). Verificado E2E: apuntar a la fruta con una bomba en pantalla corta la fruta (+10); tener el reticle sobre la bomba la corta (−10). |
| Poner un cursor visible de dónde apunta | Hecho: punto rojo grande con halo de luz que late, uno por jugador (`FruitCursor` en `MonitorView`). Anillo verde al acertar, gris al cortar al aire. En modo compartido, aro del color del jugador + nombre. |
| Fondo neutro de mariposas, oscuro, que no se confunda con frutas/bombas | Hecho: `FruitBackdrop.tsx` (cielo nocturno + mariposas frías desaturadas, animación CSS, respeta `prefers-reduced-motion`). Objetos con "plato" + `drop-shadow` para seguir legibles sobre el fondo oscuro. |

Ronda 4 (probando en teléfono real, por fin):

| Pedido | Estado |
|---|---|
| No corta nada, pase por donde pase | Hecho. Causa raíz: se enviaban 20 posiciones/s y **Pusher descarta por encima de 10/s en silencio**, así que el mensaje de corte se perdía (ver §7.5). Ahora el envío va limitado a ~7/s y el corte va aparte, sin limitar. Medido en navegador: **7,44 msg/s**. Además se añadió corte por barrido: pasar el puntero por encima de una fruta la corta, sin necesidad de tocar nada. |
| El mouse desde el teléfono va lentísimo | Hecho, misma causa raíz. Encima: el muestreo local subió a ~31/s (el punto del teléfono se siente inmediato), el monitor interpola entre posiciones (`CURSOR_EASE_TAU_MS`) para que ~7/s se vea continuo, y `FruitBackdrop` va `memo` — antes React reconciliaba el cielo entero 60 veces por segundo para nada. |
| Que el juego y el inicio ocupen el 100% del alto, sin scroll | Hecho: `Screen` y las páginas de monitor/jugador pasan de `min-h-dvh` a `h-dvh` + `overflow-hidden`, con `min-h-0` en toda la cadena flex. `GameStage` gana modo `fill` (ocupa el contenedor, sin relación de aspecto fija) y los objetos se miden en `cqmin`. Verificado: `scrollHeight === innerHeight` en inicio, menú del monitor, monitor en partida y teléfono en partida. |

Ronda 5:

| Pedido | Estado |
|---|---|
| El puntero aún no se ve fluido, súbele la velocidad | Hecho, pero **no subiendo la frecuencia de envío** (el techo son 10 msg/s de Pusher y ya íbamos a 7). Se añadió extrapolación: el teléfono manda su velocidad junto a la posición y el monitor avanza el cursor solo entre mensajes, así que se dibuja donde la mano está ahora y no donde estaba hace 120 ms. Además el envío subió de 140 a 120 ms (~8,4 msg/s medidos) y todo lo que se mueve pasó a posicionarse con `translate3d` en vez de `left`/`top`. Medido: el salto p95 respecto al paso típico bajó de **6,6× a 2,3×**, a 60 fps y con 5% de frames parados. Ver §7.5. |

Toques de mecánica que vinieron con lo anterior: los objetos vuelan más lento
(`OBJECT_LIFETIME_MS` 2000 → 2900, hacía falta tiempo para apuntar) y el radio
de corte subió a `0.19`.

Ronda 6 (latencia y estabilidad del puntero):

| Pedido | Estado |
|---|---|
| Hay uno o dos segundos de retardo desde el teléfono; máximo 0,2 s | Hecho. La red nunca fue el cuello de botella: lo era el **hilo principal del móvil**, con ~40 renders de React por segundo (vista previa a 31/s + un snapshot completo del juego por cada broadcast del host) por delante de los envíos de Pusher en la misma cola. El bucle del puntero ya no toca React —escribe el `transform` en el DOM— y el teléfono ahora recibe un estado recortado (`toPlayerState`) que el host ni siquiera reenvía si no cambió. Medido en simulación con red de 65 ms: desfase del cursor **129 → 82 ms de media, 195 → 121 ms en el peor caso**. Ver §7.6. |
| El sensor oscila mucho, implementa filtros de Kalman | Hecho: `core/sensors/KalmanFilter.ts`, modelo de velocidad constante y **adaptativo** (se abre solo cuando el NIS indica movimiento real sostenido, no ante un pico de ruido). Da posición y velocidad como un estado conjunto, en vez de derivar la velocidad restando muestras ruidosas —que era justo lo que hacía saltar el cursor, porque el monitor extrapola con ella—. Medido contra el suavizado anterior: temblor en reposo **±3,61% → ±2,78%** de pantalla, velocidad falsa **0,278 → 0,203** pant/s y retardo del filtro ante un gesto **10,5 → 4,1 ms**; las tres a la vez. |
| Que el corte sea muy preciso | Hecho, por tres vías. (1) El teléfono manda la **trayectoria completa** a 60 Hz dentro del mismo mensaje en vez de un punto cada 120 ms: un barrido en curva sobre una fruta ya no se pierde (verificado). (2) La latencia se **mide** en vez de suponerse (`clockSync.ts`), así que el hit-test evalúa el objeto donde el jugador lo veía; con 250 ms de latencia el corte ahora acierta y antes fallaba (verificado). (3) El toque de pantalla viaja **dentro del lote**, marcado y fechado, así que ya no puede caerse por exceso de cuota como pasaba al tocar rápido. Y una trampa que apareció al muestrear más rápido: a 17 ms entre muestras el ruido del sensor simula un barrido y detonaba bombas solo (7% de los lotes con la mano quieta), así que la velocidad del gesto se mide sobre una ventana de 50 ms aunque el tramo que corta siga siendo el fino. Verificado: 0 de 40. |
| — | De propina: el monitor muestra la latencia real medida de cada teléfono en el encabezado del juego (verde <120 ms, ámbar <200 ms, rojo por encima). Antes no había forma de saber si el puntero iba raro por la red o por otra cosa. |

Ronda 7 (rastreo de posición del teléfono):

| Pedido | Qué se hizo |
|---|---|
| "Siempre tengo que tener el teléfono quieto y solo girarlo, como el joystick de un play. Quiero mover el teléfono literalmente por el espacio y que el juego lo siga, solo en X e Y" | Hecho, con cámara. Antes hubo que descartar el camino evidente: con el acelerómetro **es imposible**, la doble integración deriva 1,07 m en 5 s sobre un espacio de juego de 50-60 cm, y ningún sensor de navegador ni de Android da posición (ver §5.1). Se implementaron dos rastreadores: ARCore vía WebXR cuando existe, y flujo óptico propio —con la rotación descontada por giroscopio— como red universal, con la inclinación de siempre como plan B si ninguno arranca. Verificado: la matemática con imágenes sintéticas (22 comprobaciones, §8.1) y la cadena completa en Chromium con cámara falsa de movimiento conocido. **Falta la prueba en un teléfono real.** |

Ronda 8 (ajustes del puntero y dos juegos nuevos):

| Pedido | Qué se hizo |
|---|---|
| "El puntero va muy lento, un quince por ciento más rápido" | Hecho: `AIM_HALF_RANGE` 0,13 → 0,113 en `OpticalFlowTracker.ts`. Ahora son ~28 cm del centro al borde en vez de ~32. |
| "Al llegar al borde se queda trabado y tengo que recentrar; quiero que simplemente no se mueva y que al volver se mueva otra vez" | Hecho, y eran **dos** fallos distintos. (1) El acumulador se recortaba en ±0,58 mientras la pantalla acaba en ±0,5: 8% de pantalla —unos 4 cm— en los que te movías y no pasaba nada. Ahora el recorte es exacto. (2) El de fondo: al llegar al límite del alcance del brazo uno gira la muñeca y traslada el teléfono a la vez y siempre igual, y dos señales correlacionadas son inseparables por mínimos cuadrados, así que la regresión se tragaba la traslación dentro de la matriz de rotación y acababa cancelando el movimiento real. Medido en el arnés: el desplazamiento reportado caía de 0,0011 a **0,0001** contra un valor real de 0,012, y la focal aprendida se iba de 62 a 36 — en la mano, eso es el cursor clavado hasta pulsar "Recentrar", que resetea la regresión. Arreglado ajustando la regresión sobre las **fluctuaciones** del giro y no sobre su valor absoluto: ahora se mantiene estable en 0,0083 y el modelo se niega a aprender de datos inseparables en vez de envenenarse. |
| "Dos juegos multijugador nuevos, controlados solo con botones, muy elaborados" | Hecho: **Torre infinita** (carrera vertical de plataformas, la cámara sube y quien se queda atrás cae) y **Pólvora** (arena de bombas por casillas, con mejoras, cadenas y muerte súbita en espiral). Ver §5.2. Verificado: 18 y 24 comprobaciones de motor, más la cadena completa monitor↔teléfono con Playwright. **Falta jugarlos con personas.** |

## 10. Si vas a seguir tú

Orden sugerido:

1. **Probar en un teléfono real vía HTTPS** (Vercel es lo más rápido). Es la
   única forma de validar §6.2 y de saber si §6.1 sigue vivo.
2. **Jugar una partida de verdad a Torre infinita y a Pólvora.** Los motores
   están verificados y la cadena monitor↔teléfono también, pero nadie ha jugado
   todavía: la sensación del salto con la latencia real, la dificultad de la
   torre y el ritmo de la muerte súbita solo se saben jugando. Las perillas
   están al principio de cada `logic.ts`.
3. **Ajustar `AIM_HALF_RANGE` de Corta frutas con el teléfono en la mano**
   (usar `/dev/posicion`, que muestra qué rastreador se eligió y las lecturas
   en vivo). Es el único número del rastreo que no se puede elegir a ciegas:
   depende de la habitación. Comprobar también lo que no se ha podido probar
   sin teléfono: que girar la muñeca ya no mueva el cursor, y si un barrido
   rápido rompe el seguimiento.
4. Ajustar umbrales de sensores con datos reales (usar `/dev/sensores`, que
   muestra inclinación, aceleración y gestos en vivo).
5. Decidir qué hacer con el cubo 3D: depurar con datos de GPU o retirarlo.
6. Recién después, pensar en features nuevas.

Todo el código está comentado en español explicando **por qué** está así,
especialmente donde la decisión fue contraintuitiva.
