const QRCode = require('qrcode');
const qrcode = require('qrcode-terminal');
const pino   = require('pino');

const Conversation  = require('../models/Conversation');
const Quote         = require('../models/Quote');
const Proveedor     = require('../models/Proveedor');
const Cliente       = require('../models/Cliente');
const { useMongoAuthState } = require('./mongoAuthState');
const { processConversation, parseSupplierOptions } = require('./ai-agent');

let botStatus          = 'disconnected';
let lastQRDataURL      = null;
let sock               = null;
let failCount          = 0;   // disconnects seguidos sin QR ni conexión exitosa
let sessionOk          = false; // true después de primer QR o conexión

// ── JID / phone helpers ────────────────────────────────────────
function normalizePhone(raw) {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('56') && d.length >= 10) return d;
  return '56' + d;
}

function buildJid(phone) {
  if (!phone) return null;
  if (phone.includes('@s.whatsapp.net')) return phone;
  return normalizePhone(phone) + '@s.whatsapp.net';
}

function phoneFromJid(jid) {
  if (!jid) return '';
  return normalizePhone(jid.split('@')[0].split(':')[0]);
}

// ── Limpia sesión MongoDB (fuerza nuevo QR) ────────────────────
async function clearMongoSession() {
  try {
    const AuthState = require('../models/AuthState');
    await AuthState.deleteMany({});
    console.log('[BOT] 🗑️  Sesion MongoDB limpiada → se generará nuevo QR');
  } catch (e) {
    console.error('[BOT] Error limpiando sesión:', e.message);
  }
}

// ── Inicialización Baileys (sesión en MongoDB, sin Chrome) ─────
async function startBot() {
  try {
    const {
      default: makeWASocket,
      DisconnectReason,
      fetchLatestBaileysVersion,
    } = await import('@whiskeysockets/baileys');

    let authResult;
    try {
      authResult = await useMongoAuthState();
      console.log('[BOT] Sesion cargada desde MongoDB');
    } catch (mongoErr) {
      console.error('[BOT] MongoDB auth falló, usando archivo local:', mongoErr.message);
      const { useMultiFileAuthState } = await import('@whiskeysockets/baileys');
      authResult = await useMultiFileAuthState('.baileys_auth');
    }
    const { state, saveCreds } = authResult;
    let version;
    try {
      ({ version } = await fetchLatestBaileysVersion());
    } catch (_) {
      version = [2, 3000, 1015901307];
    }

    sock = makeWASocket({
      version,
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: 'silent' }),
      generateHighQualityLinkPreview: false,
      browser: ['Web-Repuestos', 'Chrome', '120.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 25000,
      markOnlineOnConnect: false,
      syncFullHistory: false,
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
      if (qr) {
        sessionOk = true;   // QR generado = sesión en buen estado
        failCount = 0;
        botStatus = 'qr_pending';
        console.log('\n====================================================');
        console.log('  📱 ESCANEA ESTE QR CON TU WHATSAPP');
        console.log('  WhatsApp → Dispositivos vinculados → Vincular dispositivo');
        console.log('====================================================\n');
        qrcode.generate(qr, { small: true });
        console.log('\n====================================================\n');
        try {
          lastQRDataURL = await QRCode.toDataURL(qr);
          if (global.io) global.io.emit('bot:qr', { qrDataURL: lastQRDataURL });
        } catch (_) {}
      }

      if (connection === 'open') {
        sessionOk = true;
        failCount = 0;
        botStatus = 'connected';
        lastQRDataURL = null;
        console.log('[SERVIDOR] ✅ WhatsApp Bot conectado y listo');
        if (global.io) global.io.emit('bot:status', { status: 'connected' });
      }

      if (connection === 'close') {
        const code      = lastDisconnect?.error?.output?.statusCode;
        const loggedOut = code === DisconnectReason.loggedOut;
        console.log('[SERVIDOR] ❌ Desconectado. Código:', code ?? 'sin código');
        botStatus = 'disconnected';
        sock = null;
        if (global.io) global.io.emit('bot:status', { status: 'disconnected' });

        // Si cae sin código y nunca vimos QR/conexión → sesión corrupta en MongoDB
        if (!sessionOk) {
          failCount++;
          console.log(`[BOT] Fallo ${failCount}/3 sin sesión válida`);
          if (failCount >= 3) {
            failCount = 0;
            await clearMongoSession();
          }
        }

        const delay = loggedOut ? 2000 : Math.min(5000 * failCount || 5000, 30000);
        console.log(`[SERVIDOR] 🔄 Reconectando en ${delay / 1000}s...`);
        setTimeout(startBot, delay);
      }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      if (type !== 'notify') return;
      for (const msg of messages) {
        if (!msg.message) continue;
        if (msg.key.fromMe) continue;
        const jid = msg.key.remoteJid || '';
        if (jid.endsWith('@g.us')) continue;
        await handleIncomingMessage(msg).catch((err) =>
          console.error('[SERVIDOR] Error procesando mensaje:', err.message)
        );
      }
    });

  } catch (err) {
    console.error('[SERVIDOR] Error iniciando bot:', err.message);
    botStatus = 'disconnected';
    sock = null;
    setTimeout(startBot, 10000);
  }
}

