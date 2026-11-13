# Control y Monitoreo Web IoT · Excavadora RC (Prácticas 4.1 y 4.2)

Aplicación web progresiva y responsiva (*Mobile First*) publicada en **GitHub Pages** para el **Control Remoto (4.1)** y **Monitoreo en Tiempo Real (4.2)** de la **Excavadora IoT RC · Unidad 01 (`id_vehiculo = 1`)**, integrada con un backend en **AWS EC2 (Python / FastAPI con 21 procedimientos almacenados)**, persistencia en **Amazon RDS (MySQL)** y eventos en vivo mediante **WebSocket Seguro (`WSS`)**.

## Enlaces Oficiales del Proyecto

- **Aplicación Publicada (GitHub Pages):** [https://er-i-ck.github.io/control-excavadora-iot/](https://er-i-ck.github.io/control-excavadora-iot/)
- **Repositorio de Código Fuente:** [https://github.com/er-i-ck/control-excavadora-iot](https://github.com/er-i-ck/control-excavadora-iot)

---

## Arquitectura y Flujo de Datos (CONTROL + MONITOREO)

```text
[ Navegador Web / Móvil (GitHub Pages HTTPS) ]
   ├── Vista 1: CONTROL (Joystick, Botonera 2x4, Paro Prioritario, Rutinas DEMO)
   ├── Vista 2: MONITOREO (Tarjeta Último Movimiento + Tabla Dinámica 10 Registros)
   │
   ├── Cliente REST (apiClient.js - Fetch + AbortController)
   │      ├── GET  /                              -> Salud del Servidor AWS (21 APIs)
   │      ├── GET  /estado/1                      -> Último estado y diagnóstico seguro RDS
   │      ├── GET  /movimientos/historial/1       -> Últimos 10 movimientos individuales en RDS
   │      ├── POST /movimientos/                  -> Ejecución de comandos manuales
   │      └── POST /gestion-demos/iniciar|cancelar -> Control de secuencias DEMO
   │
   └── Cliente WebSocket Compartido (wsClient.js - WSS con Backoff y Resincronización)
          └── WSS  wss://api-vehiculo-erick.duckdns.org/ws/1
                 ├── ESTADO_ACTUAL                -> Sincronización inicial al abrir socket
                 ├── NUEVO_MOVIMIENTO             -> Actualiza tarjeta y reconcilia tabla vía REST
                 └── INICIO_DEMO / MOVIMIENTO_DEMO / FIN_DEMO / DEMO_CANCELADA
                        -> Actualiza tarjeta de estado sin contaminar historial individual
Estructura Modular del Proyecto
Plaintext
control-excavadora-iot/
├── index.html                        # Interfaz unificada (Vistas CONTROL y MONITOREO + Créditos)
├── README.md                         # Documentación técnica (Prácticas 4.1 y 4.2)
└── assets/
    ├── img/
    │   └── favicon.svg               # Favicon vectorial original de la Excavadora IoT
    ├── css/
    │   └── styles.css                # Diseño Mobile First fijo (100dvh) vertical y horizontal
    └── js/
        ├── config.js                 # URLs HTTPS/WSS, ID de vehículo y catálogo de comandos
        ├── dateUtils.js              # Conversión segura de fechas UTC (RDS) a America/Mexico_City
        ├── apiClient.js              # Cliente HTTP modular con Fetch, async/await y timeouts
        ├── wsClient.js               # Conexión WSS única compartida con reconexión progresiva
        ├── uiState.js                # Gestión de los 3 indicadores (WSS, AWS, RDS) y bloqueos DOM
        ├── navigation.js             # Navegación accesible por pestañas sin recargar la página
        ├── joystick.js               # Joystick táctil/mouse con zona neutral y retorno a PARAR
        ├── movementController.js     # Reglas de envío, pulsos auxiliares y prioridad de DETENER
        ├── demoController.js         # Consulta, ejecución, cancelación y desbloqueo de DEMO
        ├── monitorController.js      # Sincronización del último movimiento y tabla de 10 registros
        └── main.js                   # Punto de entrada que coordina vistas, salud y eventos
Contratos de Integración con AWS
URL Base HTTPS: https://api-vehiculo-erick.duckdns.org

Canal WebSocket Seguro (WSS): wss://api-vehiculo-erick.duckdns.org/ws/1

Catálogo de Códigos (id_comando): 1 (AVANZAR), 2 (RETROCEDER), 3 (GIRAR_IZQUIERDA), 4 (GIRAR_DERECHA), 5 (PARAR), 6 (GRUA_SUBIR), 7 (GRUA_BAJAR), 8 (DIAG_IZQ), 9 (DIAG_DER), 11 (SONIDO), 12 (ENCENDER), 13 (APAGAR), 14 (LUZ).