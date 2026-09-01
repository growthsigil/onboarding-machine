/**
 * Telegram (FULLY OPTIONAL) — ping the brief to your phone.
 *
 * If TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID aren't set, sendTelegram() just
 * returns {skipped:true} and the app carries on. Nothing else depends on it —
 * briefs are always stored and viewable at /briefs, and filed to Google Docs
 * when that's connected.
 */
export function telegramConfigured(): boolean {
  return !!(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID);
}

export type TelegramResult = { ok: boolean; skipped?: boolean; error?: string };

export async function sendTelegram(text: string): Promise<TelegramResult> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, skipped: true };
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      // No link preview so the brief text stays the focus.
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
    if (!resp.ok) return { ok: false, error: `telegram_${resp.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
