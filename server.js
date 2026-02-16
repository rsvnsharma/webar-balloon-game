require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const chatRoutes = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// --- API Routes ---
app.use('/api/chat', chatRoutes);

// --- Serve frontend ---
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- Health check ---
app.get('/api/health', async (req, res) => {
  const dbState = mongoose.connection.readyState;
  const dbStates = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  res.json({
    status: 'ok',
    database: dbStates[dbState] || 'unknown',
    uptime: process.uptime()
  });
});

// --- Connect to MongoDB and start server ---
async function start() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/mindbridge';

  try {
    await mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000
    });
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    console.log('Starting server without database — chat will work but messages will NOT be persisted.');
    console.log('Set MONGODB_URI in .env to enable persistence.');
  }

  app.listen(PORT, () => {
    console.log(`MindBridge server running on http://localhost:${PORT}`);
  });
}

start();
