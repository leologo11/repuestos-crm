const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode  = require('qrcode-terminal');
const QRCode  = require('qrcode');

const Conversation = require('../models/Conversation');
const Quote        = require('../models/Quote');
const Proveedor    = require('../models/Proveedor');
const Cliente      = require('../models/Cliente');
const { processConversation, generatePriceResponse, parseSupplierPrice, parseSupplierOptions } = require('./ai-agent');

let botStatus     = 'disconnected';
let lastQRDataURL = null;

// Mapeo LID → teléfono real, construido al enviar mensajes a proveedores
const lidToPhone = new Map();

const waClient = new Client({
  authStrategy: new LocalAuth({ dataPath: '.wwebjs_auth' }),
  puppeteer: {
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    ...(process.env.PUPPETEER_EXECUTABLE_PATH
      ? { executablePath: process.env.PUPPETEER_EXECUTABLE_PATH }
      : {}),
  },
});

waClient.on('qr', async (qr) => {
  botStatus = 'qr_pending';
  qrcode.generate(qr, { small: true });
  console.log('[SERVIDOR] 📱 Escanea el QR con WhatsApp para conectar el bot');
  lastQRDataURL = await QRCode.toDataURL(qr);
  if (global.io) global.io.emit('bot:qr', { qrDataURL: lastQRDataURL });
});

waClient.on('ready', async () => {
  botStatus = 'connected';
  lastQRDataURL = null;
  console.log('[SERVIDOR] ✅ WhatsApp Bot conectado y listo');
  if (global.io) global.io.emit('bot:status', { status: 'connected' });
  // Cargar LIDs guardados en DB para sobrevivir reinicios
  await loadLidCacheFromDB();
});

waClient.on('disconnected', () => {
  botStatus = 'disconnected';
  console.log('[SERVIDOR] ❌ WhatsApp Bot desconectado');
  if (global.io) global.io.emit('bot:status', { status: 'disconnected' });
});

waClient.on('message', async (msg) => {
  if (msg.from.endsWith('@g.us')) return; // ignorar grupos
  if (!msg.body?.trim())           return; // ignorar media sin texto

  // Resolver el número real — maneja @c.us y @lid (linked devices)
  let chatId, phone;

  try {
    const contact = await msg.getContact();
    const num = (contact.number || '').replace(/\D/g, '');
    // Solo aceptar si parece un teléfono real (7-14 dígitos)
    if (num.length >= 7 && num.length <= 14) {
      phone = num.length <= 9 && !num.startsWith('56') ? '56' + num : num;
      chatId = phone + '@c.us';
    }
  } catch (_) {}

  // Fallback 1: usar msg.from si es @c.us
  if (!phone && msg.from.endsWith('@c.us')) {
    phone  = msg.from.split('@')[0];
    chatId = msg.from;
  }

  // Fallback 2: buscar en caché LID → teléfono real
  if (!phone || phone.replace(/\D/g, '').length > 14) {
    const lidUser = msg.from.split('@')[0];
    const cached  = lidToPhone.get(lidUser);
    if (cached) {
      phone  = cached;
      chatId = phone + '@c.us';
      console.log(`[BOT] Teléfono resuelto por caché LID: ${lidUser} → ${phone}`);
    } else {
      // Último recurso: usar el LID como identificador temporal
      phone  = lidUser;
      chatId = msg.from.endsWith('@c.us') ? msg.from : lidUser + '@c.us';
    }
  }

  const text = msg.body.trim();

  try {
    const proveedor = await findProveedor(phone, msg.from);
    if (proveedor) {
      await handleSupplierMessage(chatId, phone, text, proveedor);
    } else {
      await handleClientMessage(chatId, phone, text, msg);
    }
  } catch (err) {
    console.error('[SERVIDOR] Error procesando mensaje:', err.message);
  }
});

// Carga los LIDs guardados en DB al mapa en memoria (llamar al iniciar)
async function loadLidCacheFromDB() {
  try {
    const proveedores = await Proveedor.find({ alternate_ids: { $exists: true, $not: { $size: 0 } } });
    for (const p of proveedores) {
      const realPhone = (p.whatsapp || '').replace(/\D/g, '');
      for (const lid of (p.alternate_ids || [])) {
        lidToPhone.set(lid, realPhone);
      }
    }
    if (lidToPhone.size > 0) console.log(`[BOT] LID cache cargado: ${lidToPhone.size} entradas`);
  } catch (_) {}
}

