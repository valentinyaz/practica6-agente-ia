// =====================================================
// Conexión a la base de datos Sakila (MySQL) - SOLO LECTURA
// El agente IA usa esta función como herramienta para
// consultar datos reales de la tienda de películas.
// =====================================================
const mysql = require('mysql2/promise');

const MAX_FILAS = 100;          // no mandar tablas enormes a la IA
const TIEMPO_MAX_MS = 10000;    // cortar consultas que tarden demasiado

let pool;
function obtenerPool() {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'sakila',
      connectionLimit: 3,
      dateStrings: true,        // fechas como texto legible
    });
  }
  return pool;
}

// Solo deja pasar UNA consulta de lectura
function validarSQL(sql) {
  const limpio = String(sql).trim().replace(/;\s*$/, '');
  if (!limpio) throw new Error('La consulta está vacía.');
  if (limpio.includes(';')) throw new Error('Solo se permite una consulta a la vez.');
  if (!/^(select|with|show|describe|desc|explain)\b/i.test(limpio)) {
    throw new Error('Solo se permiten consultas de lectura (SELECT).');
  }
  return limpio;
}

async function consultar(sql) {
  const consulta = validarSQL(sql);
  const conexion = await obtenerPool().getConnection();
  try {
    await conexion.query(`SET SESSION MAX_EXECUTION_TIME = ${TIEMPO_MAX_MS}`);
    await conexion.query("SET SESSION lc_time_names = 'es_MX'"); // DAYNAME/MONTHNAME en español
    // Transacción de solo lectura: MySQL rechaza cualquier escritura
    await conexion.query('START TRANSACTION READ ONLY');
    const [filas] = await conexion.query(consulta);
    const lista = Array.isArray(filas) ? filas : [filas];
    return {
      total_filas: lista.length,
      filas: lista.slice(0, MAX_FILAS),
      recortado: lista.length > MAX_FILAS,
    };
  } finally {
    await conexion.query('ROLLBACK').catch(() => {});
    conexion.release();
  }
}

module.exports = { consultar };
