import { KpiStrip } from "@/blocks";
import { Page } from "@/kit";
import { items } from "../data";

export function Home() {
  const active = items.filter((i) => i.status === "active").length;
  return (
    <Page title="Home" description="Replace with the screen the scenario opens on.">
      <div data-demo="kpis">
        <KpiStrip
          items={[
            { label: "Active", value: String(active), delta: { value: "+2", direction: "up", good: true, against: "vs last week" } },
            { label: "All items", value: String(items.length) },
          ]}
        />
      </div>
    </Page>
  );
}
