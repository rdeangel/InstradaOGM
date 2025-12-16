import { NextResponse } from 'next/server';
import { authenticateAndTrackRequest } from '@/lib/auth-middleware';
import { prisma } from '@/lib/prisma';
import { Role } from '@/types/opnsense'; // Import Role enum
import { Prisma } from '@prisma/client'; // Import Prisma client types
import { logger } from '@/lib/logger';

export async function GET(request: Request) { // Accept Request object to get search params
    return authenticateAndTrackRequest(request, async (auth) => {
        logger.debug(`Auth in audit logs API for user ID: ${auth.user?.id}.`); // Add logging for the session

        // Check if the user is authenticated and has the ADMIN or SUPER_ADMIN role
        if (!auth.user || (auth.user.role !== Role.ADMIN && auth.user.role !== Role.SUPER_ADMIN)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        try {
            const { searchParams } = new URL(request.url);
            const search = searchParams.get('search') || ''; // Unified search
            const userSearch = searchParams.get('user') || ''; // Keep for backward compatibility
            const actionSearch = searchParams.get('action') || ''; // Keep for backward compatibility
            const detailsSearch = searchParams.get('details') || ''; // Keep for backward compatibility
            const detailsOnlySearch = searchParams.get('detailsOnly') || ''; // New: dedicated details search
            const detailsFieldFilter = searchParams.get('detailsField') || 'all'; // New: field-specific filter
            const excludeAttempts = searchParams.get('excludeAttempts') === 'true'; // New: exclude ATTEMPT actions
            const startDate = searchParams.get('startDate');
            const endDate = searchParams.get('endDate');
            const page = parseInt(searchParams.get('page') || '1', 10);
            const pageSize = parseInt(searchParams.get('pageSize') || '10', 10);

            // DEBUG LOGGING
            logger.debug('Audit Logs Search Parameters:', {
                search,
                detailsOnlySearch,
                detailsFieldFilter,
                userSearch,
                actionSearch,
                detailsSearch,
                page,
                pageSize,
            });

            // Build the where clause based on search parameters
            const whereConditions: Prisma.AuditLogWhereInput[] = [];

            // Parse search with OR support using pipe operator
            const parseSearchWithOR = (searchString: string): string[][] => {
                // Split by | to get OR groups
                const orGroups = searchString.split('|').map(s => s.trim()).filter(s => s.length > 0);

                // For each OR group, parse quoted phrases and words
                return orGroups.map(group => {
                    const terms: string[] = [];
                    const regex = /"([^"]+)"|(\S+)/g;
                    let match;
                    while ((match = regex.exec(group)) !== null) {
                        terms.push(match[1] || match[2]);
                    }
                    return terms;
                });
            };

            // Handle unified search or legacy separate searches
            if (search.trim()) {
                // For unified search, we fetch ALL logs and filter in memory
                // This is because PostgreSQL JSONB string_contains is unreliable for details
                // The in-memory filter will handle action, user, and details searching
                logger.debug(`Unified search active: "${search.trim()}" - will filter in memory`);
                // Don't add any search conditions - fetch all logs for in-memory filtering
            } else {
                // Legacy separate search fields for backward compatibility
                if (userSearch) {
                    whereConditions.push({
                        user: {
                            OR: [
                                { name: { contains: userSearch } },
                                { email: { contains: userSearch } },
                            ],
                        },
                    });
                }

                if (actionSearch) {
                    whereConditions.push({
                        action: {
                            contains: actionSearch,
                        },
                    });
                }
            }

            // Add date filtering conditions
            if (startDate) {
                try {
                    const start = new Date(startDate);
                    if (!isNaN(start.getTime())) {
                        whereConditions.push({
                            timestamp: {
                                gte: start,
                            },
                        });
                    } else {
                        logger.warn("Invalid startDate provided:", startDate);
                    }
                } catch (e) {
                    logger.error("Error parsing startDate:", e);
                }
            }

            if (endDate) {
                try {
                    const end = new Date(endDate);
                    if (!isNaN(end.getTime())) {
                        // If end date is at start of day (00:00:00), set it to end of day (23:59:59)
                        if (end.getHours() === 0 && end.getMinutes() === 0 && end.getSeconds() === 0 && end.getMilliseconds() === 0) {
                            end.setHours(23, 59, 59, 999);
                        }
                        whereConditions.push({
                            timestamp: {
                                lte: end,
                            },
                        });
                    } else {
                        logger.warn("Invalid endDate provided:", endDate);
                    }
                } catch (e) {
                    logger.error("Error parsing endDate:", e);
                }
            }


            const whereClause: Prisma.AuditLogWhereInput = whereConditions.length > 0 ? { AND: whereConditions } : {};

            // IMPORTANT: Fetch ALL logs without pagination first, since we need to filter in memory
            // We'll apply pagination AFTER filtering to ensure correct results
            let auditLogs = await prisma.auditLog.findMany({
                where: whereClause, // Apply the constructed where clause for user, action, and date
                orderBy: {
                    timestamp: 'desc', // Order by timestamp, newest first
                },
                include: { // Include related user data
                    user: {
                        select: {
                            name: true,
                            email: true,
                        },
                    },
                },
                // NOTE: No skip/take here - we fetch all and paginate after filtering
            });

            logger.debug(`Fetched ${auditLogs.length} logs from database before filtering`);

            // Apply OR logic filtering if we have unified search
            if (search.trim()) {
                const orGroups = parseSearchWithOR(search.trim());

                auditLogs = auditLogs.filter(log => {
                    // Log matches if ANY OR group matches
                    return orGroups.some((andTerms: string[]) => {
                        // Within each OR group, ALL terms must match (AND logic)
                        return andTerms.every((term: string) => {
                            const termLower = term.toLowerCase();

                            // Check action (word boundary)
                            const actionWords = log.action.toLowerCase().split(/[_\\s]+/);
                            if (actionWords.includes(termLower)) return true;

                            // Safety: "assign" doesn't match "unassign"
                            if (termLower === 'assign' && log.action.toLowerCase().includes('unassign')) {
                                return false;
                            }

                            // Check user fields
                            const userName = log.user?.name?.toLowerCase() || '';
                            const userEmail = log.user?.email?.toLowerCase() || '';
                            if (userName.includes(termLower) || userEmail.includes(termLower)) return true;

                            // Check details JSON
                            if (log.details) {
                                const detailsString = JSON.stringify(log.details).toLowerCase();
                                if (detailsString.includes(termLower)) return true;
                            }

                            return false;
                        });
                    });
                });

                logger.debug(`After OR logic search filter: ${auditLogs.length} logs remaining`);
            }

            // Legacy client-side filtering for detailsSearch (backward compatibility)
            if (detailsSearch && !search.trim()) {
                const lowerCaseDetailsSearch = detailsSearch.toLowerCase();
                logger.debug(`Applying legacy detailsSearch filter: "${lowerCaseDetailsSearch}"`);

                auditLogs = auditLogs.filter(log => {
                    if (log.details === null || log.details === undefined) {
                        return false;
                    }
                    // Convert the details JSON object to a string for searching
                    const detailsString = JSON.stringify(log.details).toLowerCase();
                    return detailsString.includes(lowerCaseDetailsSearch);
                });

                logger.debug(`After legacy detailsSearch filter: ${auditLogs.length} logs remaining`);
            }

            // NEW: Dedicated details-only search with field-specific filtering
            // This works independently OR in combination with the main search
            if (detailsOnlySearch) {
                const lowerCaseDetailsOnlySearch = detailsOnlySearch.toLowerCase();
                logger.debug(`Applying detailsOnlySearch filter: "${lowerCaseDetailsOnlySearch}" with field filter: "${detailsFieldFilter}"`);
                logger.debug(`Logs before detailsOnlySearch filter: ${auditLogs.length}`);

                auditLogs = auditLogs.filter(log => {
                    if (log.details === null || log.details === undefined) {
                        logger.debug(`Log ${log.id} has no details, skipping`);
                        return false;
                    }

                    const details = log.details as Record<string, unknown>;

                    // DEBUG: Log the details type and sample
                    if (auditLogs.indexOf(log) === 0) {
                        logger.debug(`Sample details object type: ${typeof log.details}`);
                        logger.debug(`Sample details JSON: ${JSON.stringify(details).substring(0, 200)}`);
                    }

                    // Helper function to search in nested objects
                    const searchInValue = (value: unknown): boolean => {
                        if (typeof value === 'string') {
                            return value.toLowerCase().includes(lowerCaseDetailsOnlySearch);
                        } else if (typeof value === 'object' && value !== null) {
                            return JSON.stringify(value).toLowerCase().includes(lowerCaseDetailsOnlySearch);
                        }
                        return false;
                    };

                    // Field-specific filtering
                    let matches = false;
                    if (detailsFieldFilter === 'all') {
                        // Search entire details JSON
                        const detailsString = JSON.stringify(details).toLowerCase();
                        matches = detailsString.includes(lowerCaseDetailsOnlySearch);
                    } else if (detailsFieldFilter === 'groupName') {
                        // Search in groupName and groupFriendlyName
                        matches = searchInValue(details.groupName) || searchInValue(details.groupFriendlyName);
                    } else if (detailsFieldFilter === 'ipAddress') {
                        // Search in ipAddress field
                        matches = searchInValue(details.ipAddress);
                    } else if (detailsFieldFilter === 'hostAlias') {
                        // Search in hostAliasName and hostAlias fields
                        matches = searchInValue(details.hostAliasName) || searchInValue(details.hostAlias);
                    } else if (detailsFieldFilter === 'authMethod') {
                        // Search in authMethod field
                        matches = searchInValue(details.authMethod);
                    } else if (detailsFieldFilter === 'targetGroup') {
                        // Search in targetGroup field (nested object)
                        matches = searchInValue(details.targetGroup);
                    } else if (detailsFieldFilter === 'operationType') {
                        // Search in operationType field
                        matches = searchInValue(details.operationType);
                    }

                    return matches;
                });

                logger.debug(`After detailsOnlySearch filter: ${auditLogs.length} logs remaining`);
            }

            // Filter out ATTEMPT actions if requested
            if (excludeAttempts) {
                auditLogs = auditLogs.filter(log => !log.action.includes('_ATTEMPT'));
                logger.debug(`After excludeAttempts filter: ${auditLogs.length} logs remaining`);
            }

            // IMPORTANT: Calculate total count AFTER all filtering
            const totalCount = auditLogs.length;
            logger.debug(`Total filtered results: ${totalCount}`);

            // Apply pagination AFTER filtering
            const skip = (page - 1) * pageSize;
            const paginatedLogs = auditLogs.slice(skip, skip + pageSize);
            logger.debug(`Returning page ${page} with ${paginatedLogs.length} logs (skipped ${skip}, showing ${skip + 1}-${skip + paginatedLogs.length} of ${totalCount} total)`);

            // Add matched fields information to each log entry for highlighting
            const enrichedLogs = paginatedLogs.map(log => {
                const matchedFields: string[] = [];

                if ((search.trim() || detailsOnlySearch) && log.details && typeof log.details === 'object') {
                    const searchTerm = (search.trim() || detailsOnlySearch).toLowerCase();
                    const details = log.details as Record<string, unknown>;

                    // Check which fields matched
                    const fieldsToCheck = [
                        { key: 'groupName', label: 'Group Name' },
                        { key: 'groupFriendlyName', label: 'Group Friendly Name' },
                        { key: 'ipAddress', label: 'IP Address' },
                        { key: 'hostAliasName', label: 'Host Alias Name' },
                        { key: 'hostAlias', label: 'Host Alias' },
                        { key: 'authMethod', label: 'Auth Method' },
                        { key: 'operationType', label: 'Operation Type' },
                        { key: 'targetGroup', label: 'Target Group' },
                        { key: 'description', label: 'Description' },
                        { key: 'reason', label: 'Reason' },
                    ];

                    fieldsToCheck.forEach(({ key, label }) => {
                        // Field is from controlled fieldsToCheck array
                        // eslint-disable-next-line security/detect-object-injection
                        const value = details[key];
                        if (value) {
                            const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
                            if (valueStr.toLowerCase().includes(searchTerm)) {
                                matchedFields.push(label);
                            }
                        }
                    });
                }

                return {
                    ...log,
                    matchedFields: matchedFields.length > 0 ? matchedFields : undefined,
                };
            });

            // Return the paginated, filtered, and enriched audit logs along with the total count
            return NextResponse.json({ auditLogs: enrichedLogs, totalCount });
        } catch (error: unknown) { // Explicitly type error as any for now to access message property
            logger.error("Error fetching audit logs:", error);
            // Return the error message in the response for debugging
            return NextResponse.json({ error: (error as Error).message || 'Failed to fetch audit logs' }, { status: 500 });
        }
    });
}