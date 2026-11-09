import generatedPlan from "./pavilion13.generated.json";
import type { PavilionPlan } from "./data";

/** Equal presentation modules in local schematic units, independent of metres. */
export const PAVILION_13_PLAN = generatedPlan as PavilionPlan;
export const PAVILION_13_MODULE_SIZE = { width: 112, height: 30 } as const;

/** Documentary aggregate blocks expanded into separate, equal visual modules. */
export const PAVILION_13_SPLIT_GROUPS = [
  ["01", "02", "03", "04"],
  ["10", "11", "12", "13", "14"],
  ["15", "16", "17", "18"],
  ["30", "31", "32", "33", "34", "35"],
  ["63", "64", "65", "66"],
  ["67", "68", "69", "70"],
] as const;
