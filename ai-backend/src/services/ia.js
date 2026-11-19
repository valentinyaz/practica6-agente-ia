// =====================================================
// Servicio externo: Proveedor de IA (Anthropic - Claude)
// Agente con una herramienta: consultar_bd (Sakila, solo lectura).
// Bucle del agente: Claude pide una consulta SQL -> la ejecutamos
// -> le devolvemos el resultado -> repite hasta dar la respuesta.
// =====================================================
const Anthropic = require('@anthropic-ai/sdk');
const bd = require('./bd');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODELO = process.env.MODELO_IA || 'claude-haiku-5-5';
const MAX_VUELTAS = 8; // máximo de consultas a la BD por pregunta

const PROMPT_SISTEMA = `Eres un agente de análisis de datos de una cadena de renta de películas.
Tienes acceso de solo lectura a la base de datos MySQL "sakila" mediante la herramienta consultar_bd.
Respondes en español, de forma clara y breve.

Tablas principales de sakila:
- film(film_id, title, description, release_year, rental_duration, rental_rate, length [minutos], replacement_cost, rating)
- category(category_id, name)  -- ej. 'Action', 'Comedy'
- film_category(film_id, category_id)
- inventory(inventory_id, film_id, store_id)  -- copias físicas de cada película en cada tienda
- rental(rental_id, rental_date, inventory_id, customer_id, return_date, staff_id)
- payment(payment_id, customer_id, staff_id, rental_id, amount, payment_date)
- customer(customer_id, store_id, first_name, last_name, email, address_id, active, create_date)
- store(store_id, manager_staff_id, address_id)
- staff(staff_id, first_name, last_name, store_id)
- address(address_id, address, district, city_id, phone), city(city_id, city, country_id), country(country_id, country)
- actor(actor_id, first_name, last_name), film_actor(actor_id, film_id)

Reglas:
- Usa SIEMPRE la base de datos para responder preguntas sobre películas, clientes, rentas o pagos; nunca inventes datos.
- Los datos son históricos (2005-2006). Para "hoy" o "hace mucho tiempo" toma como referencia la fecha de renta más reciente de la base (MAX(rental_date)), no la fecha actual.
- Cuando la pregunta sea ambigua, elige un criterio razonable y dilo en una frase.
- Da los números concretos (títulos, nombres, fechas, cantidades, montos).
- No uses tablas ni negritas de markdown; usa listas simples con guiones.
- Tus respuestas anteriores en esta conversación sí salieron de consultas a la base; las consultas no se guardan en el historial, así que no las pongas en duda por no verlas.`;

const HERRAMIENTAS = [
  {
    name: 'consultar_bd',
    description:
      'Ejecuta UNA consulta SQL de solo lectura (SELECT) en la base de datos MySQL sakila y devuelve las filas en JSON (máximo 100 filas). Usa LIMIT, GROUP BY y funciones de agregación para resumir.',
    eager_input_streaming: true,
    input_schema: {
      type: 'object',
      properties: {
        sql: { type: 'string', description: 'Consulta SELECT de MySQL a ejecutar.' },
      },
      required: ['sql'],
    },
  },
];

function parametros(mensajes) {
  return {
    model: MODELO,
    max_tokens: 16000,
    system: PROMPT_SISTEMA,
    tools: HERRAMIENTAS,
    messages: mensajes,
    output_config: { effort: 'medium' }, // pensar un poco para armar buen SQL
  };
}

// Ejecuta una llamada a herramienta y arma el tool_result
async function ejecutarHerramienta(uso) {
  const sql = uso.input && uso.input.sql;
  if (uso.name !== 'consultar_bd' || typeof sql !== 'string' || !sql.trim()) {
    return { type: 'tool_result', tool_use_id: uso.id, is_error: true,
             content: 'Entrada inválida: se esperaba {"sql": "SELECT ..."}' };
  }
  console.log('[SQL]', sql.replace(/\s+/g, ' ').trim());
  try {
    const resultado = await bd.consultar(sql);
    return { type: 'tool_result', tool_use_id: uso.id, content: JSON.stringify(resultado) };
  } catch (error) {
    console.log('[SQL error]', error.message);
    return { type: 'tool_result', tool_use_id: uso.id, is_error: true,
             content: `Error de MySQL: ${error.message}` };
  }
}

// Respuesta en streaming: va entregando fragmentos de texto conforme llegan,
// y entre medio ejecuta las consultas que pida el agente.
async function* responderStream(mensajes) {
  const conversacion = [...mensajes];
  let reintentosJSON = 0;

  for (let vuelta = 0; vuelta < MAX_VUELTAS; vuelta++) {
    const flujo = anthropic.messages.stream(parametros(conversacion));
    let escribioTexto = false;

    let mensaje;
    try {
      for await (const evento of flujo) {
        if (evento.type === 'content_block_delta' && evento.delta.type === 'text_delta') {
          escribioTexto = true;
          yield evento.delta.text;
        }
      }
      mensaje = await flujo.finalMessage();
      reintentosJSON = 0;
    } catch (error) {
      // Solo se reintenta si la entrada de la herramienta llegó como JSON inválido
      if (error instanceof Anthropic.APIError || reintentosJSON++ >= 2) throw error;
      continue;
    }

    if (mensaje.stop_reason === 'refusal') {
      yield '\nLo siento, no puedo ayudar con esa petición.';
      return;
    }
    if (mensaje.stop_reason === 'pause_turn') {
      conversacion.push({ role: 'assistant', content: mensaje.content });
      continue;
    }

    const usos = mensaje.content.filter(bloque => bloque.type === 'tool_use');
    if (usos.length === 0) return; // respuesta final
    if (mensaje.stop_reason === 'max_tokens') throw new Error('Respuesta cortada (max_tokens)');

    conversacion.push({ role: 'assistant', content: mensaje.content });
    const resultados = [];
    for (const uso of usos) resultados.push(await ejecutarHerramienta(uso));
    conversacion.push({ role: 'user', content: resultados });

    if (escribioTexto) yield '\n\n';
  }
  yield '\n[Se alcanzó el límite de consultas a la base de datos]';
}

// Respuesta normal: junta todo el texto y lo devuelve completo
async function responder(mensajes) {
  let texto = '';
  for await (const fragmento of responderStream(mensajes)) texto += fragmento;
  return texto;
}

module.exports = { responder, responderStream, MODELO };
