// =====================================================
// CLIENT SIDE - Lógica de Cliente (Fetch)
// El historial vive en el backend (BD); aquí solo guardamos
// el id de sesión para que la conversación sobreviva al recargar.
// =====================================================
const API_URL = 'http://localhost:3001/api';

let sessionId = obtenerSessionId();

function obtenerSessionId() {
  let id = null;
  try { id = localStorage.getItem('sessionId'); } catch {}
  if (!id) {
    id = crypto.randomUUID();
    try { localStorage.setItem('sessionId', id); } catch {}
  }
  return id;
}

// Al abrir la página, cargar la conversación guardada en la BD
window.addEventListener('DOMContentLoaded', async () => {
  try {
    const res = await fetch(`${API_URL}/historial/${sessionId}`);
    const mensajes = await res.json();
    mensajes.forEach(m => appendMessage(m.content, m.role));
    scrollAbajo();
  } catch {
    appendMessage('No se pudo conectar con el servidor. ¿Está corriendo el backend?', 'error');
  }
});

async function sendMessage() {
  const inputField = document.getElementById('userInput');
  const sendBtn = document.getElementById('sendBtn');
  const usarStream = document.getElementById('streamToggle').checked;
  const text = inputField.value.trim();

  if (!text) return;

  // 1. Mostrar mensaje del usuario en la UI
  appendMessage(text, 'user');
  inputField.value = '';
  sendBtn.disabled = true;
  scrollAbajo();

  try {
    // 2. Enviar petición al Backend
    const response = await fetch(`${API_URL}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, message: text, stream: usarStream }),
    });

    // Errores de validación / límite de peticiones / servidor
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      appendMessage(data.error || 'Error del servidor.', 'error');
      return;
    }

    // 3a. Respuesta en STREAMING: se va escribiendo poco a poco
    if (usarStream) {
      const burbuja = appendMessage('', 'assistant');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        burbuja.textContent += decoder.decode(value, { stream: true });
        scrollAbajo();
      }
    } else {
      // 3b. Respuesta NORMAL: llega completa
      const data = await response.json();
      appendMessage(data.reply, 'assistant');
    }
  } catch (error) {
    console.error('Error de red:', error);
    appendMessage('Error de conexión con el servidor.', 'error');
  } finally {
    sendBtn.disabled = false;
    inputField.focus();
    scrollAbajo();
  }
}

async function nuevaConversacion() {
  // Primero limpiar la pantalla y cambiar de sesión, luego borrar la anterior en el servidor
  const sesionAnterior = sessionId;
  document.getElementById('chatBox').innerHTML = '';
  try { localStorage.removeItem('sessionId'); } catch {}
  sessionId = obtenerSessionId();
  try { await fetch(`${API_URL}/historial/${sesionAnterior}`, { method: 'DELETE' }); } catch {}
}

function appendMessage(text, sender) {
  const chatBox = document.getElementById('chatBox');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${sender}`;
  messageDiv.textContent = text;
  chatBox.appendChild(messageDiv);
  return messageDiv;
}

function scrollAbajo() {
  const chatBox = document.getElementById('chatBox');
  chatBox.scrollTop = chatBox.scrollHeight;
}

function handleKeyPress(event) {
  if (event.key === 'Enter') sendMessage();
}
