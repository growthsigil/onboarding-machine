/**
 * Anthropic client — the AI brain that sorts the call transcript into a brief.
 *
 * Same call shape as the full platform (`claude("action").messages.create(...)`)
 * so lib/fathom.ts can be shared verbatim — just without the usage metering the
 * big app does. Lazy singleton: never construct or throw at import time (Next.js
 * loads route modules during build, where the key may be absent).
 */
import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (_client) return _client;
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("Missing ANTHROPIC_API_KEY in environment variables.");
  _client = new Anthropic({ apiKey: key });
  return _client;
}

/** The Anthropic client. `action` is accepted for call-shape parity and ignored. */
export function claude(_action?: string): Anthropic {
  return getClient();
}
