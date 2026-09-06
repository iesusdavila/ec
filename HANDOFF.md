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
| Corta frutas | Apuntar (inclinación); barrer el puntero o tocar para cortar | Duración 30–120s + modo | Sí (E2E: corte por barrido y por toque, fruta vs bomba, tasa de mensajes, sin scroll) | Sí (ronda 4) |
| Dardos | Mantener presionado + inclinar, soltar | Tiros 3–9 | Sí | **No** |
| Carrera | Agitar + inclinar | Duración 30–120s | Parcial | **No** |
| Laberinto | Inclinar | Duración 30–180s | Sí | **No** |
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
  - **El teléfono es un puntero, no un sacudidor.** La inclinación mueve un
    cursor (punto rojo con halo en el monitor, uno por jugador). Se corta de
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
  - Por eso ahora `requiredSensors: ["orientation"]` y `needsCalibration: true`
    (el punto neutro calibrado = centro de la pantalla). El motor tipa su
    entrada como `FruitSliceInput` (`{type:"aim"}` / `{type:"slice"}`).
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
- Corta frutas: `AIM_RANGE_DEG = 28`, `AIM_SMOOTHING = 0.4` (en `PlayerView.tsx`);
  `SLICE_RADIUS = 0.16` (en `logic.ts`). Si el cursor no llega a los bordes,
  baja `AIM_RANGE_DEG`; si tiembla, baja `AIM_SMOOTHING`; si cuesta acertar,
  sube `SLICE_RADIUS`.

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

   Regla para cualquier control continuo que se añada a otro juego: **muestrea
   rápido en local, pero envía como mucho ~7 veces por segundo** (throttle con
   envío de cola, ver `core/utils/throttle.ts`) y deja el resto del presupuesto
   para los eventos discretos (toques, disparos), que nunca deben ir limitados.
   Para que 7/s no se vea a saltos, interpola en el monitor en vez de subir la
   frecuencia de envío (`CURSOR_EASE_TAU_MS` en `fruit-slice/logic.ts`).

   Nota: el host también emite por encima del límite (`BROADCAST_INTERVAL_MS`
   70 ms ≈ 14/s + heartbeat + estado de sesión). No causa los síntomas de
   arriba porque el monitor pinta desde su propio estado local, no desde el
   broadcast, pero **es deuda real**: los teléfonos reciben menos snapshots de
   los que se creen. Si algún juego llega a depender de lo que el teléfono
   pinta, hay que bajar esa frecuencia.

---

## 8. Cómo se verificó (para repetirlo)

No hay suite de tests. La verificación fue con **Playwright**, instalado y
desinstalado temporalmente (no está en `package.json` a propósito):

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

Toques de mecánica que vinieron con lo anterior: los objetos vuelan más lento
(`OBJECT_LIFETIME_MS` 2000 → 2900, hacía falta tiempo para apuntar), el radio
de corte subió a `0.19`, y el hit-test compensa la latencia de red evaluando
también dónde estaba el objeto 90 y 180 ms antes (`LAG_SAMPLES_MS`).

---

## 10. Si vas a seguir tú

Orden sugerido:

1. **Probar en un teléfono real vía HTTPS** (Vercel es lo más rápido). Es la
   única forma de validar §6.2 y de saber si §6.1 sigue vivo.
2. Ajustar umbrales de sensores con datos reales (usar `/dev/sensores`, que
   muestra inclinación, aceleración y gestos en vivo).
3. Decidir qué hacer con el cubo 3D: depurar con datos de GPU o retirarlo.
4. Recién después, pensar en features nuevas.

Todo el código está comentado en español explicando **por qué** está así,
especialmente donde la decisión fue contraintuitiva.
