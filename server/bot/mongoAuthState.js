'use strict';
const AuthState = require('../models/AuthState');

// Serialize: convert Buffer/Uint8Array to base64 so MongoDB can store them
function enc(obj) {
  return JSON.parse(JSON.stringify(obj, (_, v) => {
    if (v && (Buffer.isBuffer(v) || (ArrayBuffer.isView(v) && !(v instanceof DataView)))) {
      return { __b64: Buffer.from(v).toString('base64') };
    }
    return v;
  }));
}

// Deserialize: restore base64 blobs back to Buffers
function dec(obj) {
  if (obj == null) return null;
  return JSON.parse(JSON.stringify(obj), (_, v) => {
    if (v && typeof v === 'object' && '__b64' in v) return Buffer.from(v.__b64, 'base64');
    return v;
  });
}

async function readDoc(id) {
  const doc = await AuthState.findById(id).lean();
  return doc ? dec(doc.data) : null;
}

async function writeDoc(id, data) {
  await AuthState.findByIdAndUpdate(id, { $set: { data: enc(data) } }, { upsert: true });
}

async function useMongoAuthState() {
  const { initAuthCreds } = await import('@whiskeysockets/baileys');

  const credsData = await readDoc('creds');
  const creds = credsData || initAuthCreds();

  const state = {
    creds,
    keys: {
      // Batch read: one query per type instead of one per key
      get: async (type, ids) => {
        const docIds = ids.map((id) => `key_${type}_${id}`);
        const docs = await AuthState.find({ _id: { $in: docIds } }).lean();
        const result = {};
        const prefix = `key_${type}_`;
        for (const doc of docs) {
          result[doc._id.slice(prefix.length)] = dec(doc.data);
        }
        return result;
      },

      // Batch write: bulkWrite instead of individual upserts
      set: async (data) => {
        const ops = [];
        for (const [type, vals] of Object.entries(data)) {
          for (const [id, val] of Object.entries(vals || {})) {
            const docId = `key_${type}_${id}`;
            if (val) {
              ops.push({
                updateOne: {
                  filter: { _id: docId },
                  update: { $set: { data: enc(val) } },
                  upsert: true,
                },
              });
            } else {
              ops.push({ deleteOne: { filter: { _id: docId } } });
            }
          }
        }
        if (ops.length) await AuthState.bulkWrite(ops);
      },
    },
  };

  return {
    state,
    saveCreds: () => writeDoc('creds', state.creds),
  };
}

module.exports = { useMongoAuthState };
