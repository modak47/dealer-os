export type PdiResult = "pass" | "fail" | "na";

export const pdiSections = ["RAMP DOWN [1]", "RAMP UP", "RAMP DOWN [2]", "ROAD TEST & FINAL CHECKS"] as const;
export type PdiSection = typeof pdiSections[number];

export interface PdiChecklistItem {
  id: string;
  section: PdiSection;
  number: number;
  label: string;
  checked: boolean;
  result: PdiResult;
  notes: string;
}

export interface PdiFormPayload {
  checklist: PdiChecklistItem[];
  technicianName: string;
  signatureDataUrl: string;
  customerName?: string;
  customerSignatureDataUrl?: string;
  completionConfirmed?: boolean;
}

const item = (section: PdiSection, number: number, label: string): PdiChecklistItem => ({
  id: `${section.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${number}-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 18)}`,
  section,
  number,
  label,
  checked: false,
  result: "pass",
  notes: "",
});

export const defaultPdiChecklist: PdiChecklistItem[] = [
  item("RAMP DOWN [1]", 1, "Check battery terminals are connected/tight"),
  item("RAMP DOWN [1]", 2, "Fit, adjust & tighten mirrors"),
  item("RAMP DOWN [1]", 3, "Check/adjust throttle & clutch cable"),
  item("RAMP DOWN [1]", 4, "Check routing of cables & wiring"),
  item("RAMP DOWN [1]", 5, "Check brake fluid levels"),

  item("RAMP UP", 1, "Check & clean front & rear brake discs"),
  item("RAMP UP", 2, "Check fitment of all brake pads"),
  item("RAMP UP", 3, "Check caliper mount bolts (TTS)"),
  item("RAMP UP", 4, "Visual check of tyres & wheels"),
  item("RAMP UP", 5, "Check tyre pressures"),
  item("RAMP UP", 6, "Check front & rear wheel bearings"),
  item("RAMP UP", 7, "Check/adjust steering head bearings"),
  item("RAMP UP", 8, "Check front axle (TTS)"),
  item("RAMP UP", 9, "Check drive chain tension & alignment"),
  item("RAMP UP", 10, "Check swingarm bearings"),
  item("RAMP UP", 11, "Check rear axle (TTS)"),
  item("RAMP UP", 12, "Check oil level"),
  item("RAMP UP", 13, "Lubricate pivot points"),
  item("RAMP UP", 13, "Fit registration plate"),

  item("RAMP DOWN [2]", 1, "Check fuel cap operation"),
  item("RAMP DOWN [2]", 2, "Ignition on - check fuel pump priming/leaks"),
  item("RAMP DOWN [2]", 3, "Start bike & run up to temperature"),
  item("RAMP DOWN [2]", 4, "Check all lights & switches"),
  item("RAMP DOWN [2]", 5, "Check kill switch operation"),
  item("RAMP DOWN [2]", 6, "Idle check - move steering lock to lock"),
  item("RAMP DOWN [2]", 7, "Check battery & charging system"),
  item("RAMP DOWN [2]", 8, "Check side stand cut out switch operation"),
  item("RAMP DOWN [2]", 9, "Check/adjust headlamp aim/height"),
  item("RAMP DOWN [2]", 10, "Check steering lock and ignition switch"),
  item("RAMP DOWN [2]", 11, "Switch off bike and re-check oil level"),

  item("ROAD TEST & FINAL CHECKS", 1, "Check acceleration/deceleration"),
  item("ROAD TEST & FINAL CHECKS", 2, "Check smooth & effective braking"),
  item("ROAD TEST & FINAL CHECKS", 3, "Check steering & suspension"),
  item("ROAD TEST & FINAL CHECKS", 4, "Check no engine noises or rattles"),
  item("ROAD TEST & FINAL CHECKS", 5, "Check easy hot restart & smooth idling"),
  item("ROAD TEST & FINAL CHECKS", 6, "Re-check oil level & visual check for leaks"),
  item("ROAD TEST & FINAL CHECKS", 7, "Re-check final drive tension & alignment"),
];
