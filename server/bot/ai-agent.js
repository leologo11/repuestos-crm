const Anthropic = require('@anthropic-ai/sdk');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_SYSTEM = `Eres Carlos, el asistente de ventas de Web-Repuestos, tienda chilena de repuestos automotrices.

MISIÓN: Atender clientes por WhatsApp y ayudarles a cotizar repuestos de forma rápida y amigable.

Para hacer una cotización necesitas TRES datos:
1. Repuesto exacto (ej: filtro de aceite, pastillas de freno delanteras, correa de distribución)
2. Marca y modelo del vehículo (ej: Toyota Corolla, Hyundai Accent, Kia Rio)
3. Año del vehículo (ej: 2019)

REGLAS DE CONVERSACIÓN:
- Si el cliente saluda sin pedir nada → saluda y pregunta qué repuesto necesita
- Si tienen datos parciales → pide lo que falta, UNA sola cosa por turno
- Orden de preguntas faltantes: primero repuesto → luego modelo → luego año
- Si el cliente pregunta precio antes de dar los datos → pídele primero los datos del vehículo
- Cuando tengas los 3 datos → confirma con entusiasmo y avisa que buscas el mejor precio de proveedores
- Tono: amigable, chileno informal, máximo 3 líneas por respuesta
- Usa emojis con moderación (máx 1-2 por mensaje)
- NUNCA inventes precios ni disponibilidad

FORMATO DE RESPUESTA — responde ÚNICAMENTE con JSON válido, sin markdown, sin texto adicional:

Cuando faltan datos:
{"message":"texto para el cliente","ready":false,"intent":null}

Cuando tienes repuesto + modelo + año completos:
{"message":"mensaje confirmando que vas a buscar el precio","ready":true,"intent":{"repuesto":"nombre exacto","modelo":"marca y modelo","año":"año como texto","cantidad":1}}`;

const PRICE_SYSTEM = 'Eres un vendedor amigable de repuestos chilenos. Escribe en español chileno informal, máximo 2 líneas. Sé entusiasta pero directo.';

function extractJSON(text) {
  try { return JSON.parse(text); } catch (_) {}
  const match = text.match(/\{[\s\S]*?\}/);
  if (match) { try { return JSON.parse(match[0]); } catch (_) {} }
  return null;
}

async function processConversation(dbMessages) {
  const claudeMessages = [];

  for (const m of dbMessages) {
    if (m.from === 'cliente') {
      claudeMessages.push({ role: 'user', content: m.text });
    } else if (m.from === 'bot' && m.text && m.text !== '__processing__') {
      claudeMessages.push({ role: 'assistant', content: m.text });
    }
  }

  if (!claudeMessages.length || claudeMessages[claudeMessages.length - 1].role !== 'user') {
    return null;
  }

  const history = claudeMessages.slice(-40);

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    system: AGENT_SYSTEM,
    messages: history,
  });

  const raw = response.content[0].text;
  const parsed = extractJSON(raw);

  if (!parsed) {
    return { message: raw.trim().slice(0, 300), ready: false, intent: null };
  }

  return parsed;
}

async function generatePriceResponse(intent, bestPrice, margin) {
  const finalPrice = Math.round(bestPrice * (1 + margin));

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    system: PRICE_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Tenemos el ${intent.repuesto} para ${intent.modelo} ${intent.año || ''} a $${finalPrice.toLocaleString('es-CL')}. Escribe un mensaje corto confirmando el precio y preguntando si el cliente quiere proceder con la compra.`,
      },
    ],
  });

  return response.content[0].text.trim();
}

async function parseSupplierOptions(message) {
  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `Eres un analizador de mensajes de proveedores de repuestos automotrices chilenos.

Analiza este mensaje y extrae TODAS las opciones disponibles con precios.

Mensaje del proveedor: "${message}"

Responde ÚNICAMENTE con JSON válido, sin texto adicional:

Si hay UNA sola opción con precio:
{"type":"single","price":NUMERO_ENTERO}

Si hay MÚLTIPLES opciones:
{"type":"multiple","options":[{"label":"Opción 1","description":"descripcion corta","price":NUMERO_ENTERO},{"label":"Opción 2","description":"descripcion corta","price":NUMERO_ENTERO}]}

Si NO hay precio claro:
{"type":"none"}

Reglas: precios en pesos chilenos enteros sin puntos ni símbolo $, mínimo 100.`,
    }],
  });

  try {
    const raw = response.content[0].text.trim();
    const parsed = JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] || raw);
    if (parsed.type === 'none') return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

async function parseSupplierPrice(message) {
  const patterns = [
    /\$\s*([\d.]+)/,
    /([\d.]+)\s*(?:pesos?|clp)/i,
    /precio[:\s]+([\d.]+)/i,
    /valor[:\s]+([\d.]+)/i,
    /disponible[^$\d]*([\d.]+)/i,
  ];

  for (const p of patterns) {
    const match = message.match(p);
    if (match) {
      const num = parseInt(match[1].replace(/\./g, ''), 10);
      if (!isNaN(num) && num >= 100) return num;
    }
  }

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 30,
    messages: [
      {
        role: 'user',
        content: `Extrae el precio en pesos chilenos de este mensaje de proveedor. Responde SOLO con el número entero sin puntos ni símbolos. Si no hay precio, responde "null":\n"${message}"`,
      },
    ],
  });

  const raw = response.content[0].text.trim();
  if (raw === 'null') return null;
  const num = parseInt(raw.replace(/\D/g, ''), 10);
  return isNaN(num) || num < 100 ? null : num;
}

module.exports = { processConversation, generatePriceResponse, parseSupplierPrice, parseSupplierOptions };