// Guarda un LID en la DB y en el caché en memoria
async function cacheLid(lidUser, realPhone, proveedorId) {
  if (!lidUser || !realPhone || lidUser === realPhone) return;
  if (lidToPhone.get(lidUser) === realPhone) return; // ya cacheado
  lidToPhone.set(lidUser, realPhone);
  console.log(`[BOT] LID guardado en DB: ${lidUser} → ${realPhone}`);
  await Proveedor.findByIdAndUpdate(proveedorId, { $addToSet: { alternate_ids: lidUser } }).catch(() => {});
}

async function findProveedor(phone, rawFrom) {
  const lidUser = rawFrom ? rawFrom.split('@')[0] : null;
  const digits  = (phone || '').replace(/\D/g, '');

  // 1. Buscar por teléfono directo (últimos 9 dígitos)
  const proveedores = await Proveedor.find({ whatsapp: { $exists: true, $ne: '' } });
  if (digits.length >= 7) {
    const last9 = digits.slice(-9);
    const byPhone = proveedores.find((p) =>
      (p.whatsapp || '').replace(/\D/g, '').slice(-9) === last9
    );
    if (byPhone) return byPhone;
  }

  // 2. Buscar por LID en alternate_ids guardados en DB
  if (lidUser) {
    const byAltId = await Proveedor.findOne({ alternate_ids: lidUser });
    if (byAltId) {
      console.log(`[BOT] Proveedor identificado por alternate_id en DB: ${lidUser}`);
      return byAltId;
    }
  }

  // 3. Buscar en caché en memoria (por si aún no se persistió)
  if (lidUser) {
    const cachedPhone = lidToPhone.get(lidUser);
    if (cachedPhone) {
      const cached9 = cachedPhone.slice(-9);
      const byCache = proveedores.find((p) =>
        (p.whatsapp || '').replace(/\D/g, '').slice(-9) === cached9
      );
      if (byCache) {
        console.log(`[BOT] Proveedor identificado por caché memoria: ${lidUser} → ${cachedPhone}`);
        return byCache;
      }
    }
  }

  return null;
}

// Detecta si un string parece un número de teléfono real (no un LID)
function isRealPhone(p) {
  const d = (p || '').replace(/\D/g, '');
  return d.length >= 7 && d.length <= 14;
}

