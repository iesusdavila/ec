# Desarrollo de plataforma web de juegos locales controlados con smartphones

## 1. Rol y objetivo del desarrollo

Actúa como un equipo senior de desarrollo de software especializado en:

* Aplicaciones web.
* Juegos casuales multijugador.
* Comunicación en tiempo real.
* Interfaces responsive.
* Sensores de dispositivos móviles.
* Arquitecturas modulares y mantenibles.
* Despliegue en Vercel.

El objetivo es construir una **plataforma web de juegos casuales multijugador**, donde una pantalla grande funciona como **monitor principal** y los teléfonos móviles funcionan como **controles de los jugadores**.

La plataforma está diseñada para jugar presencialmente con familiares o amigos.

No se busca crear videojuegos AAA, mundos abiertos, juegos complejos tipo FIFA, Fortnite o experiencias 3D extensas.

La prioridad es:

1. Simplicidad.
2. Diversión inmediata.
3. Baja complejidad de desarrollo.
4. Facilidad de mantenimiento.
5. Arquitectura extensible.
6. Buen funcionamiento en dispositivos móviles.
7. Interacción mediante sensores y controles simples.
8. Evitar funcionalidades innecesarias.

---

# 2. Concepto general

La aplicación tendrá dos tipos de experiencia:

## A. Monitor

El monitor será la pantalla principal donde se visualiza el juego.

Puede ejecutarse en:

* Laptop.
* Computadora.
* Tablet grande.
* Televisor mediante navegador.

El monitor será responsable de:

* Crear una sesión.
* Generar y mostrar un PIN.
* Mostrar los jugadores conectados.
* Seleccionar el juego.
* Iniciar la partida.
* Mostrar el estado y resultado del juego.

La interfaz del monitor debe aprovechar pantallas grandes.

---

## B. Jugador

El jugador utilizará principalmente un teléfono móvil.

Al ingresar a la aplicación, el usuario podrá seleccionar:

* **Monitor**
* **Jugador**

Si selecciona **Jugador**, verá una experiencia diseñada específicamente para pantallas móviles.

La interfaz del jugador debe ser extremadamente simple.

Debe evitar:

* Menús complejos.
* Paneles informativos.
* Exceso de botones.
* Animaciones decorativas.
* Explicaciones largas.
* Configuraciones innecesarias.

El flujo ideal debe ser:

1. Abrir la aplicación.
2. Seleccionar **Jugador**.
3. Ingresar el PIN.
4. Conectarse.
5. Jugar.

Durante una partida, el teléfono solo debe mostrar los controles estrictamente necesarios para ese juego.

Como máximo, deben existir controles auxiliares como:

* Pausar, si el juego lo requiere.
* Salir o cancelar.

No agregar botones adicionales sin una razón funcional clara.

La interfaz del modo jugador está diseñada principalmente para smartphones. No es necesario optimizar esta experiencia para escritorio.

---

# 3. Restricción de conexión

La experiencia está pensada para jugadores presentes físicamente en el mismo lugar.

El concepto funcional es:

* Una pantalla abre una sesión.
* Se genera un PIN.
* Los jugadores ingresan ese PIN.
* Los teléfonos se vinculan con esa sesión.
* Todos participan en la misma partida.

No implementar:

* Registro de usuarios.
* Inicio de sesión.
* Google Login.
* Microsoft Login.
* Perfiles personales.
* Amigos.
* Chat.
* Sistema social.
* Cuentas persistentes.

La vinculación debe basarse únicamente en sesiones temporales y un PIN.

## Importante

La arquitectura de comunicación debe ser compatible con el despliegue en Vercel y con la ejecución local durante desarrollo.

No asumir la existencia de un servidor físico propio ni requerir que el usuario instale infraestructura adicional.

La solución de comunicación debe ser técnicamente coherente con una aplicación desplegada en Vercel.

---

# 4. Arquitectura general

La aplicación debe construirse con una arquitectura modular.

Separar claramente:

```text
Aplicación
│
├── Core
│   ├── Sesiones
│   ├── Jugadores
│   ├── Comunicación en tiempo real
│   ├── Gestión de estado
│   └── Sensores
│
├── Interfaz
│   ├── Monitor
│   └── Jugador
│
├── Juegos
│   ├── Juego 1
│   ├── Juego 2
│   ├── Juego 3
│   ├── Juego 4
│   ├── Juego 5
│   └── Juego 3D experimental
│
└── Configuración
    └── Metadatos de cada juego
```