// ── Despacho de mensajes entrantes ─────────────────────────────
async function handleIncomingMessage(msg) {
  const jid    = msg.key.remoteJid;
  const phone  = phoneFromJid(jid);
  const text   = (
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.imageMessage?.caption ||
    msg.message?.videoMessage?.caption || ''
  ).trim();
  if (!text) return;

  const pushName = msg.pushName || phone;

  const proveedor = await findProveedor(phone);
  if (proveedor) {
    await handleSupplierMessage(jid, phone, text, proveedor);
  } else {
    await handleClientMessage(jid, phone, text, pushName);
  }
}

async function findProveedor(phone) {
  if (!phone) return null;
  const norm = normalizePhone(phone);
  if (norm.length < 8) return null;
  const last9 = norm.slice(-9);

  const proveedores = await Proveedor.find({ whatsapp: { $exists: true, $ne: '' } });
  const found = proveedores.find((p) => {
    const pNorm = normalizePhone(p.whatsapp || '');
    return pNorm.slice(-9) === last9;
  });

  if (found) {
    console.log(`[BOT] Proveedor identificado: ${found.nombre} (${norm})`);
  } else {
    console.log(`[BOT] Mensaje de cliente: ${norm}`);
  }
  return found || null;
}

// ── Cliente ────────────────────────────────────────────────────
async function handleClientMessage(jid, phone, text, pushName) {
  // phone is already normalized (56XXXXXXXXX) from phoneFromJid
  let conv = await Conversation.findOne({ customer_phone: phone });
  const isNew = !conv;

  if (!conv) {
    const clienteExistente = await Cliente.findOne({
      telefono: { $in: [phone, phone.slice(-9), phone.replace(/^56/, '')] },
    }).select('nombre').lean();
    const nombreCliente = clienteExistente?.nombre || pushName || phone;

    conv = await Conversation.create({
      customer_phone: phone,
      customer_name:  nombreCliente,
      messages:       [],
      bot_active:     true,
      status:         'esperando_cliente',
    });

    await Cliente.findOneAndUpdate(
      { telefono: { $in: [phone, phone.slice(-9)] } },
      { $setOnInsert: { nombre: nombreCliente, telefono: phone } },
      { upsert: true }
    ).catch(() =>
      Cliente.findOneAndUpdate({ telefono: phone }, { nombre: nombreCliente }, { upsert: true })
    );

    if (clienteExistente) {
      const bienvenida = `¡Hola de nuevo, *${nombreCliente.split(' ')[0]}*! 👋 ¿Qué repuesto necesitas hoy?`;
      await waSend(jid, bienvenida);
      conv.messages.push({ from: 'bot', text: bienvenida });
      await conv.save();
      emitConvNew(conv);
      emitMsg(conv._id, 'bot', bienvenida);
      return;
    }
  }

  if (conv.status === 'esperando_seleccion' && conv.pending_options?.length) {
    return handleOptionSelection(jid, phone, text, conv);
  }
  if (conv.status === 'esperando_confirmacion') {
    return handlePurchaseConfirmation(jid, phone, text, conv);
  }
  if (conv.status === 'esperando_direccion') {
    return handleAddressCapture(jid, phone, text, conv);
  }
  if (conv.status === 'intervencion_humana') {
    conv.messages.push({ from: 'cliente', text });
    await conv.save();
    const holdMsg = '⏳ Nuestro equipo está revisando tu consulta. Te respondemos a la brevedad 🙏';
    await waSend(jid, holdMsg);
    conv.messages.push({ from: 'bot', text: holdMsg });
    await conv.save();
    emitMsg(conv._id, 'cliente', text);
    emitMsg(conv._id, 'bot', holdMsg);
    return;
  }
  if (conv.status === 'pedido_pendiente_pago' || conv.status === 'pago_confirmado') {
    await waSend(jid, '⏳ Tu pedido está siendo procesado. Te avisaremos cuando esté listo para despacho.');
    return;
  }

  conv.messages.push({ from: 'cliente', text });
  await conv.save();

  if (global.io) {
    if (isNew) emitConvNew(conv);
    emitMsg(conv._id, 'cliente', text);
  }

  if (!conv.bot_active) return;

  try {
    const result = await processConversation(conv.messages);
    if (!result) return;

    await waSend(jid, result.message);
    conv.messages.push({ from: 'bot', text: result.message });

    if (result.ready && result.intent) {
      conv.pending_intent   = result.intent;
      conv.customer_vehicle = `${result.intent.modelo} ${result.intent.año || ''}`.trim();
      conv.status           = 'esperando_proveedor';
      await conv.save();
      if (global.io) global.io.emit('conversation:updated', {
        conversationId: conv._id.toString(), status: conv.status, customer_vehicle: conv.customer_vehicle,
      });
      createQuoteAndFanOut(conv, result.intent).catch((err) =>
        console.error('[SERVIDOR] Error creando cotización:', err.message)
      );
    } else {
      conv.status = 'esperando_cliente';
      await conv.save();
    }
    emitMsg(conv._id, 'bot', result.message);
  } catch (err) {
    console.error('[SERVIDOR] Error IA:', err.message);
    await waSend(jid, 'Disculpa, tuve un problema técnico momentáneo. Intenta de nuevo 🔧');
  }
}

