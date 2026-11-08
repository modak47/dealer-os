export const dealerPasswordPath = "/dealer-portal/reset-password";

export function dealerAuthError(error: unknown, fallback: string) {
  const details = error as { message?: string; status?: number; name?: string } | null;
  if (!details?.message || details.message === "{}" || details.status === 0 || Number(details.status) >= 500 || details.name === "TypeError") return fallback;
  return details.message;
}

export function safeAuthNext(value: string | null, fallback = "/admin/dashboard") {
  if (!value || !value.startsWith("/") || /[\\\r\n]|%2f|%5c|%2e/i.test(value)) return fallback;
  const url = new URL(value, "https://auth.local");
  if (url.origin !== "https://auth.local") return fallback;
  return ["/admin", "/dealer-portal"].some(root => url.pathname === root || url.pathname.startsWith(`${root}/`))
    ? `${url.pathname}${url.search}${url.hash}` : fallback;
}

export function dealerInvitationRedirect(requestUrl: string) {
  return new URL(dealerPasswordPath, requestUrl).toString();
}
