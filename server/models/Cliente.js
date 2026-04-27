const mongoose = require('mongoose');

const ClienteSchema = new mongoose.Schema(
  {
    nombre:        String,
    telefono:      { type: String, required: true, unique: true },
    vehiculos:     [String],
    total_pedidos: { type: Number, default: 0 },
    total_gasto:   { type: Number, default: 0 },
    pin:           String,      // 4-digit PIN for client portal login
    registered:    { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Cliente', ClienteSchema);
