/**
 * Tests for EmotionalSupportBot
 *
 * Covers the two fixed behaviours:
 *   1. Staged crisis escalation (ambiguous phrases must NOT trigger a direct
 *      self-harm question on the first turn)
 *   2. Low-energy mode (bot switches to coping-offer statements, not questions)
 */

const { EmotionalSupportBot, CRISIS_RESOURCES } = require("./bot");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freshBot() {
  return new EmotionalSupportBot();
}

// ---------------------------------------------------------------------------
// FIX 1 — Staged crisis escalation
// ---------------------------------------------------------------------------

describe("Fix 1: Staged crisis escalation", () => {
  describe("Ambiguous distress phrase — first turn", () => {
    test('should NOT ask directly about self-harm on "Sometimes I feel like giving up"', () => {
      const bot = freshBot();
      const { text, mode } = bot.buildResponse("Sometimes I feel like giving up.");

      // Must be empathy / context-gathering, not a self-harm question
      expect(mode).toBe("empathy");
      expect(text).not.toMatch(/harm(ing)? yourself/i);
      expect(text).not.toMatch(/suicid/i);
      expect(text).not.toMatch(/hurt yourself/i);
    });

    test("mode should be 'empathy' on first ambiguous turn", () => {
      const bot = freshBot();
      const { mode } = bot.buildResponse("I can't take it anymore.");
      expect(mode).toBe("empathy");
    });

    test("response should invite the user to share more, not interrogate", () => {
      const bot = freshBot();
      const { text } = bot.buildResponse("What's the point of any of this?");
      // Should feel like an open, warm invitation
      expect(text.length).toBeGreaterThan(10);
      // Should not fire crisis resources on turn 1
      expect(text).not.toContain("988");
    });
  });

  describe("Ambiguous distress — second consecutive turn", () => {
    test("mode should be 'gentle_concern' on second ambiguous turn", () => {
      const bot = freshBot();
      bot.buildResponse("I feel like giving up.");
      const { mode } = bot.buildResponse("I'm so fed up with everything.");
      expect(mode).toBe("gentle_concern");
    });

    test("response should still not contain explicit crisis resources on turn 2", () => {
      const bot = freshBot();
      bot.buildResponse("What's the point anymore.");
      const { text } = bot.buildResponse("Nothing works for me.");
      expect(text).not.toContain("988");
    });
  });

  describe("Ambiguous distress — third consecutive turn", () => {
    test("mode should be 'safety_check' on third ambiguous turn", () => {
      const bot = freshBot();
      bot.buildResponse("I feel like giving up.");
      bot.buildResponse("I'm so tired of everything.");
      const { mode } = bot.buildResponse("Why does nothing ever get better?");
      expect(mode).toBe("safety_check");
    });

    test("safety_check response should include crisis resources", () => {
      const bot = freshBot();
      bot.buildResponse("I feel like giving up.");
      bot.buildResponse("I'm so done with this.");
      const { text } = bot.buildResponse("Nothing is worth it.");
      expect(text).toContain("988");
    });

    test("safety_check response should ask about self-harm compassionately", () => {
      const bot = freshBot();
      bot.buildResponse("I feel like giving up.");
      bot.buildResponse("Fed up.");
      const { text } = bot.buildResponse("Can't take it.");
      expect(text).toMatch(/thoughts of hurting yourself/i);
    });
  });

  describe("Explicit crisis phrase — immediate response", () => {
    test("mode should be 'crisis' on explicit signal", () => {
      const bot = freshBot();
      const { mode } = bot.buildResponse("I want to kill myself.");
      expect(mode).toBe("crisis");
    });

    test("crisis response must include resources immediately", () => {
      const bot = freshBot();
      const { text } = bot.buildResponse("I've been thinking about ending my life.");
      expect(text).toContain("988");
    });

    test("explicit signal should bypass the staged-escalation counter", () => {
      const bot = freshBot();
      // No prior ambiguous turns — still gets crisis response immediately
      const { mode } = bot.buildResponse("I don't want to be here anymore.");
      expect(mode).toBe("crisis");
    });
  });

  describe("Distress counter resets after a non-distress turn", () => {
    test("counter resets to 0 on a neutral turn", () => {
      const bot = freshBot();
      bot.buildResponse("I feel like giving up.");       // distressTurnCount = 1
      bot.buildResponse("The weather is nice today.");   // neutral → resets to 0
      const { mode } = bot.buildResponse("I feel like giving up again."); // back to 1
      expect(mode).toBe("empathy"); // Stage 1 again, not Stage 3
    });
  });
});

// ---------------------------------------------------------------------------
// FIX 2 — Low-energy mode
// ---------------------------------------------------------------------------

describe("Fix 2: Low-energy mode — offer coping strategies, not questions", () => {
  test("mode should be 'coping_offer' on low-energy signal", () => {
    const bot = freshBot();
    const { mode } = bot.buildResponse("I don't know. I'm just so tired.");
    expect(mode).toBe("coping_offer");
  });

  test("coping_offer response should not end with a question", () => {
    const bot = freshBot();
    const { text } = bot.buildResponse("Never mind, forget it.");
    // Strip trailing whitespace before checking
    expect(text.trimEnd()).not.toMatch(/\?$/);
  });

  test("coping_offer response should include a concrete coping strategy", () => {
    const bot = freshBot();
    const { text } = bot.buildResponse("idk. whatever.");
    // The response should contain actionable/validating content
    expect(text.length).toBeGreaterThan(30);
  });

  test("multiple low-energy phrases all trigger coping_offer mode", () => {
    const lowPhrases = [
      "I can't.",
      "It doesn't matter.",
      "I'm exhausted.",
      "Leave me alone.",
      "Too much.",
    ];
    lowPhrases.forEach((phrase) => {
      const bot = freshBot();
      const { mode } = bot.buildResponse(phrase);
      expect(mode).toBe("coping_offer");
    });
  });

  test("engaged users should still receive a clarifying question", () => {
    const bot = freshBot();
    const { mode, text } = bot.buildResponse("I've been feeling a bit off lately.");
    expect(mode).toBe("engaged");
    expect(text).toMatch(/\?/); // Question is appropriate for engaged users
  });
});

// ---------------------------------------------------------------------------
// General API surface
// ---------------------------------------------------------------------------

describe("API surface", () => {
  test("respond() returns a string", () => {
    const bot = freshBot();
    const result = bot.respond("Hello");
    expect(typeof result).toBe("string");
  });

  test("reset() clears history and counter", () => {
    const bot = freshBot();
    bot.buildResponse("I feel like giving up.");
    bot.buildResponse("What's the point.");
    bot.reset();
    expect(bot.conversationHistory).toHaveLength(0);
    expect(bot.distressTurnCount).toBe(0);
    // After reset, ambiguous phrase should be treated as turn 1 again
    const { mode } = bot.buildResponse("I feel like giving up.");
    expect(mode).toBe("empathy");
  });

  test("conversationHistory records every turn", () => {
    const bot = freshBot();
    bot.buildResponse("Hello");
    bot.buildResponse("I'm doing okay.");
    expect(bot.conversationHistory).toHaveLength(2);
  });
});