Los juegos no deben estar mezclados directamente con la lógica global de sesiones.

Cada juego debe ser un módulo independiente.

Debe ser posible agregar un nuevo juego sin modificar profundamente el resto de la aplicación.

---

# 5. Sistema configurable por juego

No establecer una cantidad máxima global fija de jugadores.

Cada juego debe definir su propia configuración.

Ejemplo conceptual:

```text
Juego
- ID
- Nombre
- Descripción corta
- Número mínimo de jugadores
- Número máximo de jugadores
- Tipo de controles
- Sensores requeridos
- Estado del juego
- Pantalla de jugador
- Pantalla de monitor
```

Ejemplos:

```text
Cortar frutas:
2 a 3 jugadores

Dardos:
1 a 5 jugadores

Simón:
1 a 5 jugadores

Equilibrio:
1 jugador

Carrera:
2 a 5 jugadores
```

Los valores anteriores son ejemplos arquitectónicos. Cada juego debe definir su propia capacidad.

El sistema debe impedir iniciar un juego si no se cumple el mínimo de jugadores requerido.

También debe impedir que se conecten más jugadores de los permitidos para la partida seleccionada.

---

# 6. Sensores de teléfonos

Los teléfonos pueden utilizar sensores disponibles desde el navegador, cuando el dispositivo y navegador lo permitan.

La arquitectura debe contemplar principalmente:

* Acelerómetro.
* Giroscopio.
* Orientación del dispositivo.
* Eventos de movimiento.

Se deben utilizar APIs web estándar disponibles para este propósito.

La aplicación debe solicitar permisos cuando sea necesario.

Especialmente en dispositivos donde el acceso a sensores requiere una acción explícita del usuario.

## Regla importante

No depender de:

* Cámara.
* Visión por computadora.
* Reconocimiento corporal.
* Imágenes.
* Procesamiento de video.

Los juegos basados en movimiento deben funcionar exclusivamente mediante:

* Movimiento.
* Orientación.
* Inclinación.
* Aceleración.
* Gestos simples detectados por sensores.

---

# 7. Juegos iniciales

Se deben desarrollar cinco juegos casuales en 2D y un juego pequeño experimental en 3D.

La prioridad es validar primero las mecánicas antes de aumentar complejidad visual.

---

# JUEGO 1 — CORTA FRUTAS

## Concepto

Juego casual inspirado en la mecánica de cortar objetos.

En la pantalla principal aparecerán frutas u otros objetos simples.

El jugador utilizará el movimiento de su teléfono para ejecutar cortes o golpes.

## Entrada

El teléfono detectará movimientos rápidos mediante sensores.

Se debe detectar principalmente:

* Dirección.
* Intensidad del movimiento.
* Momento del gesto.

No se requiere cámara.

## Mecánica

El jugador realiza un movimiento físico con el teléfono.

Ese movimiento se interpreta como una acción de corte.

En el monitor:

* Aparecen frutas.
* El jugador debe cortar las frutas correctas.
* Puede existir puntuación.
* Puede existir límite de tiempo.

## Jugadores

La cantidad debe ser configurable.

Para la primera implementación, se recomienda un máximo pequeño, por ejemplo entre 2 y 3 jugadores, para evitar saturar visualmente la pantalla.

## Output

El monitor muestra:

* Frutas.
* Cortes.
* Puntuación.
* Tiempo.
* Ganador.

El teléfono muestra únicamente:

* Estado de conexión.
* Indicador visual mínimo de que el movimiento está siendo detectado.
* Botón para salir o cancelar.

---

# JUEGO 2 — DARDOS / LANZAMIENTO

## Concepto

Juego de precisión donde el jugador realiza un gesto físico para lanzar un objeto virtual.

Puede ser:

* Dardo.
* Bola.
* Disco.
* Otro proyectil simple.

## Entrada

El sistema utiliza:

* Movimiento.
* Aceleración.
* Dirección.

## Mecánica

El jugador apunta o prepara el teléfono y realiza un movimiento de lanzamiento.

El sistema transforma ese movimiento en:

* Dirección.
* Fuerza aproximada.

No se busca una simulación física hiperrealista.

La física debe ser simple y consistente.

## Output

En el monitor se muestra:

* Objetivo.
* Trayectoria.
* Impacto.
* Puntuación.

El jugador ve únicamente el estado necesario para ejecutar el lanzamiento.

---

# JUEGO 3 — SALTAR OBSTÁCULOS / CARRERA

