/**
 * Client-side + server-side crisis detection.
 * Uses multi-language keyword/pattern matching as a safety net
 * IN ADDITION to the LLM's own crisis awareness.
 */

const CRISIS_PATTERNS = [
  // English — suicidal ideation
  /\b(kill\s*(my)?self|suicide|suicidal|end\s*(my)?\s*life|want\s*to\s*die|wanna\s*die|don'?t\s*want\s*to\s*live|no\s*reason\s*to\s*live|better\s*off\s*dead|rather\s*(be\s*)?dead)\b/i,
  // English — self-harm
  /\b(self[- ]?harm|cut(ting)?\s*(my)?self|hurt(ing)?\s*(my)?self|overdose|jump\s*(off|from)|hang\s*(my)?self|slit\s*(my)?\s*wrist|burn(ing)?\s*(my)?self)\b/i,
  // English — extreme hopelessness / farewell
  /\b(no\s*hope|hopeless|worthless|nobody\s*cares|can'?t\s*go\s*on|can'?t\s*take\s*(it|this)\s*(any\s*more|anymore)|planning\s*(to|my)\s*(death|end)|wrote\s*a\s*(suicide\s*)?note|goodbye\s*forever|final\s*goodbye|nothing\s*matters\s*anymore)\b/i,
  // Hindi
  /(\u0916\u0941\u0926\u0915\u0941\u0936\u0940|\u0906\u0924\u094d\u092e\u0939\u0924\u094d\u092f\u093e|\u092e\u0930\u0928\u093e\s*\u091a\u093e\u0939|\u091c\u0940\u0928\u093e\s*\u0928\u0939\u0940\u0902\s*\u091a\u093e\u0939|\u092e\u094c\u0924|\u0916\u0941\u0926\s*\u0915\u094b\s*\u092e\u093e\u0930)/i,
  // Bengali
  /(\u0986\u09a4\u09cd\u09ae\u09b9\u09a4\u09cd\u09af\u09be|\u09ae\u09b0\u09a4\u09c7\s*\u099a\u09be\u0987|\u09ac\u09be\u0981\u099a\u09a4\u09c7\s*\u099a\u09be\u0987\s*\u09a8\u09be)/i,
  // Tamil
  /(\u0ba4\u0bb1\u0bcd\u0b95\u0bca\u0bb2\u0bc8|\u0b9a\u0bbe\u0b95\u0baa\u0bcd\u0baa\u0bcb\u0b95)/i,
  // Telugu
  /(\u0c06\u0c24\u0c4d\u0c2e\u0c39\u0c24\u0c4d\u0c2f|\u0c1a\u0c3e\u0c35\u0c3e\u0c32\u0c28\u0c41\u0c15\u0c41\u0c02\u0c1f\u0c41\u0c28\u0c4d\u0c28\u0c3e)/i,
  // Marathi
  /(\u0906\u0924\u094d\u092e\u0939\u0924\u094d\u092f\u093e|\u092e\u0930\u093e\u092f\u091a\u0902\s*\u0906\u0939\u0947)/i,
];

const CRISIS_RESOURCES = {
  in: {
    primary: { name: 'TeleManas Helpline', number: '14416', note: 'Toll-free, 24/7, Government of India' },
    additional: [
      { name: 'iCall', number: '9152987821' },
      { name: 'Vandrevala Foundation', number: '1860-2662-345' },
      { name: 'AASRA', number: '9820466726' },
    ]
  },
  international: {
    primary: { name: 'Crisis Text Line', instruction: 'Text HOME to 741741' },
    directory: 'https://www.iasp.info/resources/Crisis_Centres/'
  }
};

function detectCrisis(text) {
  return CRISIS_PATTERNS.some(pattern => pattern.test(text));
}

function getCrisisResourcesText() {
  const res = CRISIS_RESOURCES;
  return `If you or someone you know is in crisis, please reach out:

India:
- ${res.in.primary.name}: ${res.in.primary.number} (${res.in.primary.note})
${res.in.additional.map(r => `- ${r.name}: ${r.number}`).join('\n')}

International:
- ${res.international.primary.name}: ${res.international.primary.instruction}
- Find local help: ${res.international.directory}

You are not alone. Please talk to someone.`;
}

module.exports = { detectCrisis, getCrisisResourcesText, CRISIS_RESOURCES };
