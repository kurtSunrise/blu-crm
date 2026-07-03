"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatAudCompactFromCents, formatAudFromCents } from "@/lib/format";

export interface TrendChartPoint {
  createdCents: number;
  createdCount: number;
  label: string;
  wonCents: number;
  wonCount: number;
}

const chartConfig = {
  createdCents: { color: "var(--chart-1)", label: "New pipeline" },
  wonCents: { color: "var(--chart-2)", label: "Won" },
} satisfies ChartConfig;

// Value of deals added vs won per week/month. Both series are AUD, so they
// share the one axis; counts ride along in the tooltip.
export function TrendChart({ data }: { data: TrendChartPoint[] }) {
  return (
    <ChartContainer
      aria-label="Line chart of new pipeline value versus won value over time"
      className="max-h-72 w-full"
      config={chartConfig}
      role="img"
    >
      <LineChart accessibilityLayer data={data} margin={{ left: 4, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          axisLine={false}
          dataKey="label"
          minTickGap={24}
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
              formatter={(value, name, item) => {
                const point = item.payload as TrendChartPoint;
                const dealCount =
                  name === "createdCents" ? point.createdCount : point.wonCount;
                return (
                  <>
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                      style={{ backgroundColor: item.color }}
                    />
                    <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                      <span className="text-muted-foreground">
                        {chartConfig[name as keyof typeof chartConfig].label}
                      </span>
                      <span className="font-medium text-foreground tabular-nums">
                        {formatAudFromCents(Number(value))} · {dealCount} deal
                        {dealCount === 1 ? "" : "s"}
                      </span>
                    </div>
                  </>
                );
              }}
            />
          }
          cursor={false}
        />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
          dataKey="createdCents"
          dot={false}
          stroke="var(--color-createdCents)"
          strokeWidth={2}
          type="monotone"
        />
        <Line
          activeDot={{ r: 4, stroke: "var(--card)", strokeWidth: 2 }}
          dataKey="wonCents"
          dot={false}
          stroke="var(--color-wonCents)"
          strokeWidth={2}
          type="monotone"
        />
      </LineChart>
    </ChartContainer>
  );
}
