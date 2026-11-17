// =====================================================
// Validación y Control de Acceso (bloque del diagrama)
// Se ejecuta ANTES de tocar la BD o llamar a la IA.
// =====================================================

const MAX_CARACTERES = 2000;
const LIMITE_PETICIONES = 10;      // máximo de mensajes...
const VENTANA_MS = 60 * 1000;      // ...por minuto, por IP

const registroIPs = new Map(); // ip -> [timestamps]

// Control de acceso: limita peticiones por IP para no gastar saldo de la API
function limitarPeticiones(req, res, next) {
  const ip = req.ip;
  const ahora = Date.now();
  const recientes = (registroIPs.get(ip) || []).filter(t => ahora - t < VENTANA_MS);

  if (recientes.length >= LIMITE_PETICIONES) {
    return res.status(429).json({ error: 'Demasiadas peticiones. Espera un minuto.' });
  }

  recientes.push(ahora);
  registroIPs.set(ip, recientes);
  next();
}

// Validación del cuerpo de la petición
function validarMensaje(req, res, next) {
  const { sessionId, message } = req.body || {};

  if (typeof sessionId !== 'string' || !/^[a-zA-Z0-9-]{8,64}$/.test(sessionId)) {
    return res.status(400).json({ error: 'sessionId inválido.' });
  }
  if (typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'El mensaje no puede estar vacío.' });
  }
  if (message.length > MAX_CARACTERES) {
    return res.status(400).json({ error: `El mensaje supera ${MAX_CARACTERES} caracteres.` });
  }

  req.body.message = message.trim();
  next();
}

module.exports = { limitarPeticiones, validarMensaje };
