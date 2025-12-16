'use client';

import React from 'react';
import { PieChart as RechartsPieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip as RechartsTooltip } from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface EndpointData {
  name: string;
  fullEndpoint: string;
  value: number;
}

interface EndpointsPieChartProps {
  data: EndpointData[];
  title?: string;
  description?: string;
  height?: number;
}

const COLORS = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
  '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#6366f1'
];

// Custom legend component with tooltips
const CustomLegend = ({ payload }: { payload?: Array<{ color: string; value: string; payload: EndpointData }> }) => {
  if (!payload) return null;

  return (
    <TooltipProvider>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-2 mt-4">
        {payload.map((entry, index: number) => {
          const isNameTruncated = entry.payload?.fullEndpoint && entry.payload.fullEndpoint !== entry.value;
          
          return (
            <div key={index} className="flex items-center gap-1 text-xs">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              {isNameTruncated ? (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help">
                      {entry.value}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="max-w-xs break-all">{entry.payload.fullEndpoint}</p>
                  </TooltipContent>
                </Tooltip>
              ) : (
                <span>{entry.value}</span>
              )}
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
};

export function EndpointsPieChart({ 
  data, 
  title = "Endpoint Usage Distribution", 
  description = "Request distribution across top endpoints",
  height = 400 
}: EndpointsPieChartProps) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
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
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <div style={{ height }}>
          <ResponsiveContainer width="100%" height="100%">
            <RechartsPieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                labelLine={false}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
                label={({ percent }) => `${(percent * 100).toFixed(1)}%`}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (!active || !payload || payload.length === 0) return null;
                  
                  const data = payload[0].payload;
                  const fullEndpoint = data.fullEndpoint || data.name;
                  
                  return (
                    <div
                      style={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '6px',
                        color: 'hsl(var(--popover-foreground))',
                        fontSize: '14px',
                        padding: '8px 12px',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                      }}
                    >
                      <div style={{ 
                        fontWeight: '500',
                        marginBottom: '4px',
                        wordBreak: 'break-all'
                      }}>
                        {fullEndpoint}
                      </div>
                      <div>
                        <span style={{ color: payload[0].color }}>●</span>{' '}
                        Requests: {Number(payload[0].value).toLocaleString()}
                      </div>
                    </div>
                  );
                }}
              />
              <Legend content={<CustomLegend />} />
            </RechartsPieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