## Concepto

Juego de carrera simple en 2D.

Los personajes avanzan por una pista o escenario horizontal.

Los jugadores deben realizar acciones físicas simples para avanzar o evitar obstáculos.

## Entrada

Se pueden utilizar:

* Movimiento repetitivo.
* Aceleración.
* Inclinación.

La primera versión debe priorizar una mecánica fácil de detectar y calibrar.

No intentar interpretar movimientos corporales complejos.

## Mecánica

Ejemplo:

* Movimiento controlado = avanzar.
* Gesto específico = salto.
* Inclinación = cambio lateral.

La detección debe ser tolerante.

No exigir movimientos extremadamente precisos.

## Output

El monitor muestra:

* Carrera.
* Posición de cada jugador.
* Obstáculos.
* Progreso.
* Ganador.

---

# JUEGO 4 — SIMÓN DICE / SECUENCIA DE MOVIMIENTOS

## Concepto

El sistema muestra una secuencia de movimientos.

Los jugadores deben reproducirla correctamente utilizando el teléfono.

Ejemplos:

* Arriba.
* Abajo.
* Izquierda.
* Derecha.
* Diagonal.

## Entrada

Utilizar:

* Orientación.
* Inclinación.
* Movimiento.

No utilizar cámara.

## Mecánica

El monitor presenta una secuencia.

Los jugadores deben reproducirla.

La dificultad aumenta progresivamente.

Ejemplo:

```text
Nivel 1:
Arriba

Nivel 2:
Arriba → Derecha

Nivel 3:
Arriba → Derecha → Izquierda
```

## Output

El monitor muestra:

* Secuencia.
* Progreso.
* Jugadores eliminados o activos.
* Nivel.
* Ganador.

Este juego debe ser fácil de entender sin explicaciones largas.

---

# JUEGO 5 — LABERINTO DE EQUILIBRIO

Este es el juego principal de precisión.

## Concepto

El jugador controla un escenario inclinando su teléfono.

En la pantalla principal existe un laberinto o plataforma.

El jugador debe llevar una esfera u objeto desde un punto inicial hasta un objetivo.

## Entrada

Utilizar:

* Giroscopio.
* Orientación.
* Inclinación.

## Mecánica

La inclinación del teléfono modifica la dirección de movimiento del objeto.

Ejemplo:

```text
Inclinar a la izquierda → objeto se mueve a la izquierda
Inclinar a la derecha → objeto se mueve a la derecha
Inclinar hacia adelante → objeto avanza
Inclinar hacia atrás → objeto retrocede
```

Debe existir:

* Física simple.
* Obstáculos.
* Zonas peligrosas.
* Niveles progresivos.

## Objetivo

Este juego debe tener más profundidad que los demás.

Debe ser un juego que permita mejorar con la práctica.

La progresión debe permitir que un jugador quiera volver repetidamente para superar niveles o mejorar su precisión.

No debe convertirse en un proyecto excesivamente complejo.

La complejidad debe provenir principalmente de:

* Diseño de niveles.
* Precisión.
* Obstáculos.
* Tiempo.
* Dificultad progresiva.

No de gráficos complejos.

---

# JUEGO 6 — EXPERIMENTO 3D: CUBO DE EQUILIBRIO

Este juego existe principalmente para validar el uso de gráficos 3D.

## Tecnología

Utilizar:

* Three.js.

No construir un motor 3D propio.

No crear un mundo abierto.

No crear escenarios complejos.

## Concepto

Un cubo se encuentra sobre una plataforma simple en un entorno 3D minimalista.

El jugador utiliza la inclinación del teléfono para controlar el equilibrio o movimiento.

## Objetivo técnico

Validar:

* Renderizado 3D.
* Integración entre Three.js y sensores móviles.
* Comunicación entre jugador y monitor.
* Rendimiento.

## Escena

Debe contener únicamente los elementos necesarios:

* Plataforma.
* Cubo.
* Objetivo.
* Obstáculos simples si son necesarios.

Evitar:

* Texturas complejas.
* Modelos externos pesados.
* Mundos grandes.
* Iluminación compleja.
* Efectos visuales innecesarios.

Este juego debe mantenerse deliberadamente pequeño.

---

# 8. Diseño visual

El diseño debe ser neutral, limpio y minimalista.

## Paleta

Utilizar principalmente:

* Blancos.
* Grises claros.
* Grises oscuros.
* Negro para contraste.
* Un único color de acento consistente.

