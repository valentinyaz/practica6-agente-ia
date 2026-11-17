// =====================================================
// BACKEND SIDE - Servidor / API (Node.js + Express)
// Flujo: Endpoint -> Validación -> Lógica de negocio
//        -> Historial (BD) -> IA -> Respuesta (normal o streaming)
// =====================================================
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { limitarPeticiones, validarMensaje } = require('./src/middleware/validacion');
const historial = require('./src/services/historial');
const ia = require('./src/services/ia');

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Falta ANTHROPIC_API_KEY en el archivo .env');
  process.exit(1);
}

const app = express();
app.use(express.json());
app.use(cors());

// ---------- Endpoint de Chat: POST /api/chat ----------
app.post('/api/chat', limitarPeticiones, validarMensaje, async (req, res) => {
  const { sessionId, message, stream } = req.body;

  try {
    // Lógica de negocio: cargar contexto previo y agregar el mensaje nuevo
    const contexto = historial.obtenerContexto(sessionId);
    const mensajes = [...contexto, { role: 'user', content: message }];
    historial.guardarMensaje(sessionId, 'user', message);

    // ---------- Manejo de Respuestas: STREAMING ----------
    if (stream) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache');

      let respuestaCompleta = '';

      for await (const texto of ia.responderStream(mensajes)) {
        respuestaCompleta += texto;
        res.write(texto); // se envía al cliente en cuanto llega
      }

      historial.guardarMensaje(sessionId, 'assistant', respuestaCompleta);
      return res.end();
    }

    // ---------- Manejo de Respuestas: NORMAL ----------
    const reply = await ia.responder(mensajes);
    historial.guardarMensaje(sessionId, 'assistant', reply);
    res.json({ reply });

  } catch (error) {
    console.error('Error al comunicarse con la IA:', error.message);
    if (res.headersSent) return res.end('\n[Error: se interrumpió la respuesta]');
    res.status(500).json({ error: 'Error interno al procesar la solicitud con la IA' });
  }
});

// ---------- Historial de una sesión (para recargar el chat) ----------
app.get('/api/historial/:sessionId', (req, res) => {
  res.json(historial.obtenerHistorial(req.params.sessionId));
});

// ---------- Borrar conversación ----------
app.delete('/api/historial/:sessionId', (req, res) => {
  historial.borrarHistorial(req.params.sessionId);
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT} (modelo: ${ia.MODELO})`);
});
