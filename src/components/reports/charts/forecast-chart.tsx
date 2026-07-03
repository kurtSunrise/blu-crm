"use client";

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatAudCompactFromCents, formatAudFromCents } from "@/lib/format";

export interface ForecastChartPoint {
  count: number;
  label: string;
  totalCents: number;
  weightedCents: number;
}

// Single series (no legend — the heading names it): weighted open-pipeline
// value by expected close month. Unweighted total and deal count ride along
// in the tooltip.
const chartConfig = {
  weightedCents: { color: "var(--chart-1)", label: "Weighted value" },
} satisfies ChartConfig;

export function ForecastChart({ data }: { data: ForecastChartPoint[] }) {
  return (
    <ChartContainer
      aria-label="Bar chart of weighted pipeline value by expected close month"
      className="max-h-72 w-full"
      config={chartConfig}
      role="img"
    >
      <BarChart accessibilityLayer data={data} margin={{ left: 4, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="label"
          minTickGap={16}
          tickLine={false}
          tickMargin={8}
        />
        <YAxis
          axisLine={false}
          tickFormatter={(value: number) => formatAudCompactFromCents(value)}
          tickLine={false}
          width={52}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => {
                const point = item.payload as ForecastChartPoint;
                return (
                  <div className="flex flex-1 flex-col gap-1 leading-none">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Weighted</span>
                      <span className="font-medium text-foreground tabular-nums">
                        {formatAudFromCents(Number(value))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-medium text-foreground tabular-nums">
                        {formatAudFromCents(point.totalCents)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-muted-foreground">Deals</span>
                      <span className="font-medium text-foreground tabular-nums">
                        {point.count}
                      </span>
                    </div>
                  </div>
                );
              }}
            />
          }
        />
        <Bar
          dataKey="weightedCents"
          fill="var(--color-weightedCents)"
          maxBarSize={24}
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ChartContainer>
  );
}
