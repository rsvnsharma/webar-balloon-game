const express = require('express');
const { OpenAI } = require('openai');
const { v4: uuidv4 } = require('uuid');
const Session = require('../models/Session');
const { buildSystemPrompt } = require('../config/systemPrompt');
const { detectCrisis, getCrisisResourcesText } = require('../config/crisisDetector');

const router = express.Router();

function getOpenAIClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key || key === 'sk-your-openai-api-key-here') {
    throw new Error('OpenAI API key is not configured. Set OPENAI_API_KEY in your .env file.');
  }
  return new OpenAI({ apiKey: key });
}

// ------------------------------------------
//  POST /api/chat/session — Create new session
// ------------------------------------------
router.post('/session', async (req, res) => {
  try {
    const { userName, preferredLanguage, userAgent } = req.body;
    const sessionId = uuidv4();

    const session = new Session({
      sessionId,
      userName: userName || 'Anonymous',
      preferredLanguage: preferredLanguage || 'auto',
      metadata: {
        startedAt: new Date(),
        lastActiveAt: new Date(),
        totalMessages: 0,
        userAgent: userAgent || null
      }
    });

    // Generate the opening greeting from the bot
    const systemPrompt = buildSystemPrompt({
      userName: session.userName,
      preferredLanguage: session.preferredLanguage
    });

    const openai = getOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: 'Hello, I just started a conversation. Please introduce yourself and welcome me warmly.' }
      ],
      temperature: 0.85,
      max_tokens: 400,
      top_p: 0.95,
      frequency_penalty: 0.3,
      presence_penalty: 0.4
    });

    const greeting = completion.choices[0].message.content;
    const { cleanContent, emotionTag } = parseEmotionTag(greeting);

    // Save the greeting to the session
    session.messages.push({
      role: 'assistant',
      content: cleanContent,
      detectedEmotion: emotionTag?.emotion || 'neutral',
      timestamp: new Date()
    });

    if (emotionTag) {
      session.emotionTimeline.push({
        emotion: emotionTag.emotion,
        intensity: emotionTag.intensity,
        timestamp: new Date()
      });
    }

    session.metadata.totalMessages = 1;
    await session.save();

    res.json({
      sessionId,
      greeting: cleanContent
    });
  } catch (err) {
    console.error('Error creating session:', err);
    res.status(500).json({ error: 'Failed to create session', details: err.message });
  }
});

// ------------------------------------------
//  POST /api/chat/message — Send a message
// ------------------------------------------
router.post('/message', async (req, res) => {
  try {
    const { sessionId, message } = req.body;

    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId and message are required' });
    }

    const session = await Session.findOne({ sessionId });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // --- Server-side crisis detection ---
    const isCrisis = detectCrisis(message);
    if (isCrisis) {
      session.crisisEpisodes += 1;
    }

    // Save user message
    session.messages.push({
      role: 'user',
      content: message,
      crisisDetected: isCrisis,
      timestamp: new Date()
    });

    // Build conversation history for the LLM (last 30 message pairs to stay within context)
    const systemPrompt = buildSystemPrompt({
      userName: session.userName,
      preferredLanguage: session.preferredLanguage
    });

    const recentMessages = session.messages.slice(-60).map(m => ({
      role: m.role,
      content: m.content
    }));

    const llmMessages = [
      { role: 'system', content: systemPrompt },
      ...recentMessages
    ];

    // If crisis detected, add a system nudge
    if (isCrisis) {
      llmMessages.push({
        role: 'system',
        content: 'CRITICAL: The user may be in crisis or expressing self-harm/suicidal thoughts. Respond with deep empathy, acknowledge their pain explicitly, provide the TeleManas helpline (14416) and other crisis numbers, and continue being present. Do NOT be dismissive or skip the helpline numbers.'
      });
    }

    // Call OpenAI
    const openai = getOpenAIClient();
    const msgCompletion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: llmMessages,
      temperature: 0.85,
      max_tokens: 600,
      top_p: 0.95,
      frequency_penalty: 0.3,
      presence_penalty: 0.4
    });

    const rawReply = msgCompletion.choices[0].message.content;
    const { cleanContent, emotionTag } = parseEmotionTag(rawReply);

    // Save assistant response
    session.messages.push({
      role: 'assistant',
      content: cleanContent,
      detectedEmotion: emotionTag?.emotion || null,
      copingStrategySuggested: emotionTag?.coping !== 'none' ? emotionTag?.coping : null,
      timestamp: new Date()
    });

    // Update emotion timeline
    if (emotionTag) {
      session.emotionTimeline.push({
        emotion: emotionTag.emotion,
        intensity: emotionTag.intensity,
        timestamp: new Date()
      });
    }

    // Track coping strategies
    if (emotionTag?.coping && emotionTag.coping !== 'none') {
      if (!session.copingStrategiesUsed.includes(emotionTag.coping)) {
        session.copingStrategiesUsed.push(emotionTag.coping);
      }
    }

    // Update metadata
    session.metadata.lastActiveAt = new Date();
    session.metadata.totalMessages = session.messages.length;
    session.metadata.sessionDurationMinutes = Math.round(
      (Date.now() - new Date(session.metadata.startedAt).getTime()) / 60000
    );

    await session.save();

    res.json({
      reply: cleanContent,
      emotion: emotionTag?.emotion || null,
      intensity: emotionTag?.intensity || null,
      copingSuggested: emotionTag?.coping !== 'none' ? emotionTag?.coping : null,
      crisisDetected: isCrisis,
      crisisResources: isCrisis ? getCrisisResourcesText() : null
    });
  } catch (err) {
    console.error('Error processing message:', err);
    res.status(500).json({ error: 'Failed to process message', details: err.message });
  }
});

