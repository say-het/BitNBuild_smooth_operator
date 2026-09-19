import { env } from '../../config/env.js';
import { GEMINI_RESPONSE_SCHEMA } from './incident-intelligence-contract.js';
import { INCIDENT_INTELLIGENCE_SYSTEM_PROMPT } from './incident-intelligence-prompt.js';

export class GeminiClientError extends Error {
  constructor(code, message, { transient = false, status, attempts = 0 } = {}) {
    super(message);
    this.name = 'GeminiClientError';
    this.code = code;
    this.transient = transient;
    this.status = status;
    this.attempts = attempts;
  }
}

function responseText(body) {
  return body?.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('').trim();
}

function classifyRequestError(error) {
  if (error instanceof GeminiClientError) return error;
  if (error.name === 'AbortError') return new GeminiClientError('AI_TIMEOUT', 'Gemini request timed out', { transient: true });
  return new GeminiClientError('AI_NETWORK_ERROR', 'Gemini network request failed', { transient: true });
}

export function createGeminiClient({
  apiKey = env.GEMINI_API_KEY,
  model = env.GEMINI_MODEL,
  timeoutMs = env.GEMINI_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
  maxRetries = 2,
  sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
} = {}) {
  return {
    provider: 'GEMINI',
    model: model ?? 'unconfigured',
    isConfigured() {
      return Boolean(apiKey && model);
    },
    async generateStructured(prompt, {
      systemPrompt = INCIDENT_INTELLIGENCE_SYSTEM_PROMPT,
      responseSchema = GEMINI_RESPONSE_SCHEMA,
      image = null,
    } = {}) {
      if (!apiKey) throw new GeminiClientError('AI_CONFIGURATION_MISSING', 'Gemini API key is not configured');
      if (!model) throw new GeminiClientError('AI_CONFIGURATION_MISSING', 'Gemini model is not configured');

      let lastError;
      for (let attempt = 1; attempt <= maxRetries + 1; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetchImpl(
            `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
            {
              method: 'POST',
              headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
              signal: controller.signal,
              body: JSON.stringify({
                systemInstruction: { parts: [{ text: systemPrompt }] },
                contents: [{
                  role: 'user',
                  parts: [{ text: prompt }, ...(image ? [{ inlineData: { mimeType: image.mimeType, data: image.data } }] : [])],
                }],
                generationConfig: {
                  temperature: 0.1,
                  responseMimeType: 'application/json',
                  responseJsonSchema: responseSchema,
                },
              }),
            },
          );
          if (!response.ok) {
            const transient = response.status === 408 || response.status === 429 || response.status >= 500;
            const code = response.status === 429 ? 'AI_RATE_LIMITED' : transient ? 'AI_PROVIDER_UNAVAILABLE' : 'AI_PROVIDER_ERROR';
            throw new GeminiClientError(code, 'Gemini request failed', { transient, status: response.status });
          }
          const body = await response.json();
          const text = responseText(body);
          if (!text) throw new GeminiClientError('AI_EMPTY_RESPONSE', 'Gemini returned no structured output');
          try {
            return { output: JSON.parse(text), attempts: attempt };
          } catch {
            throw new GeminiClientError('AI_INVALID_JSON', 'Gemini returned malformed JSON');
          }
        } catch (error) {
          lastError = classifyRequestError(error);
          lastError.attempts = attempt;
          if (!lastError.transient || attempt > maxRetries) throw lastError;
          await sleep(250 * 2 ** (attempt - 1));
        } finally {
          clearTimeout(timeout);
        }
      }
      throw lastError;
    },
  };
}

export const geminiClient = createGeminiClient();
