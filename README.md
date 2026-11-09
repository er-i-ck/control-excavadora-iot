# Control Web Responsivo para Excavadora IoT · AWS, FastAPI, RDS y WSS

Interfaz web **Mobile First** desarrollada con HTML5 semántico, Bootstrap 5, CSS personalizado y **JavaScript Modules (ES6)** para el control remoto y ejecución de secuencias DEMO de una excavadora IoT mediante **REST API (HTTPS)** y **WebSocket Seguro (WSS)** desplegados en **Amazon EC2** y **Amazon RDS MySQL**.

## 1. Estructura del Proyecto

```text
control-excavadora-iot/
├── index.html                  # Interfaz responsiva Mobile First, accesibilidad y créditos
├── README.md                   # Documentación técnica, ejecución local y contratos de API
├── assets/
│   └── img/
│       └── favicon.svg         # Favicon vectorial original del proyecto IoT
├── css/
│   └── styles.css              # Estilos personalizados, Joystick circular y estados táctiles (>=44px)
└── js/
    ├── config.js               # URLs base HTTPS/WSS, ID de vehículo y catálogo de comandos
    ├── apiClient.js            # Cliente REST modular (Fetch, async/await, timeouts con AbortController)
    ├── wsClient.js             # Cliente WebSocket Seguro (WSS) con reconexión automática
    ├── uiState.js              # Gestión de los 3 indicadores (WSS, AWS, RDS) y trazabilidad en 3 pasos
    ├── joystick.js             # Joystick circular táctil/mouse con zona muerta y retorno a DETENER
    ├── movementController.js   # Lógica unificada de comandos, control anti-ráfagas y prioridad DETENER
    ├── demoController.js       # Consulta, previsualización, inicio y cancelación de secuencias DEMO
    └── main.js                 # Inicializador modular de la aplicación