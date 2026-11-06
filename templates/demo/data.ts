import { company, daysFromNow, people, seeded } from "@/kit";

// Seeded sample data: the same on every load, dates relative to today, invented names only.
const r = seeded(1);
export const owners = people(r, 6);
export const items = Array.from({ length: 24 }, (_, i) => ({
  id: `IT-${100 + i}`,
  name: company(r),
  owner: r.pick(owners).name,
  updated: daysFromNow(-r.int(0, 14)),
  status: r.weighted([
    ["active", 5],
    ["paused", 2],
    ["closed", 1],
  ] as const),
}));
export type Item = (typeof items)[number];
