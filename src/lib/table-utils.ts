/* eslint-disable security/detect-object-injection */
export interface Column<T> {
    key: string;
    label: string;
    sortable?: boolean;
    render?: (item: T) => React.ReactNode;
    headerClassName?: string;
    sortValue?: (item: T) => string | number | Date;
    compareFn?: (a: T, b: T) => number;
}

// Helper to get nested property value
export const getNestedValue = (obj: unknown, path: string): unknown => {
    return path.split('.').reduce((acc: unknown, part: string) => {
        if (acc && typeof acc === 'object' && acc !== null) {
            return (acc as Record<string, unknown>)[part];
        }
        return undefined;
    }, obj);
};

export function sortData<T>(
    data: T[],
    sortBy: string | undefined,
    sortDirection: "asc" | "desc",
    columns: Column<T>[]
): T[] {
    if (!sortBy) {
        return data;
    }

    return [...data].sort((a, b) => {
        const column = columns.find(col => col.key === sortBy);

        if (column?.compareFn) {
            return sortDirection === "asc" ? column.compareFn(a, b) : column.compareFn(b, a);
        }

        let aValue: unknown;
        let bValue: unknown;

        if (column?.sortValue) {
            aValue = column.sortValue(a);
            bValue = column.sortValue(b);
        } else {
            aValue = getNestedValue(a, String(sortBy));
            bValue = getNestedValue(b, String(sortBy));
        }

        // Handle undefined/null values for sorting
        if (aValue === undefined || aValue === null) return sortDirection === "asc" ? -1 : 1;
        if (bValue === undefined || bValue === null) return sortDirection === "asc" ? 1 : -1;

        if (typeof aValue === "string" && typeof bValue === "string") {
            return sortDirection === "asc"
                ? aValue.localeCompare(bValue)
                : bValue.localeCompare(aValue);
        }

        if (typeof aValue === "number" && typeof bValue === "number") {
            return sortDirection === "asc" ? aValue - bValue : bValue - aValue;
        }

        // Fallback for other types or if values are not comparable
        return 0;
    });
}