async function handleClientMessage(chatId, phone, text, msg) {
  const rawLidUser = msg.from.split('@')[0];

  const isLid = !isRealPhone(phone); // teléfonos LID tienen >14 dígitos

  // Buscar conversación: por teléfono directo O por LID en alternate_ids
  let conv = await Conversation.findOne({
    $or: [
      { customer_phone: phone },
      { alternate_ids: rawLidUser },
      { alternate_ids: phone },
    ],
  });

  // Si el phone es un LID y no encontramos conversación:
  // buscar la conversación activa más reciente que esté en cualquier estado activo del cliente
  if (!conv && isLid) {
    const recent = await Conversation.findOne({
      status: {
        $in: [
          'esperando_seleccion', 'esperando_cliente', 'esperando_proveedor',
          'esperando_confirmacion', 'esperando_direccion',
          'pedido_pendiente_pago', 'pago_confirmado',
        ],
      },
      bot_active: true,
      updatedAt:  { $gt: new Date(Date.now() - 4 * 60 * 60 * 1000) }, // últimas 4 horas
    }).sort({ updatedAt: -1 });

    if (recent) {
      conv  = recent;
      const realPhone = recent.customer_phone.replace(/\D/g, '');
      lidToPhone.set(rawLidUser, realPhone);
      await Conversation.findByIdAndUpdate(recent._id, { $addToSet: { alternate_ids: rawLidUser } });
      chatId = buildChatId(realPhone);
      phone  = realPhone;
      console.log(`[BOT] LID ${rawLidUser} asociado a conv de "${recent.customer_name}" (${realPhone})`);
    } else {
      console.warn(`[BOT] LID ${rawLidUser} sin conversación conocida — ignorando`);
      return; // no crear conversación basura con un LID como teléfono
    }
  }

  // Si encontramos la conv pero el teléfono guardado era un LID y ahora tenemos el real → unificar
  if (conv && !isRealPhone(conv.customer_phone) && isRealPhone(phone)) {
    console.log(`[BOT] Unificando conversación: ${conv.customer_phone} → ${phone}`);
    const oldPhone = conv.customer_phone;
    conv.alternate_ids = [...new Set([...(conv.alternate_ids || []), oldPhone, rawLidUser])];
    conv.customer_phone = phone;
    await conv.save();
    await Cliente.findOneAndUpdate({ telefono: oldPhone }, { telefono: phone }).catch(() => {});
  }

  const isNew = !conv;

  if (!conv) {
    const altIds = rawLidUser !== phone ? [rawLidUser] : [];

    // Verificar si es un cliente registrado para personalizar el saludo
    const clienteExistente = await Cliente.findOne({ telefono: phone }).select('nombre registered').lean();
    const nombreCliente = clienteExistente?.nombre || msg.notifyName || phone;

    conv = await Conversation.create({
      customer_phone: phone,
      customer_name:  nombreCliente,
      alternate_ids:  altIds,
      messages:       [],
      bot_active:     true,
      status:         'esperando_cliente',
    });

    await Cliente.findOneAndUpdate(
      { telefono: phone },
      { $setOnInsert: { nombre: nombreCliente, telefono: phone } },
      { upsert: true }
    );

    // Saludo personalizado para clientes registrados
    if (clienteExistente?.registered) {
      conv.messages.push({ from: 'cliente', text });
      const bienvenida = `¡Hola de nuevo, *${nombreCliente.split(' ')[0]}*! 👋 ¿Qué repuesto necesitas hoy?`;
      await waClient.sendMessage(chatId, bienvenida).catch(() => {});
      conv.messages.push({ from: 'bot', text: bienvenida });
      await conv.save();
      if (global.io) {
        global.io.emit('conversation:new', {
          _id: conv._id.toString(), customer_name: conv.customer_name,
          customer_phone: conv.customer_phone, status: conv.status,
          bot_active: conv.bot_active, updatedAt: new Date(),
        });
        global.io.emit('conversation:message', { conversationId: conv._id.toString(), message: { from: 'bot', text: bienvenida, ts: new Date() } });
      }
      return;
    }
  } else if (rawLidUser && rawLidUser !== phone && !conv.alternate_ids?.includes(rawLidUser)) {
    // Agregar LID a alternate_ids si no estaba
    await Conversation.findByIdAndUpdate(conv._id, { $addToSet: { alternate_ids: rawLidUser } });
  }

  // Flujos de estado especiales — sin pasar por la IA
  if (conv.status === 'esperando_seleccion' && conv.pending_options?.length) {
    return handleOptionSelection(chatId, phone, text, conv);
  }
  if (conv.status === 'esperando_confirmacion') {
    return handlePurchaseConfirmation(chatId, phone, text, conv);
  }
  if (conv.status === 'esperando_direccion') {
    return handleAddressCapture(chatId, phone, text, conv);
  }
  if (conv.status === 'intervencion_humana') {
    // Proveedor consultado o caso complejo — no usar IA, guardar y notificar al admin
    conv.messages.push({ from: 'cliente', text });
    await conv.save();
    const holdMsg = '⏳ Nuestro equipo está revisando tu consulta. Te respondemos a la brevedad 🙏';
    await waClient.sendMessage(chatId, holdMsg).catch(() => {});
    conv.messages.push({ from: 'bot', text: holdMsg });
    await conv.save();
    if (global.io) {
      global.io.emit('conversation:message', { conversationId: conv._id.toString(), message: { from: 'cliente', text, ts: new Date() } });
      global.io.emit('conversation:message', { conversationId: conv._id.toString(), message: { from: 'bot', text: holdMsg, ts: new Date() } });
    }
    return;
  }
  if (conv.status === 'pedido_pendiente_pago' || conv.status === 'pago_confirmado') {
    // Pedido ya cerrado — respuesta genérica
    const msg = '⏳ Tu pedido está siendo procesado. Te avisaremos cuando esté listo para despacho.';
    await waClient.sendMessage(chatId, msg).catch(() => {});
    return;
  }

  conv.messages.push({ from: 'cliente', text });
  await conv.save();

  const socketConvData = {
    _id:              conv._id.toString(),
    customer_name:    conv.customer_name,
    customer_phone:   conv.customer_phone,
    customer_vehicle: conv.customer_vehicle || '',
    status:           conv.status,
    bot_active:       conv.bot_active,
    updatedAt:        new Date(),
  };

  if (global.io) {
    if (isNew) global.io.emit('conversation:new', socketConvData);
    global.io.emit('conversation:message', {
      conversationId: conv._id.toString(),
      message: { from: 'cliente', text, ts: new Date() },
    });
  }

  if (!conv.bot_active) return;

  try {
    const result = await processConversation(conv.messages);
    if (!result) return;

    await waClient.sendMessage(chatId, result.message);
    conv.messages.push({ from: 'bot', text: result.message });

    if (result.ready && result.intent) {
      conv.pending_intent   = result.intent;
      conv.customer_vehicle = `${result.intent.modelo} ${result.intent.año || ''}`.trim();
      conv.status           = 'esperando_proveedor';
      await conv.save();

      if (global.io) {
        global.io.emit('conversation:updated', {
          conversationId:   conv._id.toString(),
          status:           conv.status,
          customer_vehicle: conv.customer_vehicle,
        });
      }

      // Fan-out separado — sus errores NO deben enviar el mensaje de "disculpa" al cliente
      createQuoteAndFanOut(conv, result.intent).catch((err) =>
        console.error('[SERVIDOR] Error creando cotización:', err.message)
      );
    } else {
      conv.status = 'esperando_cliente';
      await conv.save();
    }

    if (global.io) {
      global.io.emit('conversation:message', {
        conversationId: conv._id.toString(),
        message: { from: 'bot', text: result.message, ts: new Date() },
      });
    }
  } catch (err) {
    console.error('[SERVIDOR] Error IA:', err.message);
    const fallback = 'Disculpa, tuve un problema técnico momentáneo. Intenta de nuevo 🔧';
    await waClient.sendMessage(chatId, fallback).catch(() => {});
  }
}

