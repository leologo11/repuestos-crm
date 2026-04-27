const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  from: {
    type: String,
    enum: ['cliente', 'bot', 'admin', 'proveedor', 'sistema'],
    required: true,
  },
  text: { type: String, required: true },
  ts:   { type: Date, default: Date.now },
});

const ConversationSchema = new mongoose.Schema(
  {
    customer_name:    String,
    customer_phone:   { type: String, required: true, unique: true },
    customer_vehicle: String,
    alternate_ids:    [String], // LIDs u otros IDs alternativos del mismo cliente
    messages:         [MessageSchema],
    status: {
      type: String,
      enum: [
        'esperando_proveedor',
        'esperando_cliente',
        'esperando_seleccion',
        'esperando_confirmacion',  // cliente vio el precio, bot esperando "Sí"
        'esperando_direccion',     // cliente confirmó, bot pidiendo dirección
        'pedido_pendiente_pago',   // cliente dio dirección, esperando transferencia
        'pago_confirmado',         // admin confirmó el pago
        'intervencion_humana',
        'cerrado',
      ],
      default: 'esperando_cliente',
    },
    bot_active:       { type: Boolean, default: true },
    pending_intent:   mongoose.Schema.Types.Mixed,
    pending_options:  mongoose.Schema.Types.Mixed,
    delivery_address: String,
  },
  { timestamps: true }
);

module.exports = mongoose.model('Conversation', ConversationSchema);
