import { createHmac, timingSafeEqual } from "node:crypto";

const TELEGRAM_INIT_DATA_MAX_AGE_SECONDS = 15 * 60;

export function isAuthorizedTelegramWebApp(
  initData: string | undefined,
  botToken: string | undefined,
  allowedChatIds: string | undefined,
): boolean {
  if (!initData || initData.length > 8192 || !botToken || !allowedChatIds) return false;

  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  const userValue = params.get("user");
  const authDateValue = params.get("auth_date");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash) || !userValue || !authDateValue) return false;

  const authDate = Number(authDateValue);
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(authDate) || authDate > now + 60 || now - authDate > TELEGRAM_INIT_DATA_MAX_AGE_SECONDS) {
    return false;
  }

  let userId: number;
  try {
    const user = JSON.parse(userValue);
    userId = user.id;
  } catch {
    return false;
  }
  if (!Number.isSafeInteger(userId) || userId <= 0) return false;

  const allowedIds = allowedChatIds.split(",").map((id) => id.trim()).filter(Boolean);
  if (!allowedIds.includes(String(userId))) return false;

  const dataCheckString = Array.from(params.entries())
    .filter(([key]) => key !== "hash")
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secretKey = createHmac("sha256", "WebAppData").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest();
  const providedHash = Buffer.from(hash, "hex");
  return providedHash.length === expectedHash.length && timingSafeEqual(providedHash, expectedHash);
}
