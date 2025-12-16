'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */

import React from 'react';
import {
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface DataPoint {
  name: string;
  value: number;
  [key: string]: string | number;
}

interface PieChartProps {
  data: DataPoint[];
  title?: string;
  description?: string;
  colors?: string[];
  height?: number;
  showLegend?: boolean;
  innerRadius?: number;
  outerRadius?: number;
  formatTooltip?: (value: any, name: string) => [string, string];
  renderCustomLabel?: (entry: any) => string;
}

const DEFAULT_COLORS = [
  '#8884d8',
  '#82ca9d',
  '#ffc658',
  '#ff7300',
  '#00ff00',
  '#ff00ff',
  '#00ffff',
  '#ff0000',
];

export function PieChart({
  data,
  title,
  description,
  colors = DEFAULT_COLORS,
  height = 300,
  showLegend = true,
  innerRadius = 0,
  outerRadius = 80,
  formatTooltip,
  renderCustomLabel,
}: PieChartProps) {
  // Check if data is empty or all values are 0
  const hasData = data && data.length > 0 && data.some(item => item.value > 0);
  const totalValue = data.reduce((sum, item) => sum + item.value, 0);

  const renderLabel = (entry: any) => {
    if (renderCustomLabel) {
      return renderCustomLabel(entry);
    }
    const percent = ((entry.value / totalValue) * 100).toFixed(1);
    return `${percent}%`;
  };

  // Handle empty data
  if (!hasData) {
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
          <RechartsPieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderLabel}
              outerRadius={outerRadius}
              innerRadius={innerRadius}
              fill="#8884d8"
              dataKey="value"
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={formatTooltip || ((value: any, name: any) => [value.toLocaleString(), String(name)])}
              contentStyle={{
                backgroundColor: 'hsl(var(--popover))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '6px',
                color: 'hsl(var(--popover-foreground))',
                fontSize: '14px',
                boxShadow: 'hsl(var(--shadow)) 0px 4px 6px -1px, hsl(var(--shadow)) 0px 2px 4px -1px',
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
                zIndex: 50,
              }}
            />
            {showLegend && <Legend />}
          </RechartsPieChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