async function createQuoteAndFanOut(conv, intent) {
  const proveedores = await Proveedor.find({ estado: 'Activo' });

  if (proveedores.length === 0) {
    const clientChatId = buildChatId(conv.customer_phone);
    await waClient.sendMessage(clientChatId, 'Por el momento no tenemos proveedores disponibles. Te contactaremos pronto 🙏');
    return;
  }

  const quote = await Quote.create({
    conversation_id: conv._id,
    item_description: intent.repuesto,
    vehicle_model:    intent.modelo,
    vehicle_year:     intent.año,
    margin:           parseFloat(process.env.MARGIN_DEFAULT || '0.28'),
    supplier_responses: proveedores.map((p) => ({
      supplier_id:   p._id,
      supplier_name: p.nombre,
      status:        'esperando',
    })),
  });

  const requestText =
    `📋 *Solicitud de cotización*\n\n` +
    `Repuesto: *${intent.repuesto}*\n` +
    `Vehículo: *${intent.modelo} ${intent.año || ''}*\n` +
    `Cantidad: ${intent.cantidad || 1}\n\n` +
    `Responde con el precio disponible 👇`;

  for (const p of proveedores) {
    if (p.whatsapp) {
      try {
        const sentMsg = await waClient.sendMessage(buildChatId(p.whatsapp), requestText);
        // Capturar el LID real al que WhatsApp enrutó el mensaje
        try {
          const chat = await sentMsg.getChat();
          await cacheLid(chat.id.user, p.whatsapp.replace(/\D/g, ''), p._id);
        } catch (_) {}
      } catch (e) {
        console.log(`[SERVIDOR] No se pudo enviar a ${p.nombre}: ${e.message}`);
      }
    }
  }

  if (global.io) global.io.emit('quote:created', { conversationId: conv._id.toString(), quote });

  const timeoutMs = parseInt(process.env.SUPPLIER_TIMEOUT_MS || '600000', 10);
  setTimeout(async () => {
    try {
      const fresh = await Quote.findById(quote._id);
      if (!fresh) return;
      const anyResponse = fresh.supplier_responses.some((r) => r.price);
      if (!anyResponse) {
        await Conversation.findByIdAndUpdate(conv._id, { status: 'intervencion_humana' });
        if (global.io) {
          global.io.emit('conversation:updated', {
            conversationId: conv._id.toString(),
            status: 'intervencion_humana',
          });
        }
      }
    } catch (_) {}
  }, timeoutMs);
}

const CONFIRM_WORDS = /^(s[ií]|yes|ok|dale|quiero|perfecto|confirmo|acepto|vamos|listo|1|afirm)/i;
const CANCEL_WORDS  = /^(no\b(?! sé| hay| tengo)|nope|cancelar|no gracias|no quiero|olv[ií]d|rechaz|no me interesa|dejalo|déjalo)/i;

