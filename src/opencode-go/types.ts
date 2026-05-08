/**
 * Type definitions for OpenCode Go usage tracking.
 */

/** Per-time-window usage data scraped from the dashboard. */
export interface UsageWindow {
  /** Usage percentage [0..100] */
  usagePercent: number;
  /** Seconds until usage resets */
  resetInSec: number;
  /** Remaining percentage [0..100] */
  percentRemaining: number;
  /** ISO reset timestamp */
  resetTimeIso: string;
}

/** Snapshot entry per account — stored in tui-state.json. */
export interface OpenCodeGoUsageEntry {
  /** Display name for this account (from config). */
  accountName: string;
  /** OpenCode Go workspace ID. */
  workspaceId: string;
  /** Rolling (~5h) usage window, when present. */
  rolling?: UsageWindow;
  /** Weekly usage window, when present. */
  weekly?: UsageWindow;
  /** Monthly usage window, when present. */
  monthly?: UsageWindow;
  /** Timestamp when data was fetched. */
  fetchedAt: number;
  /** Error message if the scrape failed for this account. */
  error?: string;
}

/** Detailed usage data from the /usage page. */
export interface UsageDetail {
  /** Total number of API calls. */
  totalCalls: number;
  /** Total estimated cost in USD. */
  totalCost: number;
  /** Per-model breakdown. */
  perModel: Array<{
    model: string;
    calls: number;
    cost: number;
  }>;
}

/** Account config from the plugin config schema. */
export interface OpenCodeGoAccount {
  /** Display name for this account. */
  name: string;
  /** OpenCode Go workspace ID. */
  workspaceId: string;
  /** Auth cookie for dashboard access. */
  authCookie: string;
}

/** Config for the OpenCode Go tracking feature. */
export interface OpenCodeGoConfig {
  /** Accounts to track. */
  accounts: OpenCodeGoAccount[];
  /** Minimum interval between auto-refreshes in ms (default: 60000). */
  refreshIntervalMs: number;
}
