/**
 * Emotional Support Bot - Response Logic
 *
 * Fixes two behavioural issues:
 *
 * 1. STAGED CRISIS ESCALATION
 *    Ambiguous phrases like "giving up" no longer trigger a direct self-harm
 *    question. Instead the bot gathers context first and only escalates to an
 *    explicit safety check when distress persists across multiple turns, or
 *    when an unambiguously explicit signal is detected.
 *
 * 2. LOW-ENERGY MODE
 *    When the user signals emotional exhaustion, frustration, comfort-seeking,
 *    or resistance the bot stops ending responses with questions (which add
 *    cognitive load) and instead offers concrete coping strategies as
 *    statements.
 */

// ---------------------------------------------------------------------------
// Signal libraries
// ---------------------------------------------------------------------------

/**
 * Phrases that SOUND alarming but are commonly used to mean "I'm struggling
 * with a situation", not "I want to die". They trigger Stage-1 empathy, not a
 * direct self-harm question.
 */
const AMBIGUOUS_DISTRESS_PHRASES = [
  "giving up",
  "can't do this",
  "what's the point",
  "tired of everything",
  "done with this",
  "can't take it anymore",
  "can't take it",
  "fed up",
  "no point",
  "why bother",
  "nothing works",
  "nothing is worth",
  "nothing ever gets better",
  "nothing ever get better",
  "pointless",
  "over it",
  "can't go on",
];

/**
 * Phrases that explicitly and unambiguously signal a crisis. Only these
 * warrant an immediate, direct safety check.
 */
const EXPLICIT_CRISIS_PHRASES = [
  "want to die",
  "kill myself",
  "end my life",
  "ending my life",
  "take my life",
  "taking my life",
  "suicide",
  "hurt myself",
  "harm myself",
  "not want to be here",
  "don't want to be here",
  "wish i was dead",
  "self harm",
  "self-harm",
  "don't want to live",
];

/**
 * Signals that the user is low-energy or emotionally exhausted. Detecting
 * these switches the bot from question mode into coping-offer mode.
 */
const LOW_ENERGY_SIGNALS = [
  "i don't know",
  "idk",
  "i can't",
  "so tired",
  "never mind",
  "forget it",
  "whatever",
  "doesn't matter",
  "it doesn't matter",
  "leave me alone",
  "can't talk",
  "too much",
  "i give up",
  "exhausted",
  "drained",
];

// ---------------------------------------------------------------------------
// Coping strategies (offered as statements, not questions)
// ---------------------------------------------------------------------------

const COPING_STRATEGIES = [
  "Sometimes just slowing your breathing can help — in through the nose for 4 counts, out through the mouth for 6.",
  "You don't have to figure everything out right now. One small step is enough.",
  "It's okay to rest. You're allowed to not push through everything.",
  "Putting on a familiar song or show in the background can make things feel a little less heavy.",
  "A glass of water and a few minutes away from screens can help more than it sounds.",
  "You don't have to explain or justify how you're feeling. It's valid as it is.",
  "Sometimes just naming what you're feeling — even just 'I'm exhausted' — can take a little of its weight away.",
  "Doing one tiny, manageable thing (making tea, opening a window) can break the stuck feeling.",
];

// ---------------------------------------------------------------------------
// Crisis resources
// ---------------------------------------------------------------------------

/** Plain-text version — used in the `text` field and in Node/test environments. */
const CRISIS_RESOURCES =
  "If you're in crisis, please reach out:\n" +
  "• National Suicide Prevention Lifeline: 988 (call or text)\n" +
  "• Crisis Text Line: Text HOME to 741741\n" +
  "• International resources: findahelpline.com";

/**
 * HTML version — used in the `html` field for browser rendering.
 * Links use tel: / sms: / https: schemes so users can tap/click directly.
 */
const CRISIS_RESOURCES_HTML =
  "If you're in crisis, please reach out:<br>" +
  '• National Suicide Prevention Lifeline: ' +
    '<a href="tel:988" rel="noopener noreferrer">988</a> (call or text)<br>' +
  '• Crisis Text Line: Text HOME to ' +
    '<a href="sms:741741" rel="noopener noreferrer">741741</a><br>' +
  '• International resources: ' +
    '<a href="https://findahelpline.com" target="_blank" rel="noopener noreferrer">findahelpline.com</a>';

// ---------------------------------------------------------------------------
// Response modes
// ---------------------------------------------------------------------------

/**
 * @typedef {'empathy' | 'gentle_concern' | 'safety_check' | 'crisis' | 'coping_offer' | 'engaged'} ResponseMode
 */

// ---------------------------------------------------------------------------
// Bot class
// ---------------------------------------------------------------------------

class EmotionalSupportBot {
  constructor() {
    /** @type {Array<{role: string, message: string, crisisLevel: string, energyState: string}>} */
    this.conversationHistory = [];

    /**
     * Counts consecutive turns where an ambiguous distress phrase was detected.
     * Resets to 0 when a turn has no distress signal.
     * Used to decide which escalation stage to apply.
     */
    this.distressTurnCount = 0;
  }

  // -------------------------------------------------------------------------
  // Detection helpers
  // -------------------------------------------------------------------------

  /**
   * Returns 'low' if the message contains low-energy signals, 'engaged' otherwise.
   * @param {string} message
   * @returns {'low' | 'engaged'}
   */
  detectEnergyState(message) {
    const lower = message.toLowerCase();
    return LOW_ENERGY_SIGNALS.some((signal) => lower.includes(signal))
      ? "low"
      : "engaged";
  }

