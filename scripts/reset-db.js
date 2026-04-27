require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const mongoose = require('mongoose');

const Proveedor   = require('../server/models/Proveedor');
const Conversation = require('../server/models/Conversation');
const Quote       = require('../server/models/Quote');
const Cliente     = require('../server/models/Cliente');

// Carga condicional — estos modelos pueden no existir aún
let Pedido, Repartidor;
try { Pedido      = require('../server/models/Pedido');     } catch (_) {}
try { Repartidor  = require('../server/models/Repartidor'); } catch (_) {}

async function reset() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Conectado a MongoDB');

  // Limpiar todo
  await Conversation.deleteMany({});
  await Quote.deleteMany({});
  await Cliente.deleteMany({});
  await Proveedor.deleteMany({});
  if (Pedido)     await Pedido.deleteMany({});
  if (Repartidor) await Repartidor.deleteMany({});

  console.log('🗑️  Base de datos limpia');

  // Crear el único proveedor de prueba
  const proveedor = await Proveedor.create({
    nombre:   'Proveedor Principal',
    whatsapp: '56952023504',
    marcas:   'Toyota, Hyundai, Kia, Suzuki, Chevrolet',
    estado:   'Activo',
    api:      'Sin API',
    rating:   100,
  });

  console.log(`✅ Proveedor creado: ${proveedor.nombre} | WA: ${proveedor.whatsapp}`);
  console.log('\n🚀 Listo. Reinicia el servidor con: npm run dev\n');

  await mongoose.disconnect();
}

reset().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