async function handlePurchaseConfirmation(chatId, phone, text, conv) {
  conv.messages.push({ from: 'cliente', text });
  if (global.io) global.io.emit('conversation:message', { conversationId: conv._id.toString(), message: { from: 'cliente', text, ts: new Date() } });

  if (CONFIRM_WORDS.test(text.trim())) {
    // → Cliente confirma la compra
    const msg = '📍 Perfecto! Para coordinar el despacho necesito tu *dirección de entrega*.\n\nEscríbela completa (calle, número, comuna, ciudad):';
    await waClient.sendMessage(chatId, msg);
    conv.messages.push({ from: 'bot', text: msg });
    conv.status = 'esperando_direccion';
    await conv.save();
    await updatePedidoStatus(conv._id, 'precio_aceptado');
    if (global.io) {
      global.io.emit('conversation:message', { conversationId: conv._id.toString(), message: { from: 'bot', text: msg, ts: new Date() } });
      global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: 'esperando_direccion' });
    }

  } else if (CANCEL_WORDS.test(text.trim())) {
    // → Cliente no quiere comprar
    const msg = '👍 Sin problema, no hay apuro. Si cambias de idea o necesitas otro repuesto, escríbenos cuando quieras 🙋';
    await waClient.sendMessage(chatId, msg);
    conv.messages.push({ from: 'bot', text: msg });
    conv.status = 'cerrado';
    await conv.save();
    if (global.io) {
      global.io.emit('conversation:message', { conversationId: conv._id.toString(), message: { from: 'bot', text: msg, ts: new Date() } });
      global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: 'cerrado' });
    }

  } else {
    // → Cliente tiene una pregunta, duda o quiere agregar algo
    await handleClientFollowUp(chatId, phone, text, conv);
  }
}

// Maneja preguntas/dudas del cliente después de recibir una cotización
async function handleClientFollowUp(chatId, phone, text, conv) {
  const quote = await Quote.findOne({ conversation_id: conv._id, status: 'activo' });
  const respondedResp = quote?.supplier_responses?.find((r) => r.price && r.supplier_id);
  let forwarded = false;

  // Intentar reenviar la consulta al proveedor que cotizó
  if (respondedResp) {
    const proveedor = await Proveedor.findById(respondedResp.supplier_id);
    if (proveedor?.whatsapp) {
      const intent = conv.pending_intent || {};
      const fwdMsg =
        `❓ *Consulta del cliente sobre tu cotización:*\n\n` +
        `"${text}"\n\n` +
        `Repuesto: ${intent.repuesto || quote?.item_description || '—'}\n` +
        `Vehículo: ${intent.modelo || quote?.vehicle_model || '—'}\n\n` +
        `Por favor responde esta duda para confirmar la venta 🙏`;
      try {
        await sendMessage(proveedor.whatsapp, fwdMsg);
        respondedResp.status = 'consulta'; // marcar como esperando respuesta de seguimiento
        await quote.save();
        forwarded = true;
        console.log(`[BOT] Consulta del cliente reenviada al proveedor ${proveedor.nombre}`);
      } catch (e) {
        console.error('[BOT] No se pudo reenviar consulta al proveedor:', e.message);
      }
    }
  }

  const clientReply = forwarded
    ? '🔍 Buena pregunta! Estoy consultando con el proveedor, te respondo en breve ⏳'
    : '👋 Entendido. Un asesor revisará tu consulta y te responderá a la brevedad.';

  await waClient.sendMessage(chatId, clientReply);
  conv.messages.push({ from: 'bot', text: clientReply });

  // Siempre alertar al admin para que pueda intervenir si se complica
  conv.status = 'intervencion_humana';
  await conv.save();

  if (global.io) {
    global.io.emit('conversation:message', { conversationId: conv._id.toString(), message: { from: 'bot', text: clientReply, ts: new Date() } });
    global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: 'intervencion_humana' });
  }
}

