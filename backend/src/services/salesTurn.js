// Shared conversation-turn logic used by BOTH the HTTP /api/chat route and the
// phone (Twilio Media Streams) pipeline, so behaviour is identical on every channel.

import { SAAS_PRODUCTS, buildSalesSystemPrompt, generateSmartSalesResponse } from './salesEngine.js';
import { groqChat } from './groqClient.js';
import { groqConfig } from '../config/env.js';

// A product is either a catalog key or one of the caller's own saved custom
// products. Nothing else can be pitched: the definition is never taken from the
// request body, so the agent's prompt always comes from stored workspace config.
function resolveProduct(productKey, userProducts = []) {
  const owned = (userProducts || []).find((p) => p && p.id === productKey);
  return owned || SAAS_PRODUCTS[productKey] || SAAS_PRODUCTS['devpulse'];
}

// Build the LLM message array from our internal history format.
function buildMessages({ product, language, history, message }) {
  const messages = [{ role: 'system', content: buildSalesSystemPrompt(product, language) }];
  for (const item of (history || []).slice(-8)) {
    if (!item.text) continue;
    messages.push({
      role: item.sender === 'bot' ? 'assistant' : 'user',
      content: item.text
    });
  }
  if (message) {
    messages.push({ role: 'user', content: message });
  } else if (messages.length === 1) {
    messages.push({ role: 'user', content: 'Begin the opening sales pitch for this call.' });
  }
  return messages;
}

// Produce the next bot turn.
// Options: { message, history, productKey, language, userProducts, maxTokens }
// Returns: { reply, provider }
// Throws GroqError only when a key is configured but the Groq call fails — the caller
// decides how to surface that. When there is NO key, it returns the rule-engine reply.
export async function generateTurn(opts) {
  const product = resolveProduct(opts.productKey, opts.userProducts);
  const language = opts.language || 'English';
  const apiKey = groqConfig.apiKey();

  if (apiKey) {
    const content = await groqChat({
      apiKey,
      messages: buildMessages({ product, language, history: opts.history, message: opts.message }),
      maxTokens: opts.maxTokens || 180,
      temperature: 0.7
    });
    return { reply: content.trim(), provider: 'groq' };
  }

  const reply = generateSmartSalesResponse({
    productKey: opts.productKey,
    customProduct: product.custom ? product : null,
    message: opts.message,
    history: opts.history,
    language
  });
  return { reply, provider: 'smart-sales-engine' };
}

export { resolveProduct };
