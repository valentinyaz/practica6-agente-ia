// =====================================================
// Gestión de Sesión e Historial + Base de Datos local
// Guarda las conversaciones en data/historial.json
// { "sessionId": [ {role, content, fecha}, ... ] }
// =====================================================
const fs = require('fs');
const path = require('path');

const RUTA_BD = path.join(__dirname, '..', '..', 'data', 'historial.json');
const MAX_MENSAJES_CONTEXTO = 20; // límite de contexto que se manda a la IA

function leerBD() {
  try {
    return JSON.parse(fs.readFileSync(RUTA_BD, 'utf8'));
  } catch {
    return {}; // si el archivo no existe o está vacío
  }
}

function escribirBD(datos) {
  fs.mkdirSync(path.dirname(RUTA_BD), { recursive: true });
  fs.writeFileSync(RUTA_BD, JSON.stringify(datos, null, 2));
}

// Historial completo de una sesión (para mostrarlo en el frontend)
function obtenerHistorial(sessionId) {
  return leerBD()[sessionId] || [];
}

// Historial recortado en formato que entiende la API de IA
function obtenerContexto(sessionId) {
  return obtenerHistorial(sessionId)
    .slice(-MAX_MENSAJES_CONTEXTO)
    .map(({ role, content }) => ({ role, content }));
}

function guardarMensaje(sessionId, role, content) {
  const bd = leerBD();
  if (!bd[sessionId]) bd[sessionId] = [];
  bd[sessionId].push({ role, content, fecha: new Date().toISOString() });
  escribirBD(bd);
}

function borrarHistorial(sessionId) {
  const bd = leerBD();
  delete bd[sessionId];
  escribirBD(bd);
}

module.exports = { obtenerHistorial, obtenerContexto, guardarMensaje, borrarHistorial };