No utilizar fondos aleatorios ni colores llamativos sin propósito.

No utilizar múltiples colores decorativos.

La identidad visual debe sentirse:

* Moderna.
* Limpia.
* Tecnológica.
* Casual.
* Fácil de entender.

---

# 9. Tipografía

Utilizar una tipografía sans-serif.

Debe ser:

* Muy legible.
* Moderna.
* Fácil de renderizar.
* Adecuada para móvil y escritorio.

Evitar:

* Tipografías decorativas.
* Exceso de pesos.
* Uso excesivo de negrita.
* Jerarquías tipográficas exageradas.

Utilizar pocos tamaños y pesos tipográficos.

---

# 10. Diseño de interfaz

## Pantalla inicial

La pantalla inicial debe ser extremadamente simple.

Solo debe presentar claramente dos opciones:

```text
MONITOR

JUGADOR
```

No agregar:

* Carruseles.
* Noticias.
* Tutoriales extensos.
* Paneles.
* Explicaciones largas.
* Funcionalidades sociales.

---

# 11. Flujo del monitor

El flujo debe ser:

```text
Abrir aplicación
        ↓
Seleccionar MONITOR
        ↓
Crear sesión
        ↓
Generar PIN
        ↓
Mostrar PIN
        ↓
Esperar jugadores
        ↓
Seleccionar juego
        ↓
Validar cantidad de jugadores
        ↓
Iniciar partida
        ↓
Mostrar resultado
        ↓
Volver a selección de juego
```

El PIN debe ser grande y claramente visible.

Los jugadores conectados deben mostrarse de forma simple.

No sobrecargar la pantalla con información técnica.

---

# 12. Flujo del jugador

El flujo debe ser:

```text
Abrir aplicación
        ↓
Seleccionar JUGADOR
        ↓
Ingresar PIN
        ↓
Conectarse
        ↓
Esperar inicio
        ↓
Recibir interfaz específica del juego
        ↓
Jugar
        ↓
Ver resultado
```

Cada juego puede definir su propia interfaz móvil.

No utilizar una interfaz genérica llena de botones.

La interfaz del teléfono debe cambiar dependiendo del juego.

---

# 13. Arquitectura de juegos

Crear una interfaz o contrato común para todos los juegos.

Conceptualmente, cada juego debe poder registrar:

```text
GameDefinition
```

Con información similar a:

```text
id

name

minPlayers

maxPlayers

requiredSensors

gameStates

monitorComponent

playerComponent

initializeGame()

startGame()

handlePlayerInput()

finishGame()

cleanup()
```

La implementación concreta puede variar, pero el principio es obligatorio:

> Agregar un nuevo juego no debe requerir modificar la lógica central de todos los juegos existentes.

---

# 14. Estado de sesión

La aplicación debe manejar claramente los estados de una sesión.

Ejemplo conceptual:

```text
CREATED
WAITING_FOR_PLAYERS
READY
SELECTING_GAME
STARTING
PLAYING
PAUSED
FINISHED
CLOSED
```

No permitir transiciones inconsistentes.

Por ejemplo:

* No iniciar un juego sin suficientes jugadores.
* No aceptar jugadores cuando la partida ya está bloqueada si el juego no lo permite.
* Limpiar correctamente el estado cuando termina una partida.
* Liberar listeners de sensores cuando un juego finaliza.

---

# 15. Manejo de sensores

La lógica de sensores debe estar abstraída.

No repetir directamente la lógica del acelerómetro dentro de cada juego.

Crear una capa reutilizable.

Ejemplo conceptual:

```text
SensorService
│
├── Motion
├── Orientation
├── Gyroscope
├── Permission
└── Calibration
```

Los juegos deben consumir una interfaz simplificada.

Ejemplo conceptual:

```text
getTilt()

getAcceleration()

getMotionGesture()

calibrate()
```

La implementación debe contemplar diferencias entre dispositivos y navegadores.

Si un sensor no está disponible, mostrar un mensaje corto y claro.

No mostrar errores técnicos al usuario.

---

# 16. Calibración

Los juegos que utilicen inclinación deben poder establecer una posición inicial neutra.

Esto es importante porque cada jugador puede sostener el teléfono de forma diferente.

Debe existir una calibración simple cuando sea necesaria.

Ejemplo:

```text
Mantén el teléfono en posición cómoda
↓
Calibrar
↓
Comenzar
```

La calibración debe ser rápida.

---

# 17. Tecnología recomendada