// ------------------------------------------
//  GET /api/chat/session/:sessionId — Get session history
// ------------------------------------------
router.get('/session/:sessionId', async (req, res) => {
  try {
    const session = await Session.findOne({ sessionId: req.params.sessionId });
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    res.json({
      sessionId: session.sessionId,
      userName: session.userName,
      preferredLanguage: session.preferredLanguage,
      messages: session.messages.map(m => ({
        role: m.role,
        content: m.content,
        detectedEmotion: m.detectedEmotion,
        crisisDetected: m.crisisDetected,
        copingStrategySuggested: m.copingStrategySuggested,
        timestamp: m.timestamp
      })),
      emotionTimeline: session.emotionTimeline,
      copingStrategiesUsed: session.copingStrategiesUsed,
      crisisEpisodes: session.crisisEpisodes,
      metadata: session.metadata
    });
  } catch (err) {
    console.error('Error fetching session:', err);
    res.status(500).json({ error: 'Failed to fetch session', details: err.message });
  }
});

// ------------------------------------------
//  GET /api/chat/sessions — List recent sessions (for training data export)
// ------------------------------------------
router.get('/sessions', async (req, res) => {
  try {
    const { page = 1, limit = 50, crisis } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (crisis === 'true') {
      filter.crisisEpisodes = { $gt: 0 };
    }

    const sessions = await Session.find(filter)
      .sort({ 'metadata.startedAt': -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .select('sessionId userName preferredLanguage crisisEpisodes copingStrategiesUsed metadata emotionTimeline');

    const total = await Session.countDocuments(filter);

    res.json({
      sessions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error('Error listing sessions:', err);
    res.status(500).json({ error: 'Failed to list sessions', details: err.message });
  }
});

// ------------------------------------------
//  GET /api/chat/export — Export data for model training
// ------------------------------------------
router.get('/export', async (req, res) => {
  try {
    const { from, to, format = 'json' } = req.query;
    const filter = {};

    if (from || to) {
      filter['metadata.startedAt'] = {};
      if (from) filter['metadata.startedAt'].$gte = new Date(from);
      if (to) filter['metadata.startedAt'].$lte = new Date(to);
    }

    const sessions = await Session.find(filter)
      .sort({ 'metadata.startedAt': -1 })
      .lean();

    if (format === 'jsonl') {
      // JSONL format — one conversation per line, ideal for fine-tuning
      res.setHeader('Content-Type', 'application/jsonl');
      res.setHeader('Content-Disposition', 'attachment; filename=mindbridge-training-data.jsonl');

      const lines = sessions.map(session => {
        const messages = session.messages
          .filter(m => m.role !== 'system')
          .map(m => ({
            role: m.role,
            content: m.content,
            metadata: {
              emotion: m.detectedEmotion,
              crisis: m.crisisDetected,
              coping: m.copingStrategySuggested
            }
          }));
        return JSON.stringify({
          session_id: session.sessionId,
          messages,
          emotion_timeline: session.emotionTimeline,
          coping_strategies: session.copingStrategiesUsed,
          crisis_episodes: session.crisisEpisodes,
          language: session.preferredLanguage
        });
      });

      return res.send(lines.join('\n'));
    }

    res.json({
      exportedAt: new Date().toISOString(),
      totalSessions: sessions.length,
      data: sessions
    });
  } catch (err) {
    console.error('Error exporting data:', err);
    res.status(500).json({ error: 'Failed to export data', details: err.message });
  }
});

// ------------------------------------------
//  HELPER: Parse emotion tag from bot response
// ------------------------------------------
function parseEmotionTag(text) {
  const tagRegex = /\[EMOTION:\s*(\w+)\s*\|\s*INTENSITY:\s*(\w+)\s*\|\s*COPING:\s*([^\]]+)\]/i;
  const match = text.match(tagRegex);

  if (match) {
    return {
      cleanContent: text.replace(tagRegex, '').trim(),
      emotionTag: {
        emotion: match[1].toLowerCase(),
        intensity: match[2].toLowerCase(),
        coping: match[3].trim().toLowerCase()
      }
    };
  }

  return { cleanContent: text.trim(), emotionTag: null };
}

module.exports = router;