async function handleAddressCapture(chatId, phone, text, conv) {
  conv.messages.push({ from: 'cliente', text });
  conv.delivery_address = text.trim();
  conv.status = 'pedido_pendiente_pago';

  // Actualizar el pedido con la dirección
  const Pedido = require('../models/Pedido');
  const updatedPedido = await Pedido.findOneAndUpdate(
    { conversation_id: conv._id },
    { delivery_address: text.trim(), status: 'precio_aceptado' },
    { new: true }
  ).catch(() => null);
  if (updatedPedido && global.io) global.io.emit('pedido:updated', updatedPedido);

  const quote = await Quote.findOne({ conversation_id: conv._id, status: 'activo' });
  const precio = quote?.final_price?.toLocaleString('es-CL') || '—';

  const msg =
    `✅ *¡Pedido registrado!*\n\n` +
    `📦 ${conv.pending_intent?.repuesto || quote?.item_description || 'Repuesto'}\n` +
    `📍 Dirección: ${text.trim()}\n` +
    `💰 Total a pagar: $${precio}\n\n` +
    `🏦 Realiza la transferencia y envíanos el comprobante por aquí.\n` +
    `Una vez confirmado el pago, procederemos con el despacho. 🚚`;

  await waClient.sendMessage(chatId, msg);
  conv.messages.push({ from: 'bot', text: msg });

  // Enviar link de seguimiento con código y teléfono
  if (updatedPedido?.secretCode) {
    const landingUrl = process.env.LANDING_URL || 'http://localhost:3000';
    const trackMsg =
      `📱 *Sigue tu pedido en línea:*\n` +
      `${landingUrl}\n\n` +
      `Código: *${updatedPedido.secretCode}*\n` +
      `Teléfono: *+${conv.customer_phone}*\n\n` +
      `_Guarda estos datos para rastrear tu envío y crear tu cuenta de cliente._`;
    await waClient.sendMessage(chatId, trackMsg);
    conv.messages.push({ from: 'bot', text: trackMsg });
  }

  await conv.save();

  if (global.io) {
    global.io.emit('conversation:message', { conversationId: conv._id.toString(), message: { from: 'bot', text: msg, ts: new Date() } });
    global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: 'pedido_pendiente_pago' });
  }
}

async function handleOptionSelection(chatId, phone, text, conv) {
  const options = conv.pending_options;
  const lower   = text.toLowerCase().trim();

  // Intentar detectar la selección: número (1,2,3) o palabra clave
  let chosen = null;
  const numMatch = lower.match(/^(\d+)/);
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1;
    if (idx >= 0 && idx < options.length) chosen = options[idx];
  }
  if (!chosen) {
    // Buscar por texto parcial en la descripción
    chosen = options.find((o) =>
      lower.includes(o.label?.toLowerCase()) ||
      lower.includes(o.description?.toLowerCase().split(' ')[0])
    );
  }

  if (!chosen) {
    // No se entendió la selección — volver a mostrar opciones
    const reask = buildOptionsMessage(conv.pending_intent, options, '¿Cuál prefieres? Responde con el número de la opción 👆');
    await waClient.sendMessage(chatId, reask);
    conv.messages.push({ from: 'bot', text: reask });
    await conv.save();
    if (global.io) global.io.emit('conversation:message', { conversationId: conv._id.toString(), message: { from: 'bot', text: reask, ts: new Date() } });
    return;
  }

  // Cliente seleccionó una opción
  conv.messages.push({ from: 'cliente', text });
  const confirm = buildQuoteMessage(conv.pending_intent, chosen.finalPrice, chosen.description);
  await waClient.sendMessage(chatId, confirm);
  conv.messages.push({ from: 'bot', text: confirm });
  conv.status          = 'esperando_confirmacion';
  conv.pending_options = null;

  // Actualizar la cotización con el precio seleccionado
  const quote = await Quote.findOne({ conversation_id: conv._id, status: 'activo' });
  if (quote) {
    quote.best_price  = chosen.price;
    quote.final_price = chosen.finalPrice;
    const resp = quote.supplier_responses.find((r) => r.status === 'respondido');
    if (resp) { resp.price = chosen.price; resp.selected = true; }
    await quote.save();
  }

  await conv.save();
  await updatePedidoStatus(conv._id, 'precio_enviado');
  if (global.io) {
    global.io.emit('conversation:message', { conversationId: conv._id.toString(), message: { from: 'bot', text: confirm, ts: new Date() } });
    global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: conv.status });
  }
}

