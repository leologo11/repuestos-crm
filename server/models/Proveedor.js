const mongoose = require('mongoose');

const ProveedorSchema = new mongoose.Schema(
  {
    nombre:       { type: String, required: true },
    marcas:       String,
    whatsapp:     String,
    alternate_ids: [String], // LIDs u otros IDs de WhatsApp conocidos para este proveedor
    estado:       { type: String, enum: ['Activo', 'Inactivo', 'Pendiente'], default: 'Pendiente' },
    api:          { type: String, enum: ['Conectada', 'Sin API'], default: 'Sin API' },
    rating:       { type: Number, default: 0, min: 0, max: 100 },
    tags:         [String],
  },
  { timestamps: true }
);

module.exports = mongoose.model('Proveedor', ProveedorSchema);