async function createQuoteAndFanOut(conv, intent) {
  const proveedores = await Proveedor.find({ estado: 'Activo' });

  if (proveedores.length === 0) {
    await waSend(buildJid(conv.customer_phone), 'Por el momento no tenemos proveedores disponibles. Te contactaremos pronto 🙏');
    return;
  }

  const quote = await Quote.create({
    conversation_id:    conv._id,
    item_description:   intent.repuesto,
    vehicle_model:      intent.modelo,
    vehicle_year:       intent.año,
    margin:             parseFloat(process.env.MARGIN_DEFAULT || '0.28'),
    supplier_responses: proveedores.map((p) => ({ supplier_id: p._id, supplier_name: p.nombre, status: 'esperando' })),
  });

  const requestText =
    `📋 *Solicitud de cotización*\n\n` +
    `Repuesto: *${intent.repuesto}*\n` +
    `Vehículo: *${intent.modelo} ${intent.año || ''}*\n` +
    `Cantidad: ${intent.cantidad || 1}\n\n` +
    `Responde con el precio disponible 👇`;

  for (const p of proveedores) {
    if (p.whatsapp) {
      await waSend(buildJid(p.whatsapp), requestText).catch((e) =>
        console.log(`[SERVIDOR] No se pudo enviar a ${p.nombre}: ${e.message}`)
      );
    }
  }

  if (global.io) global.io.emit('quote:created', { conversationId: conv._id.toString(), quote });

  const timeoutMs = parseInt(process.env.SUPPLIER_TIMEOUT_MS || '600000', 10);
  setTimeout(async () => {
    try {
      const fresh = await Quote.findById(quote._id);
      if (!fresh) return;
      if (!fresh.supplier_responses.some((r) => r.price)) {
        await Conversation.findByIdAndUpdate(conv._id, { status: 'intervencion_humana' });
        if (global.io) global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: 'intervencion_humana' });
      }
    } catch (_) {}
  }, timeoutMs);
}

const CONFIRM_WORDS = /^(s[ií]|yes|ok|dale|quiero|perfecto|confirmo|acepto|vamos|listo|1|afirm)/i;
const CANCEL_WORDS  = /^(no\b(?! sé| hay| tengo)|nope|cancelar|no gracias|no quiero|olv[ií]d|rechaz|no me interesa|dejalo|déjalo)/i;

