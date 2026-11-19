# Práctica 6: Integrar un agente IA en un aplicativo web

Chat web conectado a un modelo de IA (Anthropic → `claude-haiku-5-5`), con la arquitectura del diagrama:

| Bloque del diagrama | Archivo |
|---|---|
| Frontend / Componente Chat UI | `ai-frontend/index.html` |
| Lógica de Cliente (Fetch) | `ai-frontend/app.js` |
| Endpoint de Chat `POST /api/chat` + Lógica de Negocio | `ai-backend/server.js` |
| Validación y Control de Acceso | `ai-backend/src/middleware/validacion.js` |
| Gestión de Sesión e Historial + Base de Datos local | `ai-backend/src/services/historial.js` → `data/historial.json` |
| Proveedor de IA / API del Modelo (agente con herramienta) | `ai-backend/src/services/ia.js` |
| Conexión a la BD Sakila (MySQL, solo lectura) | `ai-backend/src/services/bd.js` |
| Manejo de Respuestas (Normal o Streaming) | `ai-backend/server.js` |

## Flujo de una petición
1. El usuario escribe en el chat y `app.js` manda `POST /api/chat` con `{ sessionId, message, stream }`.
2. **Validación**: límite de 10 mensajes por minuto por IP y mensaje no vacío de máximo 2000 caracteres.
3. **Historial**: se cargan los últimos 20 mensajes de la sesión desde la BD local.
4. **IA (agente)**: se envía historial + mensaje nuevo a Claude. Si necesita datos, Claude pide la herramienta `consultar_bd` con un `SELECT`; el backend lo ejecuta en Sakila y le devuelve las filas. Repite hasta tener la respuesta (máx. 8 consultas).
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

### 1.1 Base de datos Sakila (para el agente BD)
1. Descarga Sakila oficial: https://dev.mysql.com/doc/index-other.html → *sakila database* (zip).
2. Cárgala en tu MySQL:
   ```bash
   mysql -u root -p < sakila-schema.sql
   mysql -u root -p < sakila-data.sql
   ```
3. (Recomendado) crea un usuario de solo lectura para el agente:
   ```sql
   CREATE USER 'agente'@'localhost' IDENTIFIED BY 'una_password';
   GRANT SELECT, SHOW VIEW ON sakila.* TO 'agente'@'localhost';
   ```
4. Pon los datos en `.env`: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=sakila`.

Aunque el usuario tuviera más permisos, el backend solo acepta una consulta `SELECT` a la vez, dentro de una transacción de solo lectura, con máximo 10 s y 100 filas. Cada SQL que ejecuta el agente se imprime en la terminal del servidor como `[SQL] ...`.

### 2. Frontend
Abre `ai-frontend/index.html` con doble clic (se abre en el navegador).

### 3. Probar
- Escribe "Hola, ¿qué puedes hacer?" y presiona Enter.
- Haz una pregunta que dependa de la anterior para comprobar que mantiene el contexto.
- Recarga la página: la conversación sigue ahí porque se guardó en `data/historial.json`.
- Desmarca **Streaming** para ver la respuesta normal.
- **Nueva** borra la conversación e inicia otra sesión.

### 4. Preguntas de la tarea "Agente BD"
- "Recomiéndame 3 películas de acción que sean largas (más de 2 horas) pero que la gente alquile muy seguido en la tienda."
- "¿Qué clientes crees que están a punto de dejar el servicio porque llevan mucho tiempo sin alquilar ninguna película?"
- "Hazme un análisis rápido de qué día de la semana hay más movimiento en las tiendas y cuánto dinero promedio se recauda en esos días."

Nota: los datos de Sakila son de 2005-2006, por eso el agente mide la inactividad contra la última renta registrada (14-feb-2006) y no contra la fecha de hoy.

## Endpoints
| Método | Ruta | Uso |
|---|---|---|
| POST | `/api/chat` | Enviar mensaje (`stream: true/false`) |
| GET | `/api/historial/:sessionId` | Obtener la conversación guardada |
| DELETE | `/api/historial/:sessionId` | Borrar la conversación |

## Cambiar de modelo
En `.env`: `MODELO_IA=claude-sonnet-5-5` u `claude-opus-5-5` (o cualquier modelo de Claude).
