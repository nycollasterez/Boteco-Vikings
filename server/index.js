const express = require('express');
const path = require('node:path');
const apiRoutes = require('./routes');
require('./db'); // ensures database is initialized

const app = express();
const PORT = process.env.PORT || 3000;

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Static files
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// API Routes
app.use('/api', apiRoutes);

// Friendly URL routing for clean paths
app.get('/cardapio', (req, res) => {
  res.sendFile(path.join(publicDir, 'cardapio.html'));
});

app.get('/karaoke', (req, res) => {
  res.sendFile(path.join(publicDir, 'karaoke.html'));
});

app.get('/karaoke/telao', (req, res) => {
  res.sendFile(path.join(publicDir, 'karaoke-telao.html'));
});

app.get('/painel', (req, res) => {
  res.sendFile(path.join(publicDir, 'painel.html'));
});

// Fallback catch-all middleware for client-side routing
app.use((req, res) => {
  if (req.path.startsWith('/painel')) {
    return res.sendFile(path.join(publicDir, 'painel.html'));
  }
  res.sendFile(path.join(publicDir, 'index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`=========================================`);
  console.log(`⚔️  BOTECO VIKINGS PLATAFORMA INTEGRADA  ⚔️`);
  console.log(`Servidor rodando localmente e na rede:`);
  console.log(`- Local:            http://localhost:${PORT}`);
  console.log(`- Rede Local (Wi-Fi): http://192.168.100.76:${PORT}`);
  console.log(`- Cardápio na Rede: http://192.168.100.76:${PORT}/cardapio`);
  console.log(`- Painel & PDV:     http://192.168.100.76:${PORT}/painel`);
  console.log(`- Karaokê Telão:    http://192.168.100.76:${PORT}/karaoke/telao`);
  console.log(`=========================================`);
});

module.exports = { app, server };
