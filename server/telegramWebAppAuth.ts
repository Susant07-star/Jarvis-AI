import { createHmac, timingSafeEqual } from "node:crypto";

const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 15 * 60;

export type TelegramWebAppAuthFailureReason =
  | "missing_init_data"
  | "missing_bot_token"
  | "missing_chat_allowlist"
  | "malformed_init_data"
  | "invalid_auth_date"
  | "expired_init_data"
  | "invalid_user"
  | "user_not_allowed"
  | "invalid_signature";

export function getTelegramWebAppAuthFailureReason(
  initData: string | undefined,
  botToken: string | undefined,
  allowedChatIds: string | undefined,
): TelegramWebAppAuthFailureReason | null {
  if (!initData) return "missing_init_data";
  if (!botToken) return "missing_bot_token";
  if (!allowedChatIds?.trim()) return "missing_chat_allowlist";
  if (initData.length > 8192) return "malformed_init_data";

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const userValue = params.get("user");
  const authDateValue = params.get("auth_date");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash) || !userValue || !authDateValue) {
    return "malformed_init_data";
  }

  const authDate = Number(authDateValue);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(authDate) || authDate > now + 60) return "invalid_auth_date";
  if (now - authDate > TELEGRAM_INIT_DATA_MAX_AGE_SECONDS) return "expired_init_data";

  let userId: number;
  try {
    const user = JSON.parse(userValue);
    userId = user.id;
  } catch {
    return "invalid_user";
  }
  if (!Number.isSafeInteger(userId) || userId <= 0) return "invalid_user";

  const allowedIds = allowedChatIds.split(",").map((id) => id.trim()).filter(Boolean);
  if (!allowedIds.includes(String(userId))) return "user_not_allowed";

  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const providedHash = Buffer.from(hash, "hex");
  return providedHash.length === expectedHash.length && timingSafeEqual(providedHash, expectedHash)
    ? null
    : "invalid_signature";
}
