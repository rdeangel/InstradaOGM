// src/instrumentation.ts
// This file is automatically called by Next.js when the server starts
// See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
    // Only run on the server, not in the edge runtime
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        // Fire-and-forget: Initialize services in background
        // Don't await - let Next.js continue starting up
        import('@/lib/server/app-initializer')
            .then(({ initializeApp }) => {
                return initializeApp();
            })
            .then(() => {
                console.log('[INSTRUMENTATION] Background services initialization completed');
            })
            .catch((error) => {
                console.error('[INSTRUMENTATION] Failed to initialize services:', error);
                console.error('[INSTRUMENTATION] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
            });
    }
}
