# CV Review Bot

Un bot avanzado para revisión y análisis de currículums vitae que funciona a través de Telegram, con soporte futuro para WhatsApp.

## Características

- **Análisis completo de CVs**: Extracción de información clave como educación, experiencia, habilidades
- **Interfaz conversacional**: Experiencia de usuario intuitiva mediante Telegram
- **Análisis avanzado**: Validación de información y detección de inconsistencias
- **Sugerencias personalizadas**: Recomendaciones para mejorar el CV
- **Almacenamiento seguro**: Integración con Firebase para almacenamiento seguro de datos
- **Arquitectura escalable**: Sistema híbrido Node.js/Python para rendimiento óptimo

## Estructura del proyecto

```
.
├── src/
│   ├── telegram-bot/      # Bot de Telegram (Node.js)
│   ├── config/            # Configuraciones
│   ├── utils/             # Utilidades
│   └── index.js           # Punto de entrada
├── cv-analyzer/           # Servicio de análisis de CVs (Python)
│   ├── api/               # API para comunicación con el bot
│   └── requirements/      # Dependencias de Python
├── functions/             # Funciones serverless para Firebase
├── package.json           # Dependencias Node.js
└── README.md              # Documentación
```

## Requisitos previos

- Node.js (v16+)
- Python (v3.8+)
- Cuenta en Firebase
- Bot de Telegram (token generado mediante @BotFather)

## Configuración

1. Clonar el repositorio
2. Instalar dependencias de Node.js:
   ```
   npm install
   ```
3. Instalar dependencias de Python:
   ```
   cd cv-analyzer
   pip install -r requirements/requirements.txt
   ```
4. Configurar variables de entorno (crear archivo .env en la raíz):
   ```
   TELEGRAM_BOT_TOKEN=your_telegram_token
   FIREBASE_PROJECT_ID=your_firebase_project_id
   ```
5. Iniciar el proyecto:
   ```
   npm run dev
   ```

## Despliegue

El proyecto está diseñado para ser desplegado en:
- Firebase Cloud Functions (bot de Telegram)
- Google Cloud Run (servicio de análisis de CVs)
- Firebase Firestore (base de datos)
- Firebase Storage (almacenamiento de archivos)

## Licencia

MIT
