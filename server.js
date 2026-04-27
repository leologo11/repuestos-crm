require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const connectDB = require('./server/config/db');
const apiRoutes = require('./server/routes/api');

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ['http://localhost:5173', 'http://localhost:3001'],
    credentials: true,
  },
});

const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:3001'];
app.use(cors({
  origin: (origin, cb) => cb(null, true), // permitir landing desde file:// y cualquier origen
  credentials: true,
}));
app.use(express.json());

connectDB();
app.use('/api', apiRoutes);

// Servir la landing page de cotización
app.get('/cotiza', (_req, res) =>
  res.sendFile(path.join(__dirname, 'Landing Cotizacion.html'))
);

io.on('connection', (socket) => {
  console.log(`🔌 Panel conectado: ${socket.id}`);
  socket.on('disconnect', () => console.log(`❌ Panel desconectado: ${socket.id}`));
});

global.io = io;

// Iniciar bot de WhatsApp (no bloquea el servidor si falla)
try {
  const whatsappBot = require('./server/bot/whatsapp');
  whatsappBot.initialize();
} catch (err) {
  console.warn('⚠️  WhatsApp bot no pudo iniciar:', err.message);
  console.warn('    Instala las dependencias con: npm install');
}

// Servir panel admin (React compilado)
const distPath = path.join(__dirname, 'dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`\n🚀 Servidor:  http://localhost:${PORT}`);
  console.log(`📊 API:       http://localhost:${PORT}/api`);
  console.log(`🖥️  Panel:     http://localhost:${PORT}/`);
  console.log(`🛒 Cotizador: http://localhost:${PORT}/cotiza\n`);
});
