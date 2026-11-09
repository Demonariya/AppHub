/**
 * Backwards compatibility proxy for AppHub Icon System.
 * Re-exports the unified architecture from src/services/icons.
 */
export * from './icons';
export {
  getAppIconUrl,
  getSecondaryIconFallback,
  resolveAppIcon,
} from './icons/resolver';