async function handlePurchaseConfirmation(jid, phone, text, conv) {
  conv.messages.push({ from: 'cliente', text });
  emitMsg(conv._id, 'cliente', text);

  if (CONFIRM_WORDS.test(text.trim())) {
    const msg = '📍 Perfecto! Para coordinar el despacho necesito tu *dirección de entrega*.\n\nEscríbela completa (calle, número, comuna, ciudad):';
    await waSend(jid, msg);
    conv.messages.push({ from: 'bot', text: msg });
    conv.status = 'esperando_direccion';
    await conv.save();
    await updatePedidoStatus(conv._id, 'precio_aceptado');
    emitMsg(conv._id, 'bot', msg);
    if (global.io) global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: 'esperando_direccion' });

  } else if (CANCEL_WORDS.test(text.trim())) {
    const msg = '👍 Sin problema, no hay apuro. Si cambias de idea o necesitas otro repuesto, escríbenos cuando quieras 🙋';
    await waSend(jid, msg);
    conv.messages.push({ from: 'bot', text: msg });
    conv.status = 'cerrado';
    await conv.save();
    emitMsg(conv._id, 'bot', msg);
    if (global.io) global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: 'cerrado' });

  } else {
    await handleClientFollowUp(jid, phone, text, conv);
  }
}

async function handleClientFollowUp(jid, phone, text, conv) {
  const quote = await Quote.findOne({ conversation_id: conv._id, status: 'activo' });
  const respondedResp = quote?.supplier_responses?.find((r) => r.price && r.supplier_id);
  let forwarded = false;

  if (respondedResp) {
    const proveedor = await Proveedor.findById(respondedResp.supplier_id);
    if (proveedor?.whatsapp) {
      const intent = conv.pending_intent || {};
      const fwdMsg =
        `❓ *Consulta del cliente sobre tu cotización:*\n\n"${text}"\n\n` +
        `Repuesto: ${intent.repuesto || quote?.item_description || '—'}\n` +
        `Vehículo: ${intent.modelo || quote?.vehicle_model || '—'}\n\n` +
        `Por favor responde esta duda para confirmar la venta 🙏`;
      try {
        await waSend(buildJid(proveedor.whatsapp), fwdMsg);
        respondedResp.status = 'consulta';
        await quote.save();
        forwarded = true;
      } catch (e) {
        console.error('[BOT] No se pudo reenviar consulta al proveedor:', e.message);
      }
    }
  }

  const clientReply = forwarded
    ? '🔍 Buena pregunta! Estoy consultando con el proveedor, te respondo en breve ⏳'
    : '👋 Entendido. Un asesor revisará tu consulta y te responderá a la brevedad.';

  await waSend(jid, clientReply);
  conv.messages.push({ from: 'bot', text: clientReply });
  conv.status = 'intervencion_humana';
  await conv.save();
  emitMsg(conv._id, 'bot', clientReply);
  if (global.io) global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: 'intervencion_humana' });
}

async function handleAddressCapture(jid, phone, text, conv) {
  conv.messages.push({ from: 'cliente', text });
  conv.delivery_address = text.trim();
  conv.status = 'pedido_pendiente_pago';

  const Pedido = require('../models/Pedido');
  const updatedPedido = await Pedido.findOneAndUpdate(
    { conversation_id: conv._id },
    { delivery_address: text.trim(), status: 'precio_aceptado' },
    { new: true }
  ).catch(() => null);
  if (updatedPedido && global.io) global.io.emit('pedido:updated', updatedPedido);

  const quote  = await Quote.findOne({ conversation_id: conv._id, status: 'activo' });
  const precio = quote?.final_price?.toLocaleString('es-CL') || '—';

  const msg =
    `✅ *¡Pedido registrado!*\n\n` +
    `📦 ${conv.pending_intent?.repuesto || quote?.item_description || 'Repuesto'}\n` +
    `📍 Dirección: ${text.trim()}\n` +
    `💰 Total a pagar: $${precio}\n\n` +
    `🏦 Realiza la transferencia y envíanos el comprobante por aquí.\n` +
    `Una vez confirmado el pago, procederemos con el despacho. 🚚`;

  await waSend(jid, msg);
  conv.messages.push({ from: 'bot', text: msg });

  if (updatedPedido?.secretCode) {
    const landingUrl = process.env.LANDING_URL || 'http://localhost:3001';
    const trackMsg =
      `📱 *Sigue tu pedido en línea:*\n${landingUrl}\n\n` +
      `Código: *${updatedPedido.secretCode}*\nTeléfono: *+${conv.customer_phone}*\n\n` +
      `_Guarda estos datos para rastrear tu envío._`;
    await waSend(jid, trackMsg);
    conv.messages.push({ from: 'bot', text: trackMsg });
  }

  await conv.save();
  emitMsg(conv._id, 'bot', msg);
  if (global.io) global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: 'pedido_pendiente_pago' });
}

