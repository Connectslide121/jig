import { useSyncExternalStore } from "react";
import { type Person, company, daysFromNow, people, scenarioTime, seeded, today } from "@/kit";
import type { Tone } from "@/blocks";

export type JobStatus = "new" | "scheduled" | "in-progress" | "waiting" | "done";
export type Priority = "urgent" | "high" | "normal" | "low";

export interface Job {
  id: string;
  title: string;
  customer: string;
  site: string;
  kind: string;
  status: JobStatus;
  priority: Priority;
  technician?: string;
  start?: Date;
  end?: Date;
  due: Date;
  value: number;
}

export const STATUS: Record<JobStatus, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "info" },
  scheduled: { label: "Scheduled", tone: "primary" },
  "in-progress": { label: "In progress", tone: "warning" },
  waiting: { label: "Waiting for parts", tone: "neutral" },
  done: { label: "Done", tone: "success" },
};

export const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  urgent: { label: "Urgent", tone: "danger" },
  high: { label: "High", tone: "warning" },
  normal: { label: "Normal", tone: "neutral" },
  low: { label: "Low", tone: "neutral" },
};

const KINDS = [
  ["Boiler service", "Heating"],
  ["Radiator leak", "Heating"],
  ["Heat pump fault", "Heating"],
  ["AC unit not cooling", "Cooling"],
  ["Ventilation filter swap", "Cooling"],
  ["Lift stuck between floors", "Lifts"],
  ["Lift door sensor", "Lifts"],
  ["Annual lift inspection", "Lifts"],
  ["Fuse board upgrade", "Electrical"],
  ["Emergency lighting test", "Electrical"],
  ["Socket replacement", "Electrical"],
  ["Thermostat calibration", "Heating"],
] as const;
const STREETS = ["Harbour Road", "Mill Lane", "Station Street", "Elm Park", "Quay Side", "Market Square", "Hill View", "Canal Walk"];

const r = seeded(28);
export const technicians: (Person & { skill: string })[] = people(r, 7).map((p, i) => ({
  ...p,
  skill: ["Heating", "Lifts", "Electrical", "Cooling", "Heating", "Lifts", "Electrical"][i] as string,
}));
/** The scenario's moment: the dispatcher's first coffee. */
export const NOW = scenarioTime(7, 40);
export const me = { name: "Selma Andersen", role: "Dispatcher" };

function makeJobs(): Job[] {
  const jobs: Job[] = [];
  // Today's schedule: two or three jobs per technician, between 07:00 and 17:00.
  for (const t of technicians) {
    let hour = 7 + r.int(0, 1);
    const count = r.int(2, 3);
    for (let i = 0; i < count && hour < 16; i++) {
      const length = r.pick([1, 1.5, 2, 2.5, 3]);
      const [title, kind] = r.pick(KINDS.filter(([, k]) => k === t.skill || r.chance(0.2)));
      const start = daysFromNow(0, Math.floor(hour), (hour % 1) * 60);
      const end = new Date(start.getTime() + length * 3_600_000);
      const status: JobStatus = end <= NOW ? "done" : start <= NOW ? "in-progress" : "scheduled";
      jobs.push({
        id: "",
        title,
        kind,
        customer: company(r),
        site: `${r.int(2, 140)} ${r.pick(STREETS)}`,
        status,
        priority: r.weighted([["urgent", 1], ["high", 3], ["normal", 8], ["low", 2]] as const),
        technician: t.id,
        start,
        end,
        due: start,
        value: r.int(9, 60) * 10,
      });
      hour += length + r.pick([0, 0.5, 1]);
    }
  }
  // The rest of the fortnight: unscheduled, waiting and done jobs.
  for (let i = 0; i < 34; i++) {
    const [title, kind] = r.pick(KINDS);
    const offset = r.int(-9, 9);
    const status: JobStatus = offset < -1 ? r.weighted([["done", 6], ["waiting", 2]] as const) : r.weighted([["new", 4], ["scheduled", 3], ["waiting", 1]] as const);
    jobs.push({
      id: "",
      title,
      kind,
      customer: company(r),
      site: `${r.int(2, 140)} ${r.pick(STREETS)}`,
      status,
      priority: r.weighted([["urgent", 1], ["high", 3], ["normal", 8], ["low", 3]] as const),
      technician: status === "new" ? undefined : r.pick(technicians).id,
      due: daysFromNow(offset, r.int(8, 16)),
      value: r.int(9, 90) * 10,
    });
  }
  // The call the story starts from: a lift stuck since 07:10, not yet assigned.
  jobs.push({
    id: "",
    title: "Lift stuck between floors",
    kind: "Lifts",
    customer: "Northgate Housing",
    site: "18 Canal Walk",
    status: "new",
    priority: "urgent",
    due: daysFromNow(0, 9),
    value: 640,
  });
  jobs.sort((a, b) => a.due.getTime() - b.due.getTime());
  return jobs.map((j, i) => ({ ...j, id: `J-${String(2140 + i)}` }));
}

// A tiny store, so a job created on one screen shows on the others.
let jobs = makeJobs();
const listeners = new Set<() => void>();
const emit = () => {
  for (const l of listeners) l();
};
export const store = {
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => listeners.delete(l);
  },
  get: () => jobs,
  update: (id: string, patch: Partial<Job>) => {
    jobs = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
    emit();
  },
  add: (job: Omit<Job, "id">) => {
    const id = `J-${2140 + jobs.length}`;
    jobs = [{ ...job, id }, ...jobs];
    emit();
    return id;
  },
};
export const useJobs = () => useSyncExternalStore(store.subscribe, store.get);

export const urgentJob = () => jobs.find((j) => j.title === "Lift stuck between floors" && j.status === "new" && j.customer === "Northgate Housing");
export const techName = (id?: string) => technicians.find((t) => t.id === id)?.name ?? "Unassigned";
export const isLate = (j: Job) => j.status !== "done" && j.due.getTime() < today().getTime();

/** Jobs completed per day, the last 14 days (seeded, with the real ones on top). */
export const completedTrend = (() => {
  const t = seeded(7);
  return Array.from({ length: 14 }, (_, i) => {
    const d = daysFromNow(i - 13);
    const weekend = d.getDay() === 0 || d.getDay() === 6;
    return { day: d.toLocaleDateString(undefined, { day: "numeric", month: "short" }), completed: weekend ? t.int(0, 3) : t.int(11, 22), planned: weekend ? 2 : t.int(14, 20) };
  });
})();
