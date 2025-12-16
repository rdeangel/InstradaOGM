#!/usr/bin/env tsx

/**
 * CLI script for managing API key usage aggregation
 * 
 * Usage:
 *   npm run usage-aggregation run           # Run aggregation once
 *   npm run usage-aggregation start         # Start background service
 *   npm run usage-aggregation status        # Show aggregation status
 *   npm run usage-aggregation cleanup       # Clean up old events
 *   npm run usage-aggregation stats         # Show aggregation statistics
 */

import { usageAggregationService } from '../src/lib/usage-aggregation-service';
import { logger } from '../src/lib/logger';

async function main() {
  const command = process.argv[2];
  
  switch (command) {
    case 'run':
      await runOnce();
      break;
    case 'start':
      await startService();
      break;
    case 'status':
      await showStatus();
      break;
    case 'cleanup':
      await cleanup();
      break;
    case 'stats':
      await showStats();
      break;
    case 'help':
    default:
      showHelp();
      break;
  }
}

async function runOnce() {
  try {
    console.log('Running usage aggregation once...');
    const result = await usageAggregationService.runAggregation();
    
    console.log('Aggregation completed:');
    console.log(`  - Processed API keys: ${result.processedApiKeys}`);
    console.log(`  - Processed dates: ${result.processedDates}`);
    console.log(`  - Errors: ${result.errors}`);
    console.log(`  - Duration: ${result.duration}ms`);
    
    process.exit(0);
  } catch (error) {
    console.error('Aggregation failed:', error);
    process.exit(1);
  }
}

async function startService() {
  try {
    const intervalMinutes = parseInt(process.argv[3]) || 60;
    
    console.log(`Starting usage aggregation service with ${intervalMinutes} minute interval...`);
    console.log('Press Ctrl+C to stop');
    
    usageAggregationService.start(intervalMinutes);
    
    // Handle graceful shutdown
    process.on('SIGINT', () => {
      console.log('\nShutting down usage aggregation service...');
      usageAggregationService.stop();
      process.exit(0);
    });
    
    process.on('SIGTERM', () => {
      console.log('\nShutting down usage aggregation service...');
      usageAggregationService.stop();
      process.exit(0);
    });
    
    // Keep the process alive
    setInterval(() => {
      // Do nothing, just keep alive
    }, 1000);
    
  } catch (error) {
    console.error('Failed to start service:', error);
    process.exit(1);
  }
}

async function showStatus() {
  try {
    const status = usageAggregationService.getStatus();
    
    console.log('Usage Aggregation Service Status:');
    console.log(`  - Running: ${status.isRunning ? 'Yes' : 'No'}`);
    console.log(`  - Interval ID: ${status.intervalId || 'None'}`);
    
  } catch (error) {
    console.error('Failed to get status:', error);
    process.exit(1);
  }
}

async function cleanup() {
  try {
    const retentionDays = parseInt(process.argv[3]) || 90;
    
    console.log(`Cleaning up usage events older than ${retentionDays} days...`);
    const deletedCount = await usageAggregationService.cleanupOldEvents(retentionDays);
    
    console.log(`Cleaned up ${deletedCount} old usage events`);
    
    process.exit(0);
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
}

async function showStats() {
  try {
    console.log('Fetching aggregation statistics...');
    const stats = await usageAggregationService.getAggregationStats();
    
    console.log('Usage Aggregation Statistics:');
    console.log(`  - Total events: ${stats.totalEvents.toLocaleString()}`);
    console.log(`  - Total aggregated stats: ${stats.totalStats.toLocaleString()}`);
    console.log(`  - Oldest event: ${stats.oldestEvent?.toISOString() || 'None'}`);
    console.log(`  - Newest event: ${stats.newestEvent?.toISOString() || 'None'}`);
    console.log(`  - Oldest stat: ${stats.oldestStat?.toISOString() || 'None'}`);
    console.log(`  - Newest stat: ${stats.newestStat?.toISOString() || 'None'}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Failed to get statistics:', error);
    process.exit(1);
  }
}

function showHelp() {
  console.log('Usage Aggregation CLI');
  console.log('');
  console.log('Commands:');
  console.log('  run                    Run aggregation once');
  console.log('  start [interval]       Start background service (default: 60 minutes)');
  console.log('  status                 Show service status');
  console.log('  cleanup [days]         Clean up old events (default: 90 days)');
  console.log('  stats                  Show aggregation statistics');
  console.log('  help                   Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  npm run usage-aggregation run');
  console.log('  npm run usage-aggregation start 30');
  console.log('  npm run usage-aggregation cleanup 60');
}

// Run the main function
main().catch(error => {
  logger.error('CLI script failed:', error);
  process.exit(1);
});