async function handleOptionSelection(jid, phone, text, conv) {
  const options  = conv.pending_options;
  const lower    = text.toLowerCase().trim();
  let chosen     = null;
  const numMatch = lower.match(/^(\d+)/);
  if (numMatch) {
    const idx = parseInt(numMatch[1], 10) - 1;
    if (idx >= 0 && idx < options.length) chosen = options[idx];
  }
  if (!chosen) {
    chosen = options.find((o) =>
      lower.includes(o.label?.toLowerCase()) ||
      lower.includes(o.description?.toLowerCase().split(' ')[0])
    );
  }

  if (!chosen) {
    const reask = buildOptionsMessage(conv.pending_intent, options, '¿Cuál prefieres? Responde con el número de la opción 👆');
    await waSend(jid, reask);
    conv.messages.push({ from: 'bot', text: reask });
    await conv.save();
    emitMsg(conv._id, 'bot', reask);
    return;
  }

  conv.messages.push({ from: 'cliente', text });
  const confirm = buildQuoteMessage(conv.pending_intent, chosen.finalPrice, chosen.description);
  await waSend(jid, confirm);
  conv.messages.push({ from: 'bot', text: confirm });
  conv.status          = 'esperando_confirmacion';
  conv.pending_options = null;

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
  emitMsg(conv._id, 'bot', confirm);
  if (global.io) global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: conv.status });
}

// ── Proveedor ──────────────────────────────────────────────────
async function handleSupplierMessage(jid, phone, text, proveedor) {
  const quote = await Quote.findOne({
    supplier_responses: { $elemMatch: { supplier_id: proveedor._id, status: { $in: ['esperando', 'consulta'] } } },
    status: 'activo',
  }).populate('conversation_id');

  if (!quote) return;

  const resp = quote.supplier_responses.find(
    (r) => r.supplier_id?.toString() === proveedor._id.toString() &&
           ['esperando', 'consulta'].includes(r.status)
  );

  if (resp?.status === 'consulta') {
    await handleSupplierFollowUpAnswer(quote, resp, text);
    return;
  }

  const parsed = await parseSupplierOptions(text);
  if (!parsed) return;

  const margin       = quote.margin || 0.28;
  const conv         = quote.conversation_id;
  const intent       = conv.pending_intent || { repuesto: quote.item_description, modelo: quote.vehicle_model, año: quote.vehicle_year };
  const clientJid    = buildJid(conv.customer_phone);

  if (parsed.type === 'single') {
    const bestPrice  = parsed.price;
    const finalPrice = Math.round(bestPrice * (1 + margin));
    if (resp) { resp.price = bestPrice; resp.status = 'respondido'; resp.responded_at = new Date(); resp.selected = true; }
    quote.best_price  = bestPrice;
    quote.final_price = finalPrice;
    await quote.save();

    const msg = buildQuoteMessage(intent, finalPrice);
    await waSend(clientJid, msg);
    conv.messages.push({ from: 'bot', text: msg });
    conv.status = 'esperando_confirmacion';
    await conv.save();
    await updatePedidoStatus(conv._id, 'precio_enviado');
    if (global.io) {
      global.io.emit('quote:updated',        { conversationId: conv._id.toString(), quote });
      global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: 'esperando_confirmacion' });
      emitMsg(conv._id, 'bot', msg);
    }

  } else if (parsed.type === 'multiple') {
    const options = parsed.options.map((o, i) => ({
      label: o.label || `Opción ${i + 1}`, description: o.description || '',
      price: o.price, finalPrice: Math.round(o.price * (1 + margin)),
    }));
    if (resp) { resp.options = options; resp.status = 'respondido'; resp.responded_at = new Date(); }
    await quote.save();

    conv.pending_options = options;
    conv.status          = 'esperando_seleccion';
    const optionsMsg = buildOptionsMessage(intent, options, 'Responde con el *número* de la opción que prefieres 👇');
    await waSend(clientJid, optionsMsg);
    conv.messages.push({ from: 'bot', text: optionsMsg });
    await conv.save();
    if (global.io) {
      global.io.emit('quote:updated',        { conversationId: conv._id.toString(), quote });
      global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: 'esperando_seleccion' });
      emitMsg(conv._id, 'bot', optionsMsg);
    }
  }
}

