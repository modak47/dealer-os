import type { Page } from "@playwright/test";

export const sampleVehicle = { registration: "GY26ABC", make: "Honda", model: "CB500F", year: "2021", derivative: "Sport", engineCapacity: "500", fuelType: "Petrol", colour: "Black" };
export const sampleCondition = { mileage: "12000", registeredKeeper: "yes", overallCondition: "Good", serviceHistory: "Part history", running: "yes", writtenOff: "no", outstandingFinance: "no", mechanicalFaults: "no", cosmeticDamage: "no" };

export async function isolateMotorGeeksApis(page: Page, step = 1, filled = false) {
  let revision = 0;
  const state = {
    lookupFails: false, contactFails: false, submitFails: false, lookupWait: null as Promise<void> | null,
    submitted: null as Record<string, unknown> | null,
    saves: [] as Record<string, unknown>[],
    photos: [] as { id: string; original_filename: string; preview_url: string }[],
    seed: { current_step: step, registration: filled ? "GY26ABC" : "", vehicle_snapshot: filled ? sampleVehicle : {}, condition_snapshot: filled ? sampleCondition : {}, seller_snapshot: {} },
  };
  // Every write is intercepted, including on the production host. These tests
  // cannot insert leads, call vehicle providers, upload files or send emails.
  await page.route("**/api/**", async route => {
    const request = route.request(), path = new URL(request.url()).pathname;
    if (path === "/api/valuation/draft") {
      if (request.method() === "GET") return route.fulfill({ json: { draft: { revision, ...state.seed } } });
      state.saves.push(request.postDataJSON());
      return route.fulfill({ json: { draft: { revision: ++revision } } });
    }
    if (path === "/api/valuation/lookup") {
      if (state.lookupWait) await state.lookupWait;
      return state.lookupFails
      ? route.fulfill({ status: 404, json: { error: "We could not find that registration. You can enter the motorcycle manually.", code: "not_found" } })
      : route.fulfill({ json: { vehicle: sampleVehicle, version: ++revision, lookupStatus: "found" } });
    }
    if (path === "/api/valuation/submit") {
      state.submitted = request.postDataJSON();
      return state.submitFails
        ? route.fulfill({ status: 503, json: { error: "We could not send your details. Please try again." } })
        : route.fulfill({ json: { reference: "MG-VISUAL-TEST", emailStatus: "accepted" } });
    }
    if (path === "/api/valuation/photos" || path === "/api/seller/photos") {
      if (request.method() === "POST") state.photos.push({ id: "visual-photo", original_filename: "bike.png", preview_url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=" });
      if (request.method() === "DELETE") state.photos = [];
      return route.fulfill({ json: { photos: state.photos, editable: true } });
    }
    if (path === "/api/dealer-access") return state.contactFails
      ? route.fulfill({ status: 503, json: { error: "We could not send your message. Please try again." } })
      : route.fulfill({ json: { ok: true } });
    if (path === "/api/seller/recover") return route.fulfill({ json: { message: "If we have a matching profile, we will email you a new sign-in link." } });
    throw new Error(`Unexpected API operation: ${request.method()} ${path}`);
  });
  return state;
}