function buildOptionsMessage(intent, options, footer = '') {
  const nums = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'];
  const lines = [
    `📋 *Opciones para ${intent?.repuesto || 'tu repuesto'}*`,
    `━━━━━━━━━━━━━━━━━━━━`,
  ];
  options.forEach((o, i) => {
    lines.push(`${nums[i] || (i+1+'.')} *${o.label}*`);
    if (o.description) lines.push(`   ${o.description}`);
    lines.push(`   💰 $${o.finalPrice.toLocaleString('es-CL')}`);
    if (i < options.length - 1) lines.push('');
  });
  lines.push('━━━━━━━━━━━━━━━━━━━━');
  if (footer) lines.push(footer);
  return lines.join('\n');
}

async function handleSupplierMessage(chatId, phone, text, proveedor) {
  // Buscar cotización activa donde el proveedor tenga respuesta pendiente O consulta de seguimiento
  const quote = await Quote.findOne({
    'supplier_responses': {
      $elemMatch: { supplier_id: proveedor._id, status: { $in: ['esperando', 'consulta'] } },
    },
    status: 'activo',
  }).populate('conversation_id');

  if (!quote) {
    console.log(`[BOT] Mensaje de proveedor ${proveedor.nombre} pero no hay cotización activa esperando.`);
    return;
  }

  const resp = quote.supplier_responses.find(
    (r) => r.supplier_id?.toString() === proveedor._id.toString() &&
           ['esperando', 'consulta'].includes(r.status)
  );

  // Si es respuesta de seguimiento (el cliente había preguntado algo)
  if (resp?.status === 'consulta') {
    await handleSupplierFollowUpAnswer(quote, resp, text);
    return;
  }

  // Analizar si el proveedor da una o varias opciones (flujo normal de precio)
  const parsed = await parseSupplierOptions(text);
  if (!parsed) {
    console.log(`[BOT] No se pudo extraer precio del mensaje del proveedor: "${text}"`);
    return;
  }

  const margin = quote.margin || 0.28;
  // resp ya fue declarado arriba (el objeto con status 'esperando')
  const conv   = quote.conversation_id;
  const intent = conv.pending_intent || { repuesto: quote.item_description, modelo: quote.vehicle_model, año: quote.vehicle_year };
  const clientChatId = buildChatId(conv.customer_phone);

  if (parsed.type === 'single') {
    // Una sola opción — responder directo al cliente
    const bestPrice  = parsed.price;
    const finalPrice = Math.round(bestPrice * (1 + margin));

    if (resp) {
      resp.price        = bestPrice;
      resp.status       = 'respondido';
      resp.responded_at = new Date();
      resp.selected     = true;
    }
    quote.best_price  = bestPrice;
    quote.final_price = finalPrice;
    await quote.save();

    const msg = buildQuoteMessage(intent, finalPrice);
    await waClient.sendMessage(clientChatId, msg);
    conv.messages.push({ from: 'bot', text: msg });
    conv.status = 'esperando_confirmacion';
    await conv.save();
    await updatePedidoStatus(conv._id, 'precio_enviado');

    if (global.io) {
      global.io.emit('quote:updated',        { conversationId: conv._id.toString(), quote });
      global.io.emit('conversation:message', { conversationId: conv._id.toString(), message: { from: 'bot', text: msg, ts: new Date() } });
      global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: 'esperando_confirmacion' });
    }

  } else if (parsed.type === 'multiple') {
    // Varias opciones — preguntar al cliente cuál quiere
    const options = parsed.options.map((o, i) => ({
      label:       o.label || `Opción ${i + 1}`,
      description: o.description || '',
      price:       o.price,
      finalPrice:  Math.round(o.price * (1 + margin)),
    }));

    if (resp) {
      resp.options      = options;
      resp.status       = 'respondido';
      resp.responded_at = new Date();
    }
    await quote.save();

    // Guardar opciones en la conversación para cuando el cliente conteste
    conv.pending_options = options;
    conv.status          = 'esperando_seleccion';

    const optionsMsg = buildOptionsMessage(intent, options,
      'Responde con el *número* de la opción que prefieres 👇'
    );
    await waClient.sendMessage(clientChatId, optionsMsg);
    conv.messages.push({ from: 'bot', text: optionsMsg });
    await conv.save();

    if (global.io) {
      global.io.emit('quote:updated',        { conversationId: conv._id.toString(), quote });
      global.io.emit('conversation:message', { conversationId: conv._id.toString(), message: { from: 'bot', text: optionsMsg, ts: new Date() } });
      global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: 'esperando_seleccion' });
    }
  }
}