Priorizar una arquitectura web moderna y simple.

Se recomienda evaluar una estructura basada en:

* React.
* TypeScript.
* Una solución de estado simple y mantenible.
* Canvas 2D cuando sea suficiente.
* Three.js únicamente para el experimento 3D inicial.
* APIs web estándar para sensores.

No introducir librerías adicionales sin una justificación clara.

Regla:

> Cada dependencia debe resolver un problema real.

Evitar instalar librerías únicamente porque son populares.

---

# 18. Gráficos 2D

Para los juegos 2D, evaluar primero la solución más simple.

Posibles opciones:

* Canvas.
* HTML/CSS.
* Una librería ligera para juegos 2D solo si realmente simplifica el desarrollo.

No utilizar Three.js para juegos que claramente pueden resolverse en 2D.

No construir motores gráficos personalizados.

---

# 19. Three.js

Three.js debe utilizarse inicialmente únicamente para el juego experimental del cubo.

El objetivo es validar si la tecnología aporta valor antes de utilizarla en otros juegos.

No convertir automáticamente toda la plataforma en 3D.

La arquitectura debe permitir coexistir:

```text
Juegos 2D
+
Juegos 3D
```

sin obligar a todos los juegos a utilizar el mismo sistema de renderizado.

---

# 20. Miniaturas y recursos visuales

Cada juego debe tener una miniatura o representación visual simple.

Las miniaturas deben ser:

* Consistentes.
* Minimalistas.
* Ligeras.
* Relacionadas directamente con el juego.

Evitar:

* Imágenes pesadas.
* Assets gigantes.
* Diseño visual inconsistente.

Si es posible, priorizar:

* SVG.
* Ilustraciones simples.
* Iconografía consistente.
* Recursos ligeros.

---

# 21. Desarrollo local

El proyecto debe funcionar fácilmente en una computadora local.

Debe existir un flujo claro de desarrollo como:

```text
Instalar dependencias
↓
Ejecutar aplicación localmente
↓
Abrir monitor
↓
Abrir jugadores desde teléfonos conectados a la misma red disponible durante la prueba
↓
Probar conexión y sensores
```

La solución debe ser fácil de ejecutar por un desarrollador sin infraestructura adicional compleja.

No requerir:

* Servidores físicos.
* Máquinas virtuales.
* Docker obligatorio.
* Kubernetes.
* Infraestructura empresarial.

No agregar complejidad de DevOps innecesaria.

---

# 22. Producción

La aplicación debe estar preparada para desplegarse correctamente en Vercel.

Deben existir claramente dos contextos:

## Desarrollo

Para:

* Desarrollo local.
* Pruebas.
* Depuración.
* Pruebas de sensores.
* Pruebas multijugador.

## Producción

Para:

* Aplicación estable.
* Despliegue en Vercel.
* Uso real.

La configuración debe evitar duplicación innecesaria.

La diferencia entre desarrollo y producción debe manejarse mediante configuración y variables de entorno cuando sea necesario.

No crear dos bases de código diferentes.

---

# 23. Despliegues

Configurar una estrategia simple:

```text
Desarrollo local
        ↓
Repositorio
        ↓
Preview / pruebas
        ↓
Producción
```

La rama o flujo de producción debe mantenerse estable.

Los cambios deben poder probarse antes de llegar a producción.

---

# 24. Prioridad de desarrollo

No construir todo simultáneamente.

El desarrollo debe realizarse por fases.

---

# FASE 1 — FUNDACIÓN

Construir:

* Aplicación base.
* Selección Monitor/Jugador.
* Creación de sesión.
* Generación de PIN.
* Unión de jugadores.
* Estado de jugadores.
* Comunicación básica.
* Separación entre interfaz de monitor y jugador.

Objetivo:

Validar que el sistema principal funciona antes de construir juegos.

---

# FASE 2 — SENSORES

Implementar:

* Permisos.
* Lectura de acelerómetro.
* Lectura de orientación.
* Lectura de movimiento.
* Calibración básica.
* Envío de datos desde teléfono al sistema del juego.

Objetivo:

Validar que los teléfonos pueden actuar como controles.

Crear una pequeña pantalla interna de pruebas para visualizar datos de sensores durante desarrollo.

Esta pantalla no debe formar parte de la experiencia final del usuario.

---

# FASE 3 — PRIMER JUEGO VERTICAL COMPLETO

Construir un juego simple de principio a fin.

Se recomienda comenzar con:

**Simón Dice**

