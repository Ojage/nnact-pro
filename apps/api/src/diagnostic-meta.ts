// Canonical authoring vocabulary for the Diagnostic Library. Kept server-side
// so a single source of truth drives both API validation and the meta endpoint
// that powers the authoring UI's pickers and step templates.

export interface MetaOption {
  value: string;
  label: string;
}

export interface StepTemplate {
  key: string;
  name: string;
  description: string;
  stepType: "check" | "decision" | "reference" | "stop";
  mode: "field" | "guided" | "both";
  meterMode?: string;
  powerState?: string;
  operatingCondition?: string;
  point1Label?: string;
  point2Label?: string;
  connector?: string;
  pin?: string;
  unit?: string;
  expectedText?: string;
  passInterpretation?: string;
  failInterpretation?: string;
  accessibilityNote?: string;
}

export const CUSTOM_VALUE = "__custom__";

export const PRODUCT_TYPES: MetaOption[] = [
  { value: "refrigerator", label: "Refrigerator" },
  { value: "freezer", label: "Freezer" },
  { value: "wine_cooler", label: "Wine cooler" },
  { value: "ice_maker", label: "Ice maker" },
  { value: "washer", label: "Washer" },
  { value: "dryer", label: "Dryer" },
  { value: "dishwasher", label: "Dishwasher" },
  { value: "range", label: "Range" },
  { value: "oven", label: "Oven" },
  { value: "cooktop", label: "Cooktop" },
  { value: "microwave", label: "Microwave" },
  { value: "venting_hood", label: "Venting hood" },
  { value: "trash_compactor", label: "Trash compactor" },
  { value: "room_ac", label: "Room air conditioner" },
  { value: "heat_pump", label: "Heat pump" },
  { value: "furnace", label: "Furnace" },
  { value: "boiler", label: "Boiler" },
  { value: "water_heater", label: "Water heater" },
  { value: "dehumidifier", label: "Dehumidifier" },
  { value: "water_softener", label: "Water softener" },
];

export const ROUTE_KINDS: MetaOption[] = [
  { value: "source_path", label: "Source path (line/neutral supply)" },
  { value: "load_path", label: "Load path (through the component)" },
  { value: "ground_path", label: "Ground / chassis return" },
  { value: "neutral_path", label: "Neutral return" },
  { value: "control_path", label: "Control / switch path" },
  { value: "sensor_path", label: "Sensor signal path" },
  { value: "communication_path", label: "Communication / data path" },
  { value: "safety_path", label: "Safety / interlock path" },
];

export const METER_MODES: MetaOption[] = [
  { value: "ac_voltage", label: "AC voltage (VAC)" },
  { value: "dc_voltage", label: "DC voltage (VDC)" },
  { value: "resistance", label: "Resistance (Ω)" },
  { value: "continuity", label: "Continuity (buzzer)" },
  { value: "current_clamp", label: "Current clamp (A)" },
  { value: "capacitance", label: "Capacitance (µF)" },
  { value: "temperature", label: "Temperature (°C/°F)" },
  { value: "pressure", label: "Pressure (PSI/kPa)" },
  { value: "vacuum", label: "Vacuum (inHg)" },
  { value: "rpm", label: "RPM" },
  { value: "refrigerant_charge", label: "Refrigerant charge" },
  { value: "gas_leak", label: "Gas / refrigerant leak detector" },
  { value: "power_watts", label: "Power (W)" },
  { value: "sound_db", label: "Sound level (dB)" },
];

export const POWER_STATES: MetaOption[] = [
  { value: "unplugged", label: "Unplugged / unit isolated" },
  { value: "breaker_off", label: "Supply isolated — breaker off" },
  { value: "energized_idle", label: "Line powered — standby / idle" },
  { value: "energized_operating", label: "Line powered — operating cycle" },
  { value: "test_mode", label: "Test / diagnostic mode" },
];

export const OPERATING_CONDITIONS: MetaOption[] = [
  { value: "cold_start", label: "Cold start" },
  { value: "after_30min_runtime", label: "After ~30 min runtime" },
  { value: "compressor_running", label: "Compressor running" },
  { value: "compressor_off", label: "Compressor off" },
  { value: "defrost_active", label: "Defrost active" },
  { value: "heating_active", label: "Heating active" },
  { value: "cooling_active", label: "Cooling active" },
  { value: "water_fill_active", label: "Water fill active" },
  { value: "drain_active", label: "Drain active" },
  { value: "spin_active", label: "Spin active" },
  { value: "door_closed", label: "Door closed" },
  { value: "door_open", label: "Door open" },
  { value: "no_load", label: "No load" },
  { value: "fully_loaded", label: "Fully loaded" },
];

export const UNITS: MetaOption[] = [
  { value: "vac", label: "VAC" },
  { value: "vdc", label: "VDC" },
  { value: "ohm", label: "Ω" },
  { value: "kohm", label: "kΩ" },
  { value: "mohm", label: "MΩ" },
  { value: "uf", label: "µF" },
  { value: "amp", label: "A" },
  { value: "milliamp", label: "mA" },
  { value: "celsius", label: "°C" },
  { value: "fahrenheit", label: "°F" },
  { value: "psi", label: "PSI" },
  { value: "kpa", label: "kPa" },
  { value: "inhg", label: "inHg" },
  { value: "rpm", label: "RPM" },
  { value: "watts", label: "W" },
  { value: "db", label: "dB" },
  { value: "rh", label: "% RH" },
  { value: "hz", label: "Hz" },
];

