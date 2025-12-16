'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React from 'react';
import {
  BarChart as RechartsBarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface DataPoint {
  [key: string]: any;
}

interface BarConfig {
  key: string;
  name: string;
  color: string;
  yAxisId?: string;
}

interface YAxisConfig {
  id: string;
  orientation: 'left' | 'right';
  color?: string;
  label?: string;
}

interface MultiAxisBarChartProps {
  data: DataPoint[];
  title?: string;
  description?: string;
  xAxisKey: string;
  bars: BarConfig[];
  yAxes: YAxisConfig[];
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  formatTooltip?: (value: any, name: string) => [string, string];
  formatXAxis?: (value: any) => string;
  formatYAxis?: (value: any) => string;
}

export function MultiAxisBarChart({
  data,
  title,
  description,
  xAxisKey,
  bars,
  yAxes,
  height = 300,
  showGrid = true,
  showLegend = true,
  formatTooltip,
  formatXAxis,
  formatYAxis,
}: MultiAxisBarChartProps) {
  // Handle empty data
  if (!data || data.length === 0) {
    return (
      <Card>
        {(title || description) && (
          <CardHeader>
            {title && <CardTitle className="text-lg">{title}</CardTitle>}
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
        )}
        <CardContent>
          <div className="flex items-center justify-center" style={{ height }}>
            <div className="text-center text-gray-500">
              <p className="text-sm">No data available</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Sanitize data to handle NaN, null, undefined values
  const sanitizedData = data.map(item => {
    const newItem = { ...item };
    bars.forEach(bar => {
      const value = newItem[bar.key];
      // Convert NaN, null, undefined to 0
      if (value === null || value === undefined || Number.isNaN(Number(value))) {
        newItem[bar.key] = 0;
      } else {
        // Ensure it's a valid number
        newItem[bar.key] = Number(value) || 0;
      }
    });
    return newItem;
  });

  // Filter out bars that have all zero values
  const activeBars = bars.filter(bar => {
    return sanitizedData.some(item => item[bar.key] > 0);
  });

  // If no bars have data, show empty state
  if (activeBars.length === 0) {
    return (
      <Card>
        {(title || description) && (
          <CardHeader>
            {title && <CardTitle className="text-lg">{title}</CardTitle>}
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
        )}
        <CardContent>
          <div className="flex items-center justify-center" style={{ height }}>
            <div className="text-center text-gray-500">
              <p className="text-sm">No data to display</p>
              <p className="text-xs text-muted-foreground mt-1">All values are zero</p>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      {(title || description) && (
        <CardHeader>
          {title && <CardTitle className="text-lg">{title}</CardTitle>}
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
      )}
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          {(() => {
            try {
              return (
                <RechartsBarChart
                  data={sanitizedData}
                  margin={{ top: 20, right: 30, left: 20, bottom: 20 }}
                  barCategoryGap="20%"
                  barGap={4}
                >
            {showGrid && <CartesianGrid strokeDasharray="3 3" className="opacity-30" />}
            <XAxis
              dataKey={xAxisKey}
              tickFormatter={formatXAxis}
              className="text-xs"
            />
            {yAxes.map((yAxis) => (
              <YAxis
                key={yAxis.id}
                yAxisId={yAxis.id}
                orientation={yAxis.orientation}
                tickFormatter={formatYAxis}
                className="text-xs"
                stroke={yAxis.color}
              />
            ))}
            <Tooltip
              formatter={formatTooltip}
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
                color: 'hsl(var(--popover-foreground))',
                fontSize: '14px',
                boxShadow: 'hsl(var(--shadow)) 0px 4px 6px -1px, hsl(var(--shadow)) 0px 2px 4px -1px',
                zIndex: 1000,
              }}
              labelStyle={{
                color: 'hsl(var(--popover-foreground))',
                fontSize: '14px',
                fontWeight: '500',
              }}
              itemStyle={{
                color: 'hsl(var(--popover-foreground))',
              }}
              wrapperStyle={{
                outline: 'none',
                zIndex: 1000,
              }}
            />
            {showLegend && <Legend />}
            {activeBars.map((bar) => (
              <Bar
                key={bar.key}
                dataKey={bar.key}
                fill={bar.color}
                name={bar.name}
                yAxisId={bar.yAxisId || yAxes[0]?.id}
                radius={[2, 2, 0, 0]}
                maxBarSize={60}
              />
                ))}
                </RechartsBarChart>
              );
            } catch (error) {
              return (
                <div className="flex items-center justify-center" style={{ height }}>
                  <div className="text-center text-gray-500">
                    <p className="text-sm">Chart rendering error</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.message : String(error)) : 'Please try refreshing'}
                    </p>
                  </div>
                </div>
              );
            }
          })()}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
