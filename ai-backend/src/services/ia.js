// =====================================================
// Servicio externo: Proveedor de IA (Anthropic - Claude)
// Usa la librería oficial @anthropic-ai/sdk y la llave
// ANTHROPIC_API_KEY del archivo .env
// =====================================================
const Anthropic = require('@anthropic-ai/sdk');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MODELO = process.env.MODELO_IA || 'claude-haiku-5-5';

const PROMPT_SISTEMA = 'Eres un asistente amable y claro. Respondes en español de forma breve.';

// Parámetros comunes a ambas formas de respuesta
function parametros(mensajes) {
  return {
    model: MODELO,
    max_tokens: 16000,
    system: PROMPT_SISTEMA,
    messages: mensajes,                  // [{ role: 'user' | 'assistant', content }]
    output_config: { effort: 'low' },    // chat sencillo: respuestas rápidas y baratas
  };
}

function textoDe(mensaje) {
  if (mensaje.stop_reason === 'refusal') {
    return 'Lo siento, no puedo ayudar con esa petición.';
  }
  return mensaje.content
    .filter(bloque => bloque.type === 'text')
    .map(bloque => bloque.text)
    .join('');
}

// Respuesta normal: devuelve el texto completo
async function responder(mensajes) {
  const respuesta = await anthropic.messages.create(parametros(mensajes));
  return textoDe(respuesta);
}

// Respuesta en streaming: va entregando fragmentos de texto conforme llegan
async function* responderStream(mensajes) {
  const flujo = anthropic.messages.stream(parametros(mensajes));
  for await (const evento of flujo) {
    if (evento.type === 'content_block_delta' && evento.delta.type === 'text_delta') {
      yield evento.delta.text;
    }
  }
  const final = await flujo.finalMessage();
  if (final.stop_reason === 'refusal') yield '\n' + textoDe(final);
}

module.exports = { responder, responderStream, MODELO };
