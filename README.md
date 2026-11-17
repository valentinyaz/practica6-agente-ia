# Práctica 6: Integrar un agente IA en un aplicativo web

Chat web conectado a un modelo de IA (Anthropic → `claude-haiku-5-5`), con la arquitectura del diagrama:

| Bloque del diagrama | Archivo |
|---|---|
| Frontend / Componente Chat UI | `ai-frontend/index.html` |
| Lógica de Cliente (Fetch) | `ai-frontend/app.js` |
| Endpoint de Chat `POST /api/chat` + Lógica de Negocio | `ai-backend/server.js` |
| Validación y Control de Acceso | `ai-backend/src/middleware/validacion.js` |
| Gestión de Sesión e Historial + Base de Datos local | `ai-backend/src/services/historial.js` → `data/historial.json` |
| Proveedor de IA / API del Modelo | `ai-backend/src/services/ia.js` |
| Manejo de Respuestas (Normal o Streaming) | `ai-backend/server.js` |

## Flujo de una petición
1. El usuario escribe en el chat y `app.js` manda `POST /api/chat` con `{ sessionId, message, stream }`.
2. **Validación**: límite de 10 mensajes por minuto por IP y mensaje no vacío de máximo 2000 caracteres.
3. **Historial**: se cargan los últimos 20 mensajes de la sesión desde la BD local.
4. **IA**: se envía historial + mensaje nuevo a la API de Anthropic (Claude).
5. **Respuesta**: en streaming (se escribe poco a poco) o normal (llega completa).
6. Se guardan el mensaje del usuario y la respuesta en la BD.

## Cómo ejecutarlo

### 1. Backend
```bash
cd ai-backend
npm install
cp .env.example .env
```
Edita `.env` y pon tu API key de Anthropic (https://console.anthropic.com):
```
ANTHROPIC_API_KEY=sk-ant-...
```
Arranca el servidor:
```bash
npm start
```
Debe aparecer: `Servidor corriendo en http://localhost:3001`

### 2. Frontend
Abre `ai-frontend/index.html` con doble clic (se abre en el navegador).

### 3. Probar
- Escribe "Hola, ¿qué puedes hacer?" y presiona Enter.
- Haz una pregunta que dependa de la anterior para comprobar que mantiene el contexto.
- Recarga la página: la conversación sigue ahí porque se guardó en `data/historial.json`.
- Desmarca **Streaming** para ver la respuesta normal.
- **Nueva** borra la conversación e inicia otra sesión.

## Endpoints
| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/chat` | Enviar mensaje (`stream: true/false`) |
| GET | `/api/historial/:sessionId` | Obtener la conversación guardada |
| DELETE | `/api/historial/:sessionId` | Borrar la conversación |

## Cambiar de modelo
En `.env`: `MODELO_IA=claude-sonnet-5-5` u `claude-opus-5-5` (o cualquier modelo de Claude).
