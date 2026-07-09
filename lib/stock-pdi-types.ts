export type PdiResult = "pass" | "fail" | "na";

export interface PdiChecklistItem {
  id: string;
  section: string;
  label: string;
  checked: boolean;
  result: PdiResult;
  notes: string;
}

export interface PdiFormPayload {
  checklist: PdiChecklistItem[];
  technicianName: string;
  signatureDataUrl: string;
}

export const defaultPdiChecklist: PdiChecklistItem[] = [
  ["Identity", "VIN / frame number checked"],
  ["Identity", "Registration number checked"],
  ["Identity", "Keys and documents checked"],
  ["Safety", "Front brake operation"],
  ["Safety", "Rear brake operation"],
  ["Safety", "Tyres condition and pressure"],
  ["Safety", "Steering and head bearings"],
  ["Safety", "Suspension operation"],
  ["Controls", "Throttle operation"],
  ["Controls", "Clutch / drive operation"],
  ["Controls", "Levers, pedals and switches"],
  ["Electrical", "Headlight / tail light / brake light"],
  ["Electrical", "Indicators and horn"],
  ["Electrical", "Battery charge / starting"],
  ["Engine", "Oil / coolant / fluid levels"],
  ["Engine", "Leaks checked"],
  ["Engine", "Road test where appropriate"],
  ["Preparation", "Workshop notes completed"],
  ["Preparation", "Valet condition checked"],
  ["Preparation", "Final quality check"],
].map(([section, label], index) => ({ id: `pdi-${index + 1}`, section, label, checked: false, result: "pass", notes: "" }));
