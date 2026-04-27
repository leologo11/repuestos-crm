const mongoose = require('mongoose');

const SupplierResponseSchema = new mongoose.Schema({
  supplier_id:   { type: mongoose.Schema.Types.ObjectId, ref: 'Proveedor' },
  supplier_name: String,
  price:         Number,
  options:       [{ label: String, description: String, price: Number }], // múltiples opciones del proveedor
  status:        { type: String, enum: ['esperando', 'respondido', 'consulta'], default: 'esperando' },
  selected:      { type: Boolean, default: false },
  responded_at:  Date,
});

const QuoteSchema = new mongoose.Schema(
  {
    conversation_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    item_description: String,
    vehicle_model:    String,
    vehicle_year:     String,
    supplier_responses: [SupplierResponseSchema],
    best_price:  Number,
    final_price: Number,
    margin:  { type: Number, default: parseFloat(process.env.MARGIN_DEFAULT || '0.28') },
    status: {
      type: String,
      enum: ['activo', 'enviado', 'aceptado', 'rechazado'],
      default: 'activo',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Quote', QuoteSchema);
