
// This component uses bracket notation with typed keys from table data. All uses are safe.
import * as React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

export interface Column<T> {
  key: string; // Changed to string to allow for nested keys like "_count.users"
  label: string;
  sortable?: boolean;
  render?: (item: T) => React.ReactNode;
  headerClassName?: string;
  sortValue?: (item: T) => string | number | Date; // For extracting a value to sort by
  compareFn?: (a: T, b: T) => number; // For custom comparison logic
}

interface SortableTableProps<T> extends React.HTMLAttributes<HTMLDivElement> {
  data: T[];
  columns: Column<T>[];
  sortBy: string | undefined; // Changed to be a controlled prop
  sortDirection: "asc" | "desc"; // Changed to be a controlled prop
  recordCount?: number;
  onSortChange: (sortBy: string, sortDirection: "asc" | "desc") => void; // Changed to be required
}

import { sortData, getNestedValue } from "@/lib/table-utils";

export function SortableTable<T>({
  data,
  columns,
  sortBy,
  sortDirection,
  recordCount,
  onSortChange,
  className,
  ...props // Keep other props
}: SortableTableProps<T>) {
  const handleSort = (key: string) => { // Changed to string
    const newSortDirection =
      sortBy === key && sortDirection === "asc" ? "desc" : "asc";
    onSortChange(key, newSortDirection);
  };

  const sortedData = React.useMemo(() => {
    return sortData(data, sortBy, sortDirection, columns);
  }, [data, sortBy, sortDirection, columns]);

  return (
    <div className={cn("w-full", className)} {...props}> {/* Revert to original props name */}
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((column) => (
              <TableHead key={String(column.key)} className={column.headerClassName}>
                {column.sortable ? (
                  <button
                    className="flex items-center gap-1"
                    onClick={() => handleSort(column.key)}
                  >
                    {column.label}
                    {sortBy === column.key ? (
                      sortDirection === "asc" ? (
                        <ArrowUp className="ml-2 h-4 w-4" />
                      ) : (
                        <ArrowDown className="ml-2 h-4 w-4" />
                      )
                    ) : (
                      <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground opacity-50" />
                    )}
                  </button>
                ) : (
                  column.label
                )}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedData.length === 0 ? (
            <TableRow>
              <TableCell colSpan={columns.length} className="h-24 text-center">
                No results.
              </TableCell>
            </TableRow>
          ) : (
            sortedData.map((item, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell key={column.key}>
                    {column.render ? column.render(item) : String(getNestedValue(item, column.key))}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
      {recordCount !== undefined && (
        <div className="mt-4 text-sm text-muted-foreground">
          Showing {sortedData.length} of {recordCount} records.
        </div>
      )}
    </div>
  );
}