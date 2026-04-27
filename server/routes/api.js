const router  = require('express').Router();

function normalizePhone(raw) {
  const d = (raw || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('56') && d.length >= 10) return d;
  return '56' + d;
}

const Conversation = require('../models/Conversation');
const Quote        = require('../models/Quote');
const Proveedor    = require('../models/Proveedor');
const Cliente      = require('../models/Cliente');
const Repartidor   = require('../models/Repartidor');
const Pedido       = require('../models/Pedido');

// ── Conversaciones ────────────────────────────────────────────
router.get('/conversations', async (req, res) => {
  try {
    const convs = await Conversation.find().sort({ updatedAt: -1 }).lean();
    res.json(convs);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/conversations/:id', async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id).lean();
    if (!conv) return res.status(404).json({ error: 'No encontrado' });
    res.json(conv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.patch('/conversations/:id', async (req, res) => {
  try {
    const { status, bot_active } = req.body;
    const update = {};
    if (status     !== undefined) update.status     = status;
    if (bot_active !== undefined) update.bot_active = bot_active;
    const conv = await Conversation.findByIdAndUpdate(req.params.id, update, { new: true }).lean();
    if (!conv) return res.status(404).json({ error: 'No encontrado' });
    if (global.io) global.io.emit('conversation:updated', { conversationId: conv._id, ...update });
    res.json(conv);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/conversations/:id/messages', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Texto requerido' });
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: 'No encontrado' });
    const msg = { from: 'admin', text: text.trim(), ts: new Date() };
    conv.messages.push(msg);
    await conv.save();
    try {
      const bot = require('../bot/whatsapp');
      await bot.sendMessage(conv.customer_phone, text.trim());
    } catch (_) {}
    if (global.io) global.io.emit('conversation:message', { conversationId: conv._id, message: msg });
    res.json(msg);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// Confirmar pago recibido — pasa el pedido a listo para despacho
router.post('/conversations/:id/confirm-payment', async (req, res) => {
  try {
    const conv = await Conversation.findById(req.params.id);
    if (!conv) return res.status(404).json({ error: 'No encontrado' });

    conv.status = 'pago_confirmado';
    await conv.save();

    // Copiar precios desde la cotización al pedido y avanzar estado
    const quoteDoc = await Quote.findOne({ conversation_id: conv._id, status: 'activo' }).lean();
    const pedidoUpdate = { status: 'en_preparacion' };
    if (quoteDoc?.final_price) pedidoUpdate.final_price      = quoteDoc.final_price;
    if (quoteDoc?.best_price)  pedidoUpdate.precio_proveedor = quoteDoc.best_price;

    const pedidoActualizado = await Pedido.findOneAndUpdate(
      { conversation_id: conv._id },
      pedidoUpdate,
      { new: true }
    ).catch(() => null);

    if (pedidoActualizado && global.io) global.io.emit('pedido:updated', pedidoActualizado);

    // Avisar al cliente por WhatsApp
    try {
      const bot = require('../bot/whatsapp');
      const msg = '✅ *¡Pago confirmado!* Gracias por tu compra.\n\nEstamos preparando tu pedido. Te avisaremos cuando esté en camino. 🚚';
      await bot.sendMessage(conv.customer_phone, msg);
      conv.messages.push({ from: 'bot', text: msg, ts: new Date() });
      await conv.save();
      if (global.io) global.io.emit('conversation:message', { conversationId: conv._id, message: { from: 'bot', text: msg, ts: new Date() } });
    } catch (_) {}

    if (global.io) global.io.emit('conversation:updated', { conversationId: conv._id, status: 'pago_confirmado' });
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Cotizaciones ──────────────────────────────────────────────
router.get('/quotes/conversation/:conversationId', async (req, res) => {
  try {
    const quote = await Quote.findOne({ conversation_id: req.params.conversationId }).lean();
    res.json(quote || null);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/quotes/:id/send', async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.id).populate('conversation_id');
    if (!quote) return res.status(404).json({ error: 'No encontrado' });
    const conv = quote.conversation_id;
    const text = req.body.customMessage ||
      `¡Hola! Tengo el ${quote.item_description} para tu ${quote.vehicle_model} a $${quote.final_price?.toLocaleString('es-CL')}. ¿Te gustaría proceder con la compra?`;
    try {
      const bot = require('../bot/whatsapp');
      await bot.sendMessage(conv.customer_phone, text);
    } catch (_) {}
    conv.messages.push({ from: 'bot', text, ts: new Date() });
    conv.status = 'esperando_cliente';
    await conv.save();
    quote.status = 'enviado';
    await quote.save();
    if (global.io) global.io.emit('conversation:message', { conversationId: conv._id, message: { from: 'bot', text, ts: new Date() } });
    res.json({ sent: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Proveedores ───────────────────────────────────────────────

// Ruta de prueba: asigna un número WhatsApp a TODOS los proveedores y los pone Activo
router.post('/proveedores/set-test-number', async (req, res) => {
  try {
    const { whatsapp } = req.body;
    if (!whatsapp) return res.status(400).json({ error: 'Falta whatsapp' });
    const clean = whatsapp.replace(/\D/g, '');
    const result = await Proveedor.updateMany({}, { whatsapp: clean, estado: 'Activo' });
    res.json({ updated: result.modifiedCount, whatsapp: clean });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/proveedores', async (req, res) => {
  try {
    const proveedores = await Proveedor.find().sort({ nombre: 1 }).lean();
    res.json(proveedores);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/proveedores', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.whatsapp) body.whatsapp = normalizePhone(body.whatsapp);
    const p = await Proveedor.create(body);
    res.status(201).json(p);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.patch('/proveedores/:id', async (req, res) => {
  try {
    const body = { ...req.body };
    if (body.whatsapp !== undefined) body.whatsapp = normalizePhone(body.whatsapp);
    const p = await Proveedor.findByIdAndUpdate(req.params.id, body, { new: true }).lean();
    if (!p) return res.status(404).json({ error: 'No encontrado' });
    res.json(p);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.post('/proveedores/:id/message', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) return res.status(400).json({ error: 'Texto requerido' });
    const p = await Proveedor.findById(req.params.id).lean();
    if (!p) return res.status(404).json({ error: 'Proveedor no encontrado' });
    if (!p.whatsapp) return res.status(400).json({ error: 'Proveedor sin WhatsApp registrado' });
    const bot = require('../bot/whatsapp');
    await bot.sendMessage(p.whatsapp, text.trim());
    res.json({ sent: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/proveedores/:id/quotes', async (req, res) => {
  try {
    const quotes = await Quote.find({ 'supplier_responses.supplier_id': req.params.id })
      .populate('conversation_id', 'customer_name customer_phone customer_vehicle')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json(quotes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Clientes ──────────────────────────────────────────────────
router.get('/clientes', async (req, res) => {
  try {
    const clientes = await Cliente.find().sort({ updatedAt: -1 }).lean();
    res.json(clientes);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/clientes', async (req, res) => {
  try {
    const { nombre, telefono, vehiculos } = req.body;
    if (!telefono) return res.status(400).json({ error: 'Teléfono requerido' });
    const clean = telefono.replace(/\D/g, '');
    const phone = clean.startsWith('56') ? clean : '56' + clean;
    const c = await Cliente.findOneAndUpdate(
      { telefono: phone },
      { nombre: nombre || phone, vehiculos: vehiculos || [] },
      { upsert: true, new: true }
    );
    res.status(201).json(c);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.patch('/clientes/:id', async (req, res) => {
  try {
    const c = await Cliente.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if (!c) return res.status(404).json({ error: 'No encontrado' });
    res.json(c);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── Repartidores ──────────────────────────────────────────────
router.get('/repartidores', async (req, res) => {
  try {
    const repartidores = await Repartidor.find().sort({ nombre: 1 }).lean();
    res.json(repartidores);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/repartidores', async (req, res) => {
  try {
    const r = await Repartidor.create(req.body);
    res.status(201).json(r);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.patch('/repartidores/:id', async (req, res) => {
  try {
    const r = await Repartidor.findByIdAndUpdate(req.params.id, req.body, { new: true }).lean();
    if (!r) return res.status(404).json({ error: 'No encontrado' });
    res.json(r);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── Pedidos ───────────────────────────────────────────────────
router.get('/pedidos', async (req, res) => {
  try {
    const pedidos = await Pedido.find()
      .populate('repartidor_id', 'nombre vehiculo estado tarifa_base')
      .populate('quote_id', 'item_description best_price final_price')
      .sort({ createdAt: -1 })
      .lean();
    res.json(pedidos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/pedidos', async (req, res) => {
  try {
    const pedido = await Pedido.create({ ...req.body, source: 'manual' });
    if (global.io) global.io.emit('pedido:new', pedido);
    res.status(201).json(pedido);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

router.patch('/pedidos/:id', async (req, res) => {
  try {
    const allowed = ['repartidor_id', 'status', 'delivery_address', 'delivery_notes', 'delivery_fee', 'delivery_paid', 'final_price', 'precio_proveedor'];
    const update  = Object.fromEntries(Object.entries(req.body).filter(([k]) => allowed.includes(k)));

    const pedido = await Pedido.findByIdAndUpdate(req.params.id, update, { new: true })
      .populate('repartidor_id', 'nombre vehiculo tarifa_base')
      .lean();
    if (!pedido) return res.status(404).json({ error: 'No encontrado' });

    if (update.status === 'entregado' && pedido.repartidor_id) {
      await Repartidor.findByIdAndUpdate(pedido.repartidor_id._id, {
        estado: 'disponible',
        $inc: { total_entregas: 1, total_pagado: pedido.delivery_fee || 3000 },
      });
    } else if (update.status === 'en_camino' && pedido.repartidor_id) {
      await Repartidor.findByIdAndUpdate(pedido.repartidor_id._id || update.repartidor_id, { estado: 'en_ruta' });
    }

    // Notificar al cliente por WhatsApp al cambiar estado de despacho
    if (pedido.customer_phone && ['en_camino', 'entregado', 'cancelado'].includes(update.status)) {
      try {
        const bot = require('../bot/whatsapp');
        let waMsg = '';
        if (update.status === 'en_camino') {
          const rep = pedido.repartidor_id?.nombre || 'Nuestro repartidor';
          waMsg = `🛵 *¡Tu pedido está en camino!*\n\n${rep} está llevando tu *${pedido.repuesto || 'repuesto'}* ahora mismo. ¡Pronto lo recibirás! 📦`;
        } else if (update.status === 'entregado') {
          waMsg = `✅ *¡Pedido entregado!*\n\nTu *${pedido.repuesto || 'repuesto'}* fue entregado exitosamente.\n¡Gracias por elegir Web-Repuestos! 🎉\n\nEscríbenos cuando necesites algo más.`;
        } else if (update.status === 'cancelado') {
          waMsg = `❌ *Pedido cancelado*\n\nTu pedido (${pedido.secretCode}) fue cancelado. Si tienes dudas escríbenos y te ayudamos.`;
        }
        if (waMsg) await bot.sendMessage(pedido.customer_phone, waMsg).catch(() => {});
      } catch (_) {}
    }

    if (global.io) global.io.emit('pedido:updated', pedido);
    res.json(pedido);
  } catch (err) { res.status(400).json({ error: err.message }); }
});

// ── Ventas ────────────────────────────────────────────────────
router.get('/ventas', async (req, res) => {
  try {
    const ventas = await Pedido.find({
      status: { $in: ['precio_aceptado', 'en_preparacion', 'en_camino', 'entregado'] },
    })
      .populate('repartidor_id', 'nombre')
      .populate('quote_id', 'best_price margin item_description supplier_responses')
      .sort({ updatedAt: -1 })
      .limit(100)
      .lean();
    res.json(ventas);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Dashboard ─────────────────────────────────────────────────
router.get('/dashboard/stats', async (req, res) => {
  try {
    const now            = new Date();
    const startOfMonth   = new Date(now.getFullYear(), now.getMonth(), 1);
    const startPrevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const startOfYear    = new Date(now.getFullYear(), 0, 1);
    const confirmedSt    = ['precio_aceptado', 'en_preparacion', 'en_camino', 'entregado'];

    const [
      totalConvs, activeConvs, totalClientes, totalProveedores, pedidosEnCamino,
      pedidosMes, pedidosMesAnt, mesData, deliveryData, totalHistorico,
    ] = await Promise.all([
      Conversation.countDocuments(),
      Conversation.countDocuments({ status: { $nin: ['cerrado'] } }),
      Cliente.countDocuments(),
      Proveedor.countDocuments({ estado: 'Activo' }),
      Pedido.countDocuments({ status: 'en_camino' }),
      Pedido.find({ status: { $in: confirmedSt }, createdAt: { $gte: startOfMonth } }).select('final_price precio_proveedor delivery_fee').lean(),
      Pedido.find({ status: { $in: confirmedSt }, createdAt: { $gte: startPrevMonth, $lt: startOfMonth } }).select('final_price').lean(),
      Pedido.aggregate([
        { $match: { status: { $in: confirmedSt }, createdAt: { $gte: startOfYear } } },
        { $group: { _id: { $month: '$createdAt' }, revenue: { $sum: '$final_price' }, cost: { $sum: '$precio_proveedor' }, delivery: { $sum: '$delivery_fee' } } },
        { $sort: { _id: 1 } },
      ]),
      Pedido.aggregate([
        { $match: { delivery_paid: true } },
        { $group: { _id: null, total: { $sum: '$delivery_fee' } } },
      ]),
      // Totales históricos: ganancia neta real (ingresos - proveedor - delivery)
      Pedido.aggregate([
        { $match: { status: { $in: confirmedSt } } },
        { $group: { _id: null, revenue: { $sum: '$final_price' }, cost: { $sum: '$precio_proveedor' }, delivery: { $sum: '$delivery_fee' }, count: { $sum: 1 } } },
      ]),
    ]);

    const ventasMes    = pedidosMes.reduce((s, p) => s + (p.final_price || 0), 0);
    const costoMes     = pedidosMes.reduce((s, p) => s + (p.precio_proveedor || 0), 0);
    const deliveryMes  = pedidosMes.reduce((s, p) => s + (p.delivery_fee || 0), 0);
    const gananciaMes  = ventasMes - costoMes - deliveryMes;
    const ventasMesAnt = pedidosMesAnt.reduce((s, p) => s + (p.final_price || 0), 0);
    const deltaMes     = ventasMesAnt > 0 ? +((ventasMes - ventasMesAnt) / ventasMesAnt * 100).toFixed(1) : null;

    const ventasPorMes   = Array(12).fill(0);
    const gananciaPorMes = Array(12).fill(0);
    mesData.forEach((m) => {
      ventasPorMes[m._id - 1]   = m.revenue || 0;
      gananciaPorMes[m._id - 1] = (m.revenue || 0) - (m.cost || 0) - (m.delivery || 0);
    });

    const totalData        = totalHistorico[0] || {};
    const totalRevenue     = totalData.revenue  || 0;
    const totalCost        = totalData.cost     || 0;
    const totalDeliveryCost= totalData.delivery || 0;
    const totalProfit      = totalRevenue - totalCost - totalDeliveryCost;
    const margenProm       = totalRevenue > 0 ? +((totalProfit / totalRevenue) * 100).toFixed(1) : 0;

    res.json({
      totalConvs, activeConvs, totalClientes, totalProveedores, pedidosEnCamino,
      ventasMes, costoMes, deliveryMes, gananciaMes, deltaMes, pedidosMes: pedidosMes.length,
      ventasPorMes, gananciaPorMes,
      totalRevenue, totalCost, totalDeliveryCost, totalProfit, margenProm,
      totalDelivery: deliveryData[0]?.total || 0,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Bot ───────────────────────────────────────────────────────
router.get('/bot/status', (req, res) => {
  try {
    const bot = require('../bot/whatsapp');
    res.json(bot.getStatus());
  } catch (_) { res.json({ status: 'disconnected', qrDataURL: null }); }
});

router.post('/bot/reset-session', async (req, res) => {
  try {
    const AuthState = require('../models/AuthState');
    await AuthState.deleteMany({});
    console.log('[API] Sesion WhatsApp reseteada manualmente');
    res.json({ ok: true, message: 'Sesion limpiada. El bot generará nuevo QR en segundos.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Públicas — Landing page (sin autenticación) ───────────────
router.post('/public/quote', async (req, res) => {
  try {
    // Acepta tanto fields separados (marca/modelo/año) como campo combinado (vehicle) que manda la landing
    const { nombre, telefono, repuesto, notas, detalles } = req.body;
    let { marca, modelo, año, vehicle } = req.body;

    if (!telefono || !repuesto) return res.status(400).json({ error: 'Faltan datos requeridos' });

    // Si viene vehicle combinado desde la landing (ej: "Toyota Corolla 2019")
    const vehicleFull = vehicle || `${marca || ''} ${modelo || ''} ${año || ''}`.trim();
    const vehicleModel = modelo ? `${marca || ''} ${modelo}`.trim() : vehicleFull;
    const vehicleYear  = año || '';
    const notasFull    = notas || detalles || '';

    const cleanPhone = telefono.replace(/\D/g, '');
    const phone = cleanPhone.startsWith('56') ? cleanPhone : '56' + cleanPhone;

    await Cliente.findOneAndUpdate(
      { telefono: phone },
      { $setOnInsert: { nombre: nombre || phone, telefono: phone } },
      { upsert: true }
    );

    let conv = await Conversation.findOne({ customer_phone: phone });
    if (!conv) {
      conv = await Conversation.create({
        customer_phone:   phone,
        customer_name:    nombre || phone,
        customer_vehicle: vehicleFull,
        messages:         [],
        bot_active:       true,
        status:           'esperando_proveedor',
        pending_intent:   { repuesto, modelo: vehicleModel, año: vehicleYear, cantidad: 1 },
      });
    } else {
      // Actualiza intent si la conv ya existe
      conv.pending_intent   = { repuesto, modelo: vehicleModel, año: vehicleYear, cantidad: 1 };
      conv.customer_vehicle = vehicleFull;
      conv.status           = 'esperando_proveedor';
      conv.bot_active       = true;
      await conv.save();
    }

    const proveedores = await Proveedor.find({ estado: 'Activo' });

    // Si no hay proveedores en DB, usamos el número de prueba del env o un fallback
    const testNumber = process.env.TEST_SUPPLIER_NUMBER || '';
    const hasSuppliers = proveedores.length > 0;

    const quote = await Quote.create({
      conversation_id:  conv._id,
      item_description: repuesto + (notasFull ? ` (${notasFull})` : ''),
      vehicle_model:    vehicleModel,
      vehicle_year:     vehicleYear,
      margin:           parseFloat(process.env.MARGIN_DEFAULT || '0.28'),
      supplier_responses: hasSuppliers
        ? proveedores.map((p) => ({ supplier_id: p._id, supplier_name: p.nombre, status: 'esperando' }))
        : [],
    });

    const pedido = await Pedido.create({
      customer_name:   nombre || phone,
      customer_phone:  phone,
      conversation_id: conv._id,
      quote_id:        quote._id,
      repuesto,
      vehicle:         vehicleFull,
      source:          'landing',
    });

    const requestText =
      `📋 *Solicitud de cotización (Web)*\n\n` +
      `Repuesto: *${repuesto}${notasFull ? ` (${notasFull})` : ''}*\n` +
      `Vehículo: *${vehicleFull}*\n` +
      `Cliente: ${nombre || 'Sin nombre'} · +${phone}\n\n` +
      `Responde con el precio disponible 👇`;

    try {
      const bot = require('../bot/whatsapp');
      if (hasSuppliers) {
        for (const p of proveedores) {
          if (p.whatsapp) await bot.sendMessage(p.whatsapp, requestText).catch((e) =>
            console.error(`[API] No se pudo enviar a proveedor ${p.nombre}:`, e.message)
          );
        }
      } else if (testNumber) {
        // Fallback: enviar al número de prueba si no hay proveedores registrados
        console.log(`[API] Sin proveedores en DB, enviando al número de prueba: ${testNumber}`);
        await bot.sendMessage(testNumber, requestText).catch((e) =>
          console.error('[API] Error enviando al número de prueba:', e.message)
        );
      } else {
        console.warn('[API] Sin proveedores activos en DB y sin TEST_SUPPLIER_NUMBER configurado');
      }
    } catch (e) {
      console.error('[API] Bot no disponible:', e.message);
    }

    if (global.io) {
      global.io.emit('conversation:new', {
        _id: conv._id, customer_name: conv.customer_name,
        customer_phone: conv.customer_phone, customer_vehicle: conv.customer_vehicle,
        status: conv.status, bot_active: conv.bot_active, updatedAt: new Date(),
      });
      global.io.emit('quote:created', { conversationId: conv._id.toString(), quote });
    }

    res.json({ secretCode: pedido.secretCode, pedidoId: pedido._id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/quotes/:quoteId/resend', async (req, res) => {
  try {
    const quote = await Quote.findById(req.params.quoteId).populate('conversation_id');
    if (!quote) return res.status(404).json({ error: 'Cotización no encontrada' });

    const conv = quote.conversation_id;
    const requestText =
      `📋 *Solicitud de cotización*\n\n` +
      `Repuesto: *${quote.item_description}*\n` +
      `Vehículo: *${quote.vehicle_model} ${quote.vehicle_year || ''}*\n` +
      `Cliente: ${conv?.customer_name || 'Cliente'}\n\n` +
      `Responde con el precio disponible 👇`;

    const bot = require('../bot/whatsapp');
    const proveedores = await Proveedor.find({ estado: 'Activo', whatsapp: { $exists: true, $ne: '' } });
    const testNumber = process.env.TEST_SUPPLIER_NUMBER || '';
    let sent = 0;

    if (proveedores.length > 0) {
      for (const p of proveedores) {
        try { await bot.sendMessage(p.whatsapp, requestText); sent++; } catch (_) {}
      }
    } else if (testNumber) {
      try { await bot.sendMessage(testNumber, requestText); sent++; } catch (_) {}
    }

    res.json({ sent, message: `Solicitud reenviada a ${sent} proveedor(es)` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.get('/public/order/:secretCode', async (req, res) => {
  try {
    const pedido = await Pedido.findOne({ secretCode: req.params.secretCode.toUpperCase() })
      .populate('repartidor_id', 'nombre vehiculo telefono')
      .populate('quote_id', 'item_description best_price final_price supplier_responses status')
      .lean();
    if (!pedido) return res.status(404).json({ error: 'Pedido no encontrado. Verifica el código.' });
    res.json(pedido);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── Portal cliente (autenticación por teléfono + código o PIN) ──
router.post('/public/client/verify', async (req, res) => {
  try {
    const { telefono, secretCode } = req.body;
    if (!telefono || !secretCode) return res.status(400).json({ error: 'Faltan datos' });
    const clean = telefono.replace(/\D/g, '');
    const phone = clean.startsWith('56') ? clean : '56' + clean;
    const pedido = await Pedido.findOne({ secretCode: secretCode.toUpperCase(), customer_phone: phone })
      .populate('repartidor_id', 'nombre vehiculo telefono')
      .lean();
    if (!pedido) return res.status(404).json({ error: 'Código o teléfono incorrecto.' });
    const cliente = await Cliente.findOne({ telefono: phone }).select('nombre registered').lean();
    res.json({ pedido, cliente: { registered: cliente?.registered || false, nombre: cliente?.nombre || '' } });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/public/client/register', async (req, res) => {
  try {
    const { telefono, secretCode, pin } = req.body;
    if (!telefono || !secretCode || !pin) return res.status(400).json({ error: 'Faltan datos' });
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'El PIN debe ser exactamente 4 dígitos' });
    const clean = telefono.replace(/\D/g, '');
    const phone = clean.startsWith('56') ? clean : '56' + clean;
    const pedido = await Pedido.findOne({ secretCode: secretCode.toUpperCase(), customer_phone: phone });
    if (!pedido) return res.status(404).json({ error: 'Código o teléfono incorrecto.' });
    const cliente = await Cliente.findOneAndUpdate(
      { telefono: phone },
      { pin, registered: true },
      { new: true }
    ).select('nombre telefono registered').lean();
    if (!cliente) return res.status(404).json({ error: 'Cliente no encontrado en el sistema' });
    res.json({ ok: true, nombre: cliente.nombre });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/public/client/login', async (req, res) => {
  try {
    const { telefono, pin } = req.body;
    if (!telefono || !pin) return res.status(400).json({ error: 'Faltan datos' });
    const clean = telefono.replace(/\D/g, '');
    const phone = clean.startsWith('56') ? clean : '56' + clean;
    const cliente = await Cliente.findOne({ telefono: phone, pin, registered: true })
      .select('nombre telefono vehiculos total_pedidos').lean();
    if (!cliente) return res.status(401).json({ error: 'Teléfono o PIN incorrecto.' });
    const pedidos = await Pedido.find({ customer_phone: phone })
      .populate('repartidor_id', 'nombre vehiculo')
      .sort({ createdAt: -1 })
      .limit(10)
      .lean();
    res.json({ cliente, pedidos });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
