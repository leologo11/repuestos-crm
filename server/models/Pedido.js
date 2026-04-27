const mongoose = require('mongoose');

function generateSecretCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

const PedidoSchema = new mongoose.Schema(
  {
    secretCode:      { type: String, unique: true, default: generateSecretCode },
    customer_name:   String,
    customer_phone:  String,

    conversation_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation' },
    quote_id:        { type: mongoose.Schema.Types.ObjectId, ref: 'Quote' },

    repuesto:           String,
    vehicle:            String,
    final_price:        Number,  // Precio cobrado al cliente (con margen)
    precio_proveedor:   Number,  // Precio pagado al proveedor (costo base)

    repartidor_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Repartidor' },
    delivery_address: String,
    delivery_notes:   String,
    delivery_fee:     { type: Number, default: 3000 },
    delivery_paid:    { type: Boolean, default: false },

    status: {
      type: String,
      enum: ['buscando_proveedor', 'precio_enviado', 'precio_aceptado', 'en_preparacion', 'en_camino', 'entregado', 'cancelado'],
      default: 'buscando_proveedor',
    },

    source: { type: String, enum: ['whatsapp', 'landing', 'manual'], default: 'whatsapp' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Pedido', PedidoSchema);
