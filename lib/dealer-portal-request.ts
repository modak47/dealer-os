// Keep connection failures and non-JSON hosting errors in the same recoverable
// path as API errors, so callers always release their loading/saving state.
export async function dealerPortalRequest(input: string, init?: RequestInit): Promise<Response> {
  try {
    const response = await fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20_000) });
    const payload = await response.json();
    return Response.json(payload, { status: response.status });
  } catch {
    return Response.json({ error: "Unable to connect to the dealer portal. Please try again." }, { status: 503 });
  }
}
