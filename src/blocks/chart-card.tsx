import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface ChartSeries {
  key: string;
  label: string;
  /** A chart colour token: 1–5 (var(--chart-n)). */
  color: 1 | 2 | 3 | 4 | 5;
}

/**
 * A chart in a card: area (trends) or bar (comparisons), from the kit's chart colours. The plot has
 * a fixed height, so loading, empty and filled take the same space.
 */
export function ChartCard({
  title,
  description,
  data,
  x,
  series,
  kind = "area",
  stacked,
  loading,
  action,
  format = (v) => String(v),
  className,
  demo,
}: {
  title: string;
  description?: string;
  data: Record<string, string | number>[];
  x: string;
  series: ChartSeries[];
  kind?: "area" | "bar";
  stacked?: boolean;
  loading?: boolean;
  action?: React.ReactNode;
  format?: (v: number) => string;
  className?: string;
  demo?: string;
}) {
  const config = Object.fromEntries(series.map((s) => [s.key, { label: s.label, color: `var(--chart-${s.color})` }])) as ChartConfig;
  return (
    <Card className={cn("gap-4 shadow-card", className)} data-demo={demo}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {action && <CardAction>{action}</CardAction>}
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : data.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-lg border border-dashed text-sm text-muted-foreground">No data for this period</div>
        ) : (
          <ChartContainer config={config} className="aspect-auto h-64 w-full">
            {kind === "area" ? (
              <AreaChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
                <defs>
                  {series.map((s) => (
                    <linearGradient key={s.key} id={`fill-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={`var(--color-${s.key})`} stopOpacity={0.28} />
                      <stop offset="95%" stopColor={`var(--color-${s.key})`} stopOpacity={0.02} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid vertical={false} />
                <XAxis dataKey={x} tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => format(Number(v))} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="line" />} />
                {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
                {series.map((s) => (
                  <Area
                    key={s.key}
                    dataKey={s.key}
                    type="monotone"
                    stroke={`var(--color-${s.key})`}
                    fill={`url(#fill-${s.key})`}
                    strokeWidth={2}
                    stackId={stacked ? "a" : undefined}
                    isAnimationActive={false}
                  />
                ))}
              </AreaChart>
            ) : (
              <BarChart data={data} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid vertical={false} />
                <XAxis dataKey={x} tickLine={false} axisLine={false} tickMargin={8} minTickGap={12} />
                <YAxis tickLine={false} axisLine={false} width={44} tickFormatter={(v) => format(Number(v))} />
                <ChartTooltip cursor={false} content={<ChartTooltipContent />} />
                {series.length > 1 && <ChartLegend content={<ChartLegendContent />} />}
                {series.map((s, i) => (
                  <Bar
                    key={s.key}
                    dataKey={s.key}
                    fill={`var(--color-${s.key})`}
                    radius={stacked && i < series.length - 1 ? 0 : [4, 4, 0, 0]}
                    stackId={stacked ? "a" : undefined}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            )}
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
