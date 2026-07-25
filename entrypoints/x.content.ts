import { startEngine } from '@/lib/engine';

export default defineContentScript({
  matches: ['https://x.com/*', 'https://twitter.com/*'],
  main() {
    console.log('[XFF] content script loaded on', location.href);
    startEngine();
  },
});