async function handleSupplierFollowUpAnswer(quote, resp, text) {
  const conv      = quote.conversation_id;
  const clientJid = buildJid(conv.customer_phone);
  const intent    = conv.pending_intent || { repuesto: quote.item_description, modelo: quote.vehicle_model };

  const relayMsg = `💬 *Respuesta del proveedor:*\n\n${text}`;
  await waSend(clientJid, relayMsg);
  conv.messages.push({ from: 'bot', text: relayMsg });

  const parsed = await parseSupplierOptions(text).catch(() => null);
  if (parsed?.type === 'single' && parsed.price) {
    const newFinal = Math.round(parsed.price * (1 + (quote.margin || 0.28)));
    quote.best_price = parsed.price; quote.final_price = newFinal; resp.price = parsed.price;
  }

  resp.status = 'respondido';
  await quote.save();

  if (quote.final_price) {
    const reAskMsg = buildQuoteMessage(intent, quote.final_price);
    await waSend(clientJid, reAskMsg);
    conv.messages.push({ from: 'bot', text: reAskMsg });
  }

  conv.status = 'esperando_confirmacion';
  await conv.save();
  emitMsg(conv._id, 'bot', relayMsg);
  if (global.io) global.io.emit('conversation:updated', { conversationId: conv._id.toString(), status: 'esperando_confirmacion' });
}

// ── Mensajes modelo ────────────────────────────────────────────
function buildQuoteMessage(intent, finalPrice) {
  const precio = finalPrice.toLocaleString('es-CL');
  return [
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
  ].join('\n');
}

function buildOptionsMessage(intent, options, footer = '') {
  const nums  = ['1️⃣','2️⃣','3️⃣','4️⃣','5️⃣'];
  const lines = [`📋 *Opciones para ${intent?.repuesto || 'tu repuesto'}*`, `━━━━━━━━━━━━━━━━━━━━`];
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

// ── Helpers internos ───────────────────────────────────────────
async function waSend(jid, text) {
  if (!sock) throw new Error('Bot no inicializado');
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout 15s al enviar')), 15000)
  );
  return Promise.race([sock.sendMessage(jid, { text }), timeout]);
}

function emitMsg(convId, from, text) {
  if (global.io) global.io.emit('conversation:message', {
    conversationId: convId.toString(),
    message: { from, text, ts: new Date() },
  });
}

function emitConvNew(conv) {
  if (!global.io) return;
  global.io.emit('conversation:new', {
    _id: conv._id.toString(), customer_name: conv.customer_name,
    customer_phone: conv.customer_phone, status: conv.status,
    bot_active: conv.bot_active, updatedAt: new Date(),
  });
}

async function updatePedidoStatus(conversationId, status) {
  try {
    const Pedido = require('../models/Pedido');
    const pedido = await Pedido.findOneAndUpdate({ conversation_id: conversationId }, { status }, { new: true });
    if (pedido && global.io) global.io.emit('pedido:updated', pedido);
    return pedido;
  } catch (_) {}
}

// ── Normalización de teléfonos al arrancar ─────────────────────
async function fixPhoneNumbers() {
  try {
    const proveedores = await Proveedor.find({ whatsapp: { $exists: true, $ne: '' } }).lean();
    let fixed = 0;
    for (const p of proveedores) {
      const norm = normalizePhone(p.whatsapp || '');
      if (norm && norm !== p.whatsapp) {
        await Proveedor.findByIdAndUpdate(p._id, { whatsapp: norm });
        fixed++;
        console.log(`[BOT] Proveedor ${p.nombre}: ${p.whatsapp} → ${norm}`);
      }
    }
    if (fixed) console.log(`[BOT] ✅ ${fixed} números de proveedores normalizados`);
  } catch (err) {
    console.error('[BOT] Error normalizando teléfonos:', err.message);
  }
}

// ── API pública ────────────────────────────────────────────────
function initialize() {
  fixPhoneNumbers();
  startBot();
}
function getStatus()  { return { status: botStatus, qrDataURL: lastQRDataURL }; }

async function sendMessage(phoneOrJid, text) {
  if (botStatus !== 'connected') throw new Error(`Bot no conectado (estado: ${botStatus})`);
  const jid = buildJid(phoneOrJid);
  if (!jid) throw new Error('JID inválido');
  return waSend(jid, text);
}

module.exports = { initialize, getStatus, sendMessage };