Porque permite validar:

* Sesiones.
* Múltiples jugadores.
* Entrada desde sensores.
* Estados.
* Eliminación.
* Resultados.

No avanzar inmediatamente a todos los juegos.

Primero validar la arquitectura con un juego completo.

---

# FASE 4 — JUEGOS 2D

Agregar progresivamente:

1. Simón Dice.
2. Cortar frutas.
3. Dardos.
4. Carrera.
5. Laberinto de equilibrio.

Cada juego debe desarrollarse y probarse individualmente.

No romper juegos anteriores.

---

# FASE 5 — EXPERIMENTO 3D

Implementar el cubo de equilibrio utilizando Three.js.

El objetivo es evaluar:

* Rendimiento.
* Complejidad.
* Integración.
* Experiencia de usuario.

No expandir el uso de 3D hasta validar este prototipo.

---

# FASE 6 — ENDURECIMIENTO

Revisar:

* Reconexión de jugadores.
* Salida de jugadores.
* Cancelación de partidas.
* Limpieza de sensores.
* Limpieza de listeners.
* Estados inválidos.
* Dispositivos sin sensores.
* Orientación de pantalla.
* Rendimiento.
* Errores de conexión.

---

# 25. Principios obligatorios

## Simplicidad

No agregar funcionalidades que no aporten directamente a jugar.

## Modularidad

Cada juego debe ser independiente.

## Configuración

Cada juego define:

* Mínimo de jugadores.
* Máximo de jugadores.
* Sensores requeridos.
* Interfaz.
* Reglas.

## Mantenimiento

El código debe ser:

* Tipado.
* Modular.
* Legible.
* Fácil de modificar.

## Escalabilidad funcional

Agregar un nuevo juego no debe requerir rediseñar toda la aplicación.

## Bajo costo

Evitar infraestructura costosa o innecesaria.

No introducir servicios externos si no son necesarios para resolver un problema real.

## Rendimiento

Priorizar dispositivos móviles normales.

No asumir teléfonos de gama alta.

## UX

El usuario debe entender qué hacer casi inmediatamente.

Los juegos deben explicarse mediante su interacción y diseño.

No utilizar tutoriales extensos.

---

# 26. Prohibiciones

No implementar, salvo que exista una necesidad futura explícita:

* Registro de usuarios.
* Login social.
* Perfiles.
* Base de datos compleja.
* Sistema de amigos.
* Chat.
* Mundo abierto.
* Gráficos AAA.
* Modelos 3D pesados.
* Cámara.
* Visión por computadora.
* Tutoriales largos.
* Menús sobrecargados.
* Animaciones decorativas.
* Dependencias innecesarias.
* Infraestructura empresarial sobredimensionada.

---

# 27. Regla de decisión técnica

Antes de agregar una nueva tecnología, librería o servicio, evaluar:

```text
¿Resuelve un problema real?

¿Reduce realmente la complejidad?

¿Es compatible con la arquitectura actual?

¿Aumenta innecesariamente el costo?

¿Será fácil de mantener?

¿Existe una alternativa más simple?
```

Si una tecnología no aporta una ventaja clara, no agregarla.

---

# 28. Entregables esperados

El desarrollo debe producir:

1. Arquitectura del proyecto.
2. Estructura de carpetas.
3. Configuración de desarrollo local.
4. Configuración de producción.
5. Sistema de sesiones.
6. Sistema de PIN.
7. Sistema de jugadores.
8. Sistema de comunicación en tiempo real compatible con la arquitectura elegida.
9. Capa reutilizable de sensores.
10. Sistema modular de juegos.
11. Interfaz de monitor.
12. Interfaz móvil de jugador.
13. Los cinco juegos 2D.
14. El experimento 3D con Three.js.
15. Documentación técnica mínima y útil.
16. Instrucciones claras para ejecutar localmente.
17. Configuración clara para desplegar en Vercel.

---

# 29. Criterio final

La plataforma no debe sentirse como una aplicación empresarial convertida en videojuego.

Debe sentirse como un sistema directo:

```text
Abrir
↓
Elegir Monitor o Jugador
↓
Ingresar PIN si eres jugador
↓
Conectarse
↓
Elegir juego
↓
Jugar
```

La prioridad absoluta es eliminar fricción.

Cada decisión técnica y visual debe responder a esta pregunta:

> ¿Esto hace que la experiencia de jugar sea más simple, rápida o divertida?

Si la respuesta es no, probablemente no debe agregarse.