  /**
   * Returns the crisis level of the message.
   * - 'explicit'  → unambiguous self-harm signal
   * - 'ambiguous' → phrase that could mean distress but not necessarily self-harm
   * - 'none'      → no distress signal detected
   *
   * @param {string} message
   * @returns {'explicit' | 'ambiguous' | 'none'}
   */
  detectCrisisLevel(message) {
    const lower = message.toLowerCase();

    if (EXPLICIT_CRISIS_PHRASES.some((phrase) => lower.includes(phrase))) {
      return "explicit";
    }

    if (AMBIGUOUS_DISTRESS_PHRASES.some((phrase) => lower.includes(phrase))) {
      return "ambiguous";
    }

    return "none";
  }

  /** @returns {string} */
  _randomCopingStrategy() {
    return COPING_STRATEGIES[Math.floor(Math.random() * COPING_STRATEGIES.length)];
  }

  // -------------------------------------------------------------------------
  // Core response builder
  // -------------------------------------------------------------------------

  /**
   * Given a user message, returns the bot's response object.
   *
   * @param {string} message - Raw user message text
   * @returns {{ text: string, mode: ResponseMode }}
   */
  buildResponse(message) {
    const crisisLevel = this.detectCrisisLevel(message);
    const energyState = this.detectEnergyState(message);

    this.conversationHistory.push({
      role: "user",
      message,
      crisisLevel,
      energyState,
    });

    // -----------------------------------------------------------------------
    // FIX 1: Staged crisis escalation
    // -----------------------------------------------------------------------

    if (crisisLevel === "explicit") {
      // Unambiguous signal → immediate, compassionate safety check + resources
      this.distressTurnCount = 0;
      const explicitPreamble =
        "I hear you, and I'm really glad you're talking to me. What you're feeling right now matters, and you don't have to face this alone.";
      return {
        text: explicitPreamble + "\n\n" + CRISIS_RESOURCES,
        html: explicitPreamble + "<br><br>" + CRISIS_RESOURCES_HTML,
        mode: "crisis",
      };
    }

    if (crisisLevel === "ambiguous") {
      this.distressTurnCount++;

      if (this.distressTurnCount === 1) {
        // Stage 1 — Empathy + open-ended context gathering.
        // NOT a direct self-harm question; the phrase is too ambiguous for that.
        return {
          text: "That sounds really hard. It sounds like something is weighing on you — do you want to share more about what's going on?",
          mode: "empathy",
        };
      }

      if (this.distressTurnCount === 2) {
        // Stage 2 — Gentle door-opening.
        // Acknowledge the persistence without alarming the user.
        return {
          text: "I want to make sure I understand what you're going through. Sometimes when things feel this heavy, it can be hard to put into words. I'm here, and there's no rush — take whatever space you need.",
          mode: "gentle_concern",
        };
      }

      if (this.distressTurnCount >= 3) {
        // Stage 3 — Explicit but compassionate safety check.
        // Only reached after distress has persisted across multiple turns.
        const safetyPreamble =
          "I've noticed you've been carrying some really heavy feelings over the past few messages. I want to ask directly — are you having any thoughts of hurting yourself? There's no wrong answer, and I'm not going anywhere.\n\nIf you are, please know support is here:\n";
        const safetyPreambleHtml =
          "I've noticed you've been carrying some really heavy feelings over the past few messages. I want to ask directly — are you having any thoughts of hurting yourself? There's no wrong answer, and I'm not going anywhere.<br><br>If you are, please know support is here:<br>";
        return {
          text: safetyPreamble + CRISIS_RESOURCES,
          html: safetyPreambleHtml + CRISIS_RESOURCES_HTML,
          mode: "safety_check",
        };
      }
    }

    // No distress signal this turn → reset the counter
    this.distressTurnCount = 0;

    // -----------------------------------------------------------------------
    // FIX 2: Low-energy mode — offer coping strategies, not more questions
    // -----------------------------------------------------------------------

    if (energyState === "low") {
      return {
        text:
          "That makes sense. You don't have to have answers right now.\n\n" +
          this._randomCopingStrategy(),
        mode: "coping_offer",
      };
    }

    // -----------------------------------------------------------------------
    // Default: engaged user — a clarifying question is appropriate here
    // -----------------------------------------------------------------------

    return {
      text: "I hear you. Can you tell me a bit more about what's been going on?",
      mode: "engaged",
    };
  }

  /**
   * Convenience wrapper — returns only the response text string.
   * @param {string} message
   * @returns {string}
   */
  respond(message) {
    return this.buildResponse(message).text;
  }

  /** Resets conversation state (e.g. on session start). */
  reset() {
    this.conversationHistory = [];
    this.distressTurnCount = 0;
  }
}

// ---------------------------------------------------------------------------
// Exports (supports both CommonJS and browser global)
// ---------------------------------------------------------------------------

if (typeof module !== "undefined" && module.exports) {
  module.exports = { EmotionalSupportBot, CRISIS_RESOURCES, CRISIS_RESOURCES_HTML };
} else {
  window.EmotionalSupportBot = EmotionalSupportBot;
  window.CRISIS_RESOURCES_HTML = CRISIS_RESOURCES_HTML;
}
