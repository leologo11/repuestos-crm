const mongoose = require('mongoose');

const AuthStateSchema = new mongoose.Schema(
  { _id: String, data: mongoose.Schema.Types.Mixed },
  { timestamps: false, versionKey: false }
);

module.exports = mongoose.model('BaileysAuthState', AuthStateSchema, 'baileysauthstates');