export const STEP_TEMPLATES: StepTemplate[] = [
  {
    key: "outlet_voltage",
    name: "Supply voltage at outlet",
    description: "Verify line voltage is present and within tolerance.",
    stepType: "check",
    mode: "both",
    meterMode: "ac_voltage",
    powerState: "energized_idle",
    operatingCondition: "cold_start",
    point1Label: "Line terminal",
    point2Label: "Neutral terminal",
    unit: "vac",
    expectedText: "120 VAC within ±10%",
    passInterpretation: "Supply present; continue to component checks.",
    failInterpretation: "No/low supply — check breaker, cord, and outlet.",
  },
  {
    key: "element_resistance",
    name: "Heating element resistance",
    description: "Measure the heating element as a load path.",
    stepType: "check",
    mode: "both",
    meterMode: "resistance",
    powerState: "unplugged",
    operatingCondition: "cold_start",
    point1Label: "Element terminal 1",
    point2Label: "Element terminal 2",
    unit: "ohm",
    expectedText: "Within schematic tolerance (e.g. 10–15 Ω)",
    passInterpretation: "Element intact.",
    failInterpretation: "Open or shorted element — replace.",
  },
  {
    key: "door_switch_continuity",
    name: "Door / interlock switch continuity",
    description: "Confirm the safety interlock closes when the door is shut.",
    stepType: "check",
    mode: "both",
    meterMode: "continuity",
    powerState: "unplugged",
    operatingCondition: "door_closed",
    point1Label: "Switch terminal",
    point2Label: "Switch terminal",
    unit: "ohm",
    expectedText: "Near 0 Ω when closed",
    passInterpretation: "Interlock circuit intact.",
    failInterpretation: "Open interlock — replace switch.",
  },
  {
    key: "capacitor_microfarads",
    name: "Capacitor capacitance",
    description: "Verify a run/start capacitor is within tolerance.",
    stepType: "check",
    mode: "field",
    meterMode: "capacitance",
    powerState: "unplugged",
    operatingCondition: "cold_start",
    point1Label: "Capacitor terminal",
    point2Label: "Capacitor terminal",
    unit: "uf",
    expectedText: "Within ±10% of rated µF",
    passInterpretation: "Capacitor healthy.",
    failInterpretation: "Out of range — replace,",
  },
  {
    key: "compressor_running_current",
    name: "Compressor running amperage",
    description: "Verify the compressor draws rated running current.",
    stepType: "check",
    mode: "guided",
    meterMode: "current_clamp",
    powerState: "energized_operating",
    operatingCondition: "compressor_running",
    point1Label: "Compressor line lead",
    point2Label: "—",
    unit: "amp",
    expectedText: "Near nameplate running amps",
    passInterpretation: "Compressor load is normal.",
    failInterpretation: "Over/under current — suspect start, run, or mechanical fault.",
  },
  {
    key: "drain_pump_continuity",
    name: "Drain pump continuity",
    description: "Check the drain pump windings for continuity.",
    stepType: "check",
    mode: "both",
    meterMode: "resistance",
    powerState: "unplugged",
    operatingCondition: "cold_start",
    point1Label: "Pump lead",
    point2Label: "Pump lead",
    unit: "ohm",
    expectedText: "Windings within schematic tolerance",
    passInterpretation: "Pump winding intact.",
    failInterpretation: "Open winding — replace pump.",
  },
  {
    key: "defrost_heater_resistance",
    name: "Defrost heater resistance",
    description: "Verify the defrost heater is not open.",
    stepType: "check",
    mode: "both",
    meterMode: "resistance",
    powerState: "unplugged",
    operatingCondition: "cold_start",
    point1Label: "Heater terminal",
    point2Label: "Heater terminal",
    unit: "ohm",
    expectedText: "Near schematic resistance",
    passInterpretation: "Heater intact.",
    failInterpretation: "Open heater — replace.",
  },
  {
    key: "reference_fault_code",
    name: "Reference: recorded fault code",
    description: "Record the machine's fault code for context.",
    stepType: "reference",
    mode: "guided",
  },
  {
    key: "stop_safety_escalate",
    name: "Stop: safety-critical fault",
    description: "Stop the workflow and escalate a safety hazard.",
    stepType: "stop",
    mode: "both",
    accessibilityNote: "Never bypass a safety interlock.",
  },
];

export function metaOptionLabel(options: MetaOption[], value: string | null | undefined): string | null {
  if (!value) return null;
  return options.find((option) => option.value === value)?.label ?? null;
}

export function resolveCustom<T extends { value: string; label: string }>(
  options: T[],
  value: string | undefined,
  customLabel: string | undefined,
): { value: string; label?: string } | null {
  if (value === CUSTOM_VALUE) {
    if (!customLabel?.trim()) return null;
    return { value: customLabel.trim() };
  }
  if (!value) return null;
  const known = options.find((option) => option.value === value);
  if (known) return { value: known.value, label: known.label };
  return null;
}