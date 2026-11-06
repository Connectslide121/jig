// Shared sample data for the catalogue's stories (invented, seeded).
import { company, daysFromNow, people, seeded } from "@/kit/data";

const r = seeded(4);
export const team = people(r, 5);
export const orders = Array.from({ length: 28 }, (_, i) => ({
  id: `SO-${1040 + i}`,
  customer: company(r),
  owner: r.pick(team).name,
  placed: daysFromNow(-r.int(0, 20)),
  total: r.int(40, 900) * 10,
  status: r.weighted([
    ["paid", 5],
    ["pending", 2],
    ["overdue", 1],
  ] as const),
}));
export type Order = (typeof orders)[number];
export const weeks = Array.from({ length: 12 }, (_, i) => ({ week: `W${i + 1}`, revenue: 40 + r.int(0, 30) + i * 3, costs: 30 + r.int(0, 15) }));
