/**
 * OpenCode Go usage tracking module.
 *
 * Provides account management (local storage), dashboard scraping,
 * caching, and slash-command support for OpenCode Go workspace usage
 * data displayed in the TUI sidebar and via /go and /usage commands.
 */

export type { StoredAccount } from './accounts-store';
export {
  loadAccounts,
  maskCookie,
  removeAccount,
  saveAccount,
  updateAccountCookie,
} from './accounts-store';
export { scrapeQuota, scrapeUsagePage } from './scraper';
export type {
  OpenCodeGoUsageEntry,
  UsageDetail,
  UsageWindow,
} from './types';
export { createUsageService, UsageService } from './usage-service';
