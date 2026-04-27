const mongoose = require('mongoose');

const RepartidorSchema = new mongoose.Schema(
  {
    nombre:          { type: String, required: true },
    telefono:        String,
    whatsapp:        String,
    vehiculo:        { type: String, enum: ['Moto', 'Auto', 'Bicicleta', 'Otro'], default: 'Moto' },
    patente:         String,
    estado:          { type: String, enum: ['disponible', 'en_ruta', 'inactivo'], default: 'disponible' },
    tarifa_base:     { type: Number, default: 3000 }, // CLP por entrega
    total_entregas:  { type: Number, default: 0 },
    total_pagado:    { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Repartidor', RepartidorSchema);
