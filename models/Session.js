const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  detectedEmotion: {
    type: String,
    default: null
  },
  crisisDetected: {
    type: Boolean,
    default: false
  },
  copingStrategySuggested: {
    type: String,
    default: null
  },
  language: {
    type: String,
    default: null
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
});

const sessionSchema = new mongoose.Schema({
  sessionId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  userName: {
    type: String,
    default: 'Anonymous'
  },
  preferredLanguage: {
    type: String,
    default: 'auto'
  },
  messages: [messageSchema],
  emotionTimeline: [{
    emotion: String,
    intensity: String,
    timestamp: { type: Date, default: Date.now }
  }],
  copingStrategiesUsed: [String],
  crisisEpisodes: {
    type: Number,
    default: 0
  },
  metadata: {
    startedAt: { type: Date, default: Date.now },
    lastActiveAt: { type: Date, default: Date.now },
    totalMessages: { type: Number, default: 0 },
    userAgent: { type: String, default: null },
    sessionDurationMinutes: { type: Number, default: 0 }
  }
}, {
  timestamps: true
});

sessionSchema.index({ 'metadata.startedAt': -1 });
sessionSchema.index({ crisisEpisodes: 1 });
sessionSchema.index({ 'emotionTimeline.emotion': 1 });

module.exports = mongoose.model('Session', sessionSchema);
