export const visualTestHeader = "x-dealeros-visual-test";
export const defaultVisualTestSecret = "dealeros-visual-dev";

export function isVisualTestMode() {
  return process.env.NODE_ENV !== "production" && process.env.DEALEROS_VISUAL_TEST_MODE === "1";
}

export function getVisualTestSecret() {
  return process.env.DEALEROS_VISUAL_TEST_SECRET || defaultVisualTestSecret;
}

export function isVisualTestRequest(headers: Headers) {
  return isVisualTestMode() && headers.get(visualTestHeader) === getVisualTestSecret();
}
