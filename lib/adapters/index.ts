import type { PlatformAdapter } from '@/lib/types';
import { xAdapter } from './x';

/** Resolve the adapter for the current host, or null if unsupported. */
export function getAdapter(hostname: string): PlatformAdapter | null {
  if (
    hostname === 'x.com' ||
    hostname.endsWith('.x.com') ||
    hostname === 'twitter.com' ||
    hostname.endsWith('.twitter.com')
  ) {
    return xAdapter;
  }
  return null;
}
