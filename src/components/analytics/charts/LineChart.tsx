'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React from 'react';
import {
  LineChart as RechartsLineChart,
  Line,
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

interface LineChartProps {
  data: DataPoint[];
  title?: string;
  description?: string;
  xAxisKey: string;
  lines: {
    key: string;
    name: string;
    color: string;
    strokeWidth?: number;
  }[];
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  formatTooltip?: (value: any, name: string) => [string, string];
  formatXAxis?: (value: any) => string;
  formatYAxis?: (value: any) => string;
}

export function LineChart({
  data,
  title,
  description,
  xAxisKey,
  lines,
  height = 300,
  showGrid = true,
  showLegend = true,
  formatTooltip,
  formatXAxis,
  formatYAxis,
}: LineChartProps) {
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
          <RechartsLineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
            {showGrid && <CartesianGrid strokeDasharray="3 3" className="opacity-30" />}
            <XAxis
              dataKey={xAxisKey}
              tickFormatter={formatXAxis}
              className="text-xs"
            />
            <YAxis
              tickFormatter={formatYAxis}
              className="text-xs"
            />
            <Tooltip
              formatter={formatTooltip}
              labelFormatter={formatXAxis}
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
            {lines.map((line) => (
              <Line
                key={line.key}
                type="monotone"
                dataKey={line.key}
                stroke={line.color}
                strokeWidth={line.strokeWidth || 2}
                name={line.name}
                dot={{ r: 4 }}
                activeDot={{ r: 6 }}
              />
            ))}
          </RechartsLineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
