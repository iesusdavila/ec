# Juegos locales

Plataforma web de juegos casuales multijugador para jugar presencialmente: una
pantalla (laptop, PC, tablet o TV con navegador) actúa como **monitor**, y los
teléfonos de cada jugador se conectan como **controles** usando sus sensores
de movimiento.

- [`HANDOFF.md`](HANDOFF.md) — **estado real del proyecto**: qué funciona, qué
  no, problemas abiertos, trampas del entorno y cómo se verificó cada cosa.
  Empieza por aquí si vas a retomar el desarrollo.
- [`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md) — la especificación
  funcional original que guio el desarrollo.

## Cómo funciona

1. Alguien abre la app en una pantalla grande y elige **Monitor**. Se genera
   un PIN de 4 dígitos.
2. Cada jugador abre la app en su teléfono, elige **Jugador**, ingresa el PIN
   y se conecta.
3. El monitor elige un juego (validando el mínimo/máximo de jugadores) e
   inicia la partida.
4. Cada teléfono muestra únicamente los controles de ese juego (inclinar,
   agitar, tocar) y el monitor muestra el juego y el resultado.

No hay cuentas, ni login, ni base de datos: todo vive en una sesión temporal
identificada por el PIN.

## Arquitectura

```text
src/
├── app/                    Rutas de Next.js (App Router)
│   ├── page.tsx             Pantalla inicial: Monitor / Jugador
│   ├── monitor/              Flujo completo del monitor
│   ├── jugador/               Flujo completo del jugador
│   ├── dev/sensores/          Pantalla de depuración de sensores (solo desarrollo)
│   ├── dev/posicion/           Depuración del rastreo de posición (solo desarrollo)
│   └── api/
│       ├── pusher/auth/       Firma la autenticación de canales presence
│       └── session/create/    Genera un PIN libre
│
├── core/                   Lógica transversal, sin conocimiento de ningún juego
│   ├── realtime/             Cliente/servidor de Pusher, canal presence, eventos
│   ├── session/               Máquina de estados de sesión + store (Zustand)
│   ├── sensors/                SensorService: orientación, movimiento, gestos, calibración
│   │   └── tracking/            Rastreo de la POSICIÓN del teléfono en el espacio
│   └── utils/
│
├── games/                  Un módulo independiente por juego
│   ├── types.ts               Contrato GameDefinition / GameEngine
│   ├── registry.ts             Registro de juegos disponibles
│   ├── runtime/                 GameRuntimeHost / GameRuntimePlayer (motor genérico)
│   ├── simon/                    Simón dice
│   ├── fruit-slice/               Corta frutas
│   ├── darts/                      Dardos
│   ├── race/                        Carrera
│   ├── balance-maze/                 Laberinto de equilibrio
│   ├── tower-climb/                   Torre infinita (mando de botones)
│   ├── bomb-arena/                     Pólvora (mando de botones)
│   └── cube3d/                          Experimento 3D (Three.js)
│
└── components/             UI compartida (botones, PIN, lista de jugadores…)
```

### Principio de extensión

Agregar un juego nuevo es crear una carpeta en `src/games/<id>` con su propio
`definition.tsx` (ver cualquiera de los existentes como plantilla) y añadirlo
a `src/games/index.ts`. Ningún otro archivo del core necesita cambiar.

### Comunicación en tiempo real

Next.js en Vercel corre como funciones serverless: no hay un proceso ni un
WebSocket persistente propio. Por eso la sesión usa **Pusher Channels**
(plan gratuito) como capa de tiempo real, con este modelo:

- Cada sesión es un canal `presence-session-<PIN>`. Pusher ya mantiene la
  lista de miembros conectados, así que **no hace falta base de datos** para
  saber qué jugadores están conectados: la lista de jugadores es la lista de
  miembros del canal.
- El **monitor es la autoridad**: ejecuta la lógica del juego (`GameEngine`)
  y transmite snapshots de estado (`client-game-state`) y de sesión
  (`client-session-state`) al resto.
- Los **jugadores** solo envían su entrada (`client-player-input`: gestos,
  inclinación, toques) y renderizan lo último que recibieron.
- `/api/pusher/auth` firma la autorización de canales presence (obligatorio
  para que Pusher exponga la lista de miembros); no valida contraseñas ni
  cuentas porque no existen: cualquiera que conozca el PIN físico puede
  unirse, que es exactamente el modelo pedido (juego presencial).
- `/api/session/create` genera un PIN de 4 dígitos y comprueba (vía la REST
  API de Pusher) que su canal no tenga ya miembros conectados, para evitar
  colisiones entre sesiones simultáneas.

Esta misma arquitectura funciona igual en `next dev` y en Vercel: no depende
de mantener estado en memoria de un servidor de Node de larga duración.

### Sensores

`SensorService` (`src/core/sensors/SensorService.ts`) envuelve
`deviceorientation` / `devicemotion` detrás de una interfaz simple
(`getTilt()`, `getAcceleration()`, `getRotationAngle()`, `getGravity()`,
`onGesture()`, `calibrate()`, `requestPermission()`). Ningún juego llama a las
APIs del navegador directamente. Antes de jugar un juego que usa inclinación, el
jugador pasa por una calibración rápida que fija su forma de sostener el
teléfono como posición neutra.

### Rastreo de posición

Corta frutas no se juega inclinando el teléfono, sino **moviéndolo por el
espacio**: se lleva el aparato al hombro derecho y el cursor va a la derecha, se
sube a la altura de la cabeza y el cursor sube. Solo cuentan X e Y; acercar o
alejar el teléfono no hace nada, porque el juego es plano.

Eso **no se puede sacar del acelerómetro**: integrarlo dos veces deriva más de
un metro en cinco segundos sobre un espacio de juego de medio metro, y ningún
sensor de navegador ni de Android entrega posición. La única fuente real es la
cámara, así que `src/core/sensors/tracking/` tiene dos implementaciones y elige
la mejor disponible:

- **ARCore vía WebXR** cuando el teléfono lo trae: preciso y con escala métrica.
- **Flujo óptico propio** en cualquier otro caso: compara fotogramas de la
  cámara trasera a baja resolución en un Web Worker y le descuenta la rotación
  usando el giroscopio, de modo que girar la muñeca no mueve el cursor y
  trasladar el teléfono sí.

Si ninguno arranca —sin permiso de cámara, a oscuras, o un navegador sin
soporte—, el juego **cae a la inclinación de siempre** y avisa: nunca deja a un
jugador sin mando. Ambos caminos requieren **HTTPS**.

La perilla a ajustar es `AIM_HALF_RANGE` en `OpticalFlowTracker.ts`: depende de
lo lejos que esté aquello a lo que apunta la cámara trasera. `/dev/posicion`
sirve para calibrarla sin entrar a una partida, y
`node --experimental-strip-types docs/verificacion-flujo-optico.ts` comprueba la
matemática con imágenes sintéticas.

### El teléfono como mando

Torre infinita y Pólvora no usan sensores: el teléfono es un puñado de botones
y nada más. Los dos comparten `games/runtime/GamepadPlayerView.tsx` (los
botones, con respuesta local inmediata) y `games/runtime/padInput.ts` (el
protocolo). Ese protocolo manda en cada mensaje **qué está pulsado ahora** y
**qué se pulsó desde el envío anterior**: lo segundo hace falta porque los
envíos van agrupados para respetar la cuota de Pusher, y entre dos envíos cabe
un toque entero — sin eso, en un juego de saltar se perderían saltos.

### Motor de juego

Cada juego expone un `GameDefinition` con un `createEngine()` que produce un
`GameEngine` (`start`, `handleInput`, `tick`, `isFinished`, `getResult`,
`cleanup`). `GameRuntimeHost` (en el monitor) hace avanzar el motor a 60
cuadros por segundo y transmite snapshots a los teléfonos con un límite de
frecuencia (~14/s) para no agotar la cuota de mensajes de Pusher; el
renderizado local del monitor no está limitado, así que el juego se ve fluido
en la pantalla principal incluso si los teléfonos reciben menos actualizaciones
por segundo.

Antes de iniciar, el host puede ajustar la partida: cada juego declara en su
`GameDefinition` un `duration` (con unidad `seconds`, `throws` o `lives`) y,
opcionalmente, `supportsSplitScreen`. Esas opciones llegan al motor en
`context.options`, así que agregar un ajuste nuevo a un juego no toca el
código de los demás.

## Juegos incluidos

| Juego | Jugadores | Control | Configurable antes de iniciar |
|---|---|---|---|
| Simón dice | 1–5 | 8 botones en pantalla (N, NE, E, SE, S, SO, O, NO) | Vidas por jugador (1–5) |
| Corta frutas | 1–3 | Mover el teléfono por el aire mueve un puntero en la pantalla; barrerlo sobre una fruta la corta, o se toca el teléfono para cortar en ese punto | Duración (30–120s) y modo compartido / pantalla dividida |
| Dardos | 1–5 | Mantener presionado + inclinar para apuntar, soltar para lanzar | Tiros por jugador (3–9) |
| Carrera | 2–5 | Agitar para avanzar, inclinar para cambiar de carril | Duración (30–120s; la pista crece con el tiempo elegido) |
| Laberinto de equilibrio | 1–4 | Inclinación (orientación / giroscopio) | Duración (30–180s; encadena niveles mientras quede tiempo) |
| Torre infinita | 1–4 | Botones: ◀ ▶ y saltar. Todos trepan la misma torre y la cámara sube sola; quien se queda abajo pierde una vida | Duración (45–150s) |
| Pólvora | 2–4 | Botones: cruceta y bomba. Rompe bloques, recoge mejoras y deja al resto sin salida; al final la arena se cierra en espiral | Duración (60–180s) |
| Cubo 3D (experimental) | 1–2 | Inclinación (orientación) | Duración (20–90s) |

Simón dice usa botones en vez de sensores a propósito: detectar 8 direcciones
por inclinación resultaba impreciso y frustrante, y al no necesitar sensores
tampoco pide permisos al navegador.

Al terminar una partida, el monitor ofrece **Jugar de nuevo** (misma
configuración, sin volver al menú) o **Elegir otro juego**.

## Desarrollo local

Requiere Node 20+.

```bash
npm install
cp .env.example .env.local   # completa tus credenciales de Pusher (ver abajo)
npm run dev
```

Abre `http://localhost:3000`, elige **Monitor** en tu computadora y
**Jugador** en tu teléfono (conectado a la misma red y apuntando a la IP
local de tu máquina, no a `localhost`, para que el teléfono pueda alcanzarla).
Los sensores de movimiento requieren un contexto seguro (HTTPS) en la mayoría
de navegadores móviles salvo en `localhost`; para probar desde un teléfono en
la misma red puedes usar una herramienta de túnel HTTPS (por ejemplo
`ngrok http 3000`) apuntando a tu servidor de desarrollo.

Durante el desarrollo existe `/dev/sensores`, una pantalla interna para
validar lecturas de inclinación, aceleración y gestos antes de conectarlas a
un juego. No está disponible en producción.

### Credenciales de Pusher

1. Crea una cuenta gratuita en [pusher.com](https://pusher.com) y una app de
   tipo **Channels**.
2. En la configuración de la app, activa **"Enable client events"** (los
   jugadores y el monitor envían eventos directamente entre sí, no solo el
   servidor).
3. Copia `app_id`, `key`, `secret` y `cluster` a tu `.env.local` siguiendo
   `.env.example`.

## Despliegue en Vercel

1. Importa el repositorio en Vercel.
2. Define las mismas cuatro variables de entorno (`PUSHER_APP_ID`,
   `PUSHER_SECRET`, `NEXT_PUBLIC_PUSHER_KEY`, `NEXT_PUBLIC_PUSHER_CLUSTER`)
   en la configuración del proyecto.
3. Despliega. No se requiere configuración adicional: es una app Next.js
   estándar, sin servidor propio ni infraestructura extra.

Los *preview deployments* de Vercel funcionan igual que producción (usan las
mismas variables de entorno si están marcadas para Preview), lo que permite
probar cambios antes de promoverlos.

## Notas de diseño

- **Sin cuentas ni base de datos.** Cada sesión es un PIN + un canal
  presence de Pusher; termina cuando el monitor se cierra.
- **El monitor es la autoridad del juego.** Los teléfonos nunca ejecutan la
  lógica del juego, solo envían entradas y muestran lo último recibido; esto
  evita divergencias entre pantallas.
- **Nada de cámara ni visión por computadora.** Todo el movimiento se
  detecta con `deviceorientation`/`devicemotion`.
- Falta de soporte de sensores, permisos denegados o el monitor cerrándose a
  mitad de partida se comunican con mensajes cortos en español, nunca con
  errores técnicos.
