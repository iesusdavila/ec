# Juegos locales

Plataforma web de juegos casuales multijugador para jugar presencialmente: una
pantalla (laptop, PC, tablet o TV con navegador) actúa como **monitor**, y los
teléfonos de cada jugador se conectan como **controles** usando sus sensores
de movimiento.

La especificación funcional original que guio este desarrollo está en
[`docs/ESPECIFICACION.md`](docs/ESPECIFICACION.md).

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
│   └── api/
│       ├── pusher/auth/       Firma la autenticación de canales presence
│       └── session/create/    Genera un PIN libre
│
├── core/                   Lógica transversal, sin conocimiento de ningún juego
│   ├── realtime/             Cliente/servidor de Pusher, canal presence, eventos
│   ├── session/               Máquina de estados de sesión + store (Zustand)
│   ├── sensors/                SensorService: orientación, movimiento, gestos, calibración
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
│   └── cube3d/                        Experimento 3D (Three.js)
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
(`getTilt()`, `getAcceleration()`, `onGesture()`, `calibrate()`,
`requestPermission()`). Ningún juego llama a las APIs del navegador
directamente. Antes de jugar un juego que usa inclinación, el jugador pasa
por una calibración rápida que fija su forma de sostener el teléfono como
posición neutra.

### Motor de juego

Cada juego expone un `GameDefinition` con un `createEngine()` que produce un
`GameEngine` (`start`, `handleInput`, `tick`, `isFinished`, `getResult`,
`cleanup`). `GameRuntimeHost` (en el monitor) hace avanzar el motor a 60
cuadros por segundo y transmite snapshots a los teléfonos con un límite de
frecuencia (~14/s) para no agotar la cuota de mensajes de Pusher; el
renderizado local del monitor no está limitado, así que el juego se ve fluido
en la pantalla principal incluso si los teléfonos reciben menos actualizaciones
por segundo.

## Juegos incluidos

| Juego | Jugadores | Sensores | Resumen |
|---|---|---|---|
| Simón dice | 1–5 | Orientación | Repite una secuencia de inclinaciones que crece cada ronda |
| Corta frutas | 1–3 | Movimiento | Agita el teléfono para cortar frutas y evitar bombas |
| Dardos | 1–5 | Orientación + movimiento | Apunta inclinando, lanza con un gesto, por turnos |
| Carrera | 2–5 | Movimiento + orientación | Agita para avanzar, inclina para cambiar de carril y esquivar |
| Laberinto de equilibrio | 1–4 | Orientación + giroscopio | Inclina el teléfono para llevar una bola hasta la meta, con niveles rotativos |
| Cubo 3D (experimental) | 1–2 | Orientación | Prueba de integración de Three.js: inclina para mover un cubo hasta la meta |

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
