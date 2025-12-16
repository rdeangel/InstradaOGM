'use client';

import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export interface PaginationControlsProps {
    currentPage: number;
    totalPages: number;
    totalCount: number;
    filteredCount: number;
    pageSize: number | 'ALL';
    onPageChange: (page: number) => void;
    onPageSizeChange: (pageSize: number | 'ALL') => void;
    isLoading?: boolean;
    className?: string;
    isLoadMoreMode?: boolean;
    pageSizeOptions?: number[];
    showAllOption?: boolean;
}

const DEFAULT_PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export function PaginationControls({
    currentPage,
    totalPages,
    totalCount,
    filteredCount,
    pageSize,
    onPageChange,
    onPageSizeChange,
    isLoading = false,
    className = '',
    isLoadMoreMode = false,
    pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
    showAllOption = false,
}: PaginationControlsProps) {
    const handlePageSizeChange = (value: string) => {
        const newPageSize = value === 'ALL' ? 'ALL' : parseInt(value);
        onPageSizeChange(newPageSize);
        // Reset to page 1 when changing page size
        if (currentPage > 1) {
            onPageChange(1);
        }
    };

    const handlePreviousPage = () => {
        if (currentPage > 1) {
            onPageChange(currentPage - 1);
        }
    };

    const handleNextPage = () => {
        if (currentPage < totalPages) {
            onPageChange(currentPage + 1);
        }
    };

    // Don't show pagination if there's no data
    if (totalCount === 0) {
        return null;
    }

    let startIndex = 0;
    let endIndex = 0;

    if (pageSize === 'ALL') {
        startIndex = 1;
        endIndex = filteredCount;
    } else {
        startIndex = (currentPage - 1) * pageSize + 1;
        endIndex = Math.min(currentPage * pageSize, filteredCount);
    }

    const isFiltered = filteredCount !== totalCount;

    // Load More Mode (Phone)
    if (isLoadMoreMode) {
        // Calculate how many items are currently displayed
        const displayedCount = pageSize === 'ALL' ? filteredCount : Math.min(currentPage * (pageSize as number), filteredCount);
        const hasMorePages = currentPage < totalPages;
        const showLoadDropdown = filteredCount >= 5; // Only show dropdown if there are 5+ items

        return (
            <div className={`space-y-3 ${className}`}>
                {/* Results count - Full Width */}
                <div className="text-center text-sm text-muted-foreground">
                    {isFiltered ? (
                        <>Showing {displayedCount} of {filteredCount} filtered results (from {totalCount} total)</>
                    ) : (
                        <>Showing {displayedCount} of {totalCount} results</>
                    )}
                </div>

                {/* Load More Button and Load Dropdown on same line */}
                {(hasMorePages || showLoadDropdown) && (
                    <div className="flex items-center gap-2">
                        {/* Load More Button */}
                        {hasMorePages && (
                            <Button
                                variant="outline"
                                size="default"
                                className="flex-1"
                                onClick={handleNextPage}
                                disabled={isLoading}
                            >
                                {isLoading ? (
                                    <>
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        Loading more...
                                    </>
                                ) : (
                                    'Load More'
                                )}
                            </Button>
                        )}

                        {/* Load # Dropdown - only show if 5+ items, always on the right */}
                        {showLoadDropdown && (
                            <Select
                                value={pageSize.toString()}
                                onValueChange={handlePageSizeChange}
                                disabled={isLoading}
                            >
                                <SelectTrigger className={`h-10 w-20 ${!hasMorePages ? 'ml-auto' : ''}`}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {pageSizeOptions.map((size) => (
                                        <SelectItem key={size} value={size.toString()}>
                                            {size}
                                        </SelectItem>
                                    ))}
                                    {showAllOption && (
                                        <SelectItem value="ALL">ALL</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                )}
            </div>
        );
    }

    return (
        <>
            {/* Desktop Layout - Hidden on mobile */}
            <div className={`hidden sm:flex items-center justify-between ${className}`}>
                {/* Left: Results count */}
                <div className="text-sm text-muted-foreground">
                    {isFiltered ? (
                        <>Showing {startIndex} to {endIndex} of {filteredCount} filtered results (from {totalCount} total)</>
                    ) : (
                        <>Showing {startIndex} to {endIndex} of {totalCount} results</>
                    )}
                </div>

                {/* Center: Navigation - Only show if multiple pages */}
                {totalPages > 1 ? (
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePreviousPage}
                            disabled={currentPage === 1 || isLoading}
                        >
                            Previous
                        </Button>
                        <span className="text-sm px-3">
                            Page {currentPage} of {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleNextPage}
                            disabled={currentPage === totalPages || isLoading}
                        >
                            Next
                        </Button>
                    </div>
                ) : (
                    <div></div> // Empty div to maintain layout
                )}

                {/* Right: Entries per page - Always show */}
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span>Entries per page:</span>
                    <Select
                        value={pageSize.toString()}
                        onValueChange={handlePageSizeChange}
                        disabled={isLoading}
                    >
                        <SelectTrigger className="w-16 h-8">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {pageSizeOptions.map((size) => (
                                <SelectItem key={size} value={size.toString()}>
                                    {size}
                                </SelectItem>
                            ))}
                            {showAllOption && (
                                <SelectItem value="ALL">ALL</SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Mobile Layout - Hidden on desktop */}
            <div className={`sm:hidden space-y-3 ${className}`}>
                {/* Results count - Full Width */}
                <div className="text-center text-sm text-muted-foreground">
                    {isFiltered ? (
                        <>Showing {startIndex} to {endIndex} of {filteredCount} filtered results (from {totalCount} total)</>
                    ) : (
                        <>Showing {startIndex} to {endIndex} of {totalCount} results</>
                    )}
                </div>

                {/* Navigation Controls - Centered - Only show if multiple pages */}
                {totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handlePreviousPage}
                            disabled={currentPage === 1 || isLoading}
                        >
                            Previous
                        </Button>
                        <span className="text-sm px-2">
                            Page {currentPage} of {totalPages}
                        </span>
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleNextPage}
                            disabled={currentPage === totalPages || isLoading}
                        >
                            Next
                        </Button>
                    </div>
                )}

                {/* Page Size Dropdown - Centered - Always show */}
                <div className="flex items-center justify-center gap-2">
                    <span className="text-sm text-muted-foreground">Entries per page:</span>
                    <Select
                        value={pageSize.toString()}
                        onValueChange={handlePageSizeChange}
                        disabled={isLoading}
                    >
                        <SelectTrigger className="w-16 h-8">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {pageSizeOptions.map((size) => (
                                <SelectItem key={size} value={size.toString()}>
                                    {size}
                                </SelectItem>
                            ))}
                            {showAllOption && (
                                <SelectItem value="ALL">ALL</SelectItem>
                            )}
                        </SelectContent>
                    </Select>
                </div>
            </div>
        </>
    );
}