// Retransmite la respuesta del proveedor al cliente y vuelve a preguntar si quiere comprar
async function handleSupplierFollowUpAnswer(quote, resp, text) {
  const conv         = quote.conversation_id;
  const clientChatId = buildChatId(conv.customer_phone);
  const intent       = conv.pending_intent || { repuesto: quote.item_description, modelo: quote.vehicle_model };

  // Retransmitir la respuesta del proveedor al cliente
  const relayMsg = `💬 *Respuesta del proveedor:*\n\n${text}`;
  await waClient.sendMessage(clientChatId, relayMsg);
  conv.messages.push({ from: 'bot', text: relayMsg });

  // Verificar si el proveedor también actualizó el precio en su respuesta
  const parsed = await parseSupplierOptions(text).catch(() => null);
  if (parsed?.type === 'single' && parsed.price) {
    const margin = quote.margin || 0.28;
    const newFinal = Math.round(parsed.price * (1 + margin));
    quote.best_price  = parsed.price;
    quote.final_price = newFinal;
    resp.price = parsed.price;
    console.log(`[BOT] Proveedor actualizó precio en respuesta de seguimiento: $${parsed.price}`);
  }

  // Marcar resp como respondida nuevamente y volver a ofrecer la compra
  resp.status = 'respondido';
  await quote.save();

  const finalPrice = quote.final_price;
  if (finalPrice) {
    const reAskMsg = buildQuoteMessage(intent, finalPrice);
    await waClient.sendMessage(clientChatId, reAskMsg);
    conv.messages.push({ from: 'bot', text: reAskMsg });
  }

  conv.status = 'esperando_confirmacion';
  await conv.save();

  if (global.io) {
    global.io.emit('conversation:message', { conversationId: conv._id.toString(), message: { from: 'bot', text: relayMsg, ts: new Date() } });
    global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: 'esperando_confirmacion' });
  }

  console.log(`[BOT] Respuesta de seguimiento retransmitida al cliente y cotización reactivada`);
}

function buildQuoteMessage(intent, finalPrice, supplierName) {
  const precio = finalPrice.toLocaleString('es-CL');
  const lines = [
    `🔧 *COTIZACIÓN WEB-REPUESTOS*`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `📦 *Repuesto:* ${intent.repuesto}`,
    `🚗 *Vehículo:* ${intent.modelo}${intent.año ? ' ' + intent.año : ''}`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `💰 *Precio: $${precio}*`,
    `   _(incluye IVA · stock disponible)_`,
    `━━━━━━━━━━━━━━━━━━━━`,
    `¿Quieres proceder con la compra? 🛒`,
    `Responde *SÍ* para confirmar o escríbenos si tienes alguna pregunta 👇`,
  ];
  return lines.join('\n');
}

async function updatePedidoStatus(conversationId, status) {
  try {
    const Pedido = require('../models/Pedido');
    const pedido = await Pedido.findOneAndUpdate(
      { conversation_id: conversationId },
      { status },
      { new: true }
    );
    if (pedido && global.io) global.io.emit('pedido:updated', pedido);
    return pedido;
  } catch (_) {}
}

function buildChatId(phoneOrChatId) {
  if (!phoneOrChatId) return null;
  if (phoneOrChatId.includes('@c.us')) return phoneOrChatId;
  const digits = phoneOrChatId.replace(/\D/g, '');
  return (digits.startsWith('56') ? digits : '56' + digits) + '@c.us';
}

function initialize() { waClient.initialize(); }
function getStatus()   { return { status: botStatus, qrDataURL: lastQRDataURL }; }

async function sendMessage(phoneOrChatId, text) {
  if (botStatus !== 'connected') throw new Error(`Bot no conectado (estado: ${botStatus})`);
  const chatId = buildChatId(phoneOrChatId);
  if (!chatId) throw new Error('chatId inválido');

  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout: el bot tardó más de 15s en enviar')), 15000)
  );
  const sentMsg = await Promise.race([waClient.sendMessage(chatId, text), timeout]);

  // Cachear LID en DB por si el destinatario usa dispositivo vinculado
  try {
    const chat = await sentMsg.getChat();
    const realPhone = phoneOrChatId.replace(/\D/g, '');
    const proveedor = await Proveedor.findOne({
      whatsapp: { $regex: realPhone.slice(-9) },
    });
    if (proveedor) await cacheLid(chat.id.user, realPhone, proveedor._id);
    else lidToPhone.set(chat.id.user, realPhone);
  } catch (_) {}
  return sentMsg;
}

module.exports = { initialize, getStatus, sendMessage };
