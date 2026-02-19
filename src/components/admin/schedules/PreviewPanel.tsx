'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { Loader2, Play, Clock } from 'lucide-react';

interface BoundaryFiring {
  windowLabel: string;
  boundaryType: string;
  actions: Array<{
    operation: string;
    targetGroupUuid?: string;
    targetGroupName?: string;
    fromGroupUuid?: string;
    fromGroupName?: string;
  }>;
}

interface PreviewResult {
  simulatedAt: string;
  resolvedTargets: string[];
  boundariesFiring: BoundaryFiring[];
}

interface PreviewPanelProps {
  getFormData: () => unknown;
}

export function PreviewPanel({ getFormData }: PreviewPanelProps) {
  const [previewDate, setPreviewDate] = useState<Date | undefined>(new Date());
  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview() {
    if (!previewDate) return;
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = getFormData();
      const res = await fetch(
        `/api/admin/schedules/preview?at=${encodeURIComponent(previewDate.toISOString())}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData),
        },
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? 'Preview failed');
      }

      const data: PreviewResult = await res.json();
      setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label className="text-sm font-medium mb-1 block">Simulation Time</label>
          <DateTimePicker date={previewDate} setDate={setPreviewDate} disabled={isLoading} />
        </div>
        <Button
          type="button"
          onClick={handlePreview}
          disabled={!previewDate || isLoading}
          className="shrink-0"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Play className="h-4 w-4 mr-2" />
          )}
          Preview
        </Button>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      {result && (
        <div className="space-y-4">
          {/* Resolved targets */}
          <div>
            <p className="text-sm font-medium mb-1">Resolved Targets</p>
            {result.resolvedTargets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No targets resolved (HOST_ALIAS and NETWORK_GROUP require live OPNsense data).
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                {result.resolvedTargets.join(', ')}
              </p>
            )}
          </div>

          {/* Boundaries firing */}
          <div>
            <p className="text-sm font-medium mb-2">
              Boundaries Firing at {new Date(result.simulatedAt).toLocaleString()}
            </p>
            {result.boundariesFiring.length === 0 ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4 border border-dashed rounded-md justify-center">
                <Clock className="h-4 w-4" />
                No boundaries fire at this time.
              </div>
            ) : (
              <div className="space-y-3">
                {result.boundariesFiring.map((boundary, i) => (
                  <div key={i} className="border rounded-md p-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{boundary.windowLabel}</span>
                      <Badge variant="outline" className="text-xs">
                        {boundary.boundaryType}
                      </Badge>
                    </div>
                    {boundary.actions.length > 0 && (
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-muted-foreground">
                            <th className="text-left pb-1 font-medium">Operation</th>
                            <th className="text-left pb-1 font-medium">Target Group</th>
                            <th className="text-left pb-1 font-medium">From Group</th>
                          </tr>
                        </thead>
                        <tbody>
                          {boundary.actions.map((action, ai) => (
                            <tr key={ai}>
                              <td className="py-0.5">{action.operation}</td>
                              <td className="py-0.5">{action.targetGroupName ?? action.targetGroupUuid ?? '—'}</td>
                              <td className="py-0.5">{action.fromGroupName ?? action.fromGroupUuid ?? '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
