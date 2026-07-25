import { defineConfig } from 'wxt';

// See https://wxt.dev/api/config.html
export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'X Feed Filter',
    description: 'On-device LLM filtering for your X (Twitter) timeline.',
    permissions: ['storage'],
    host_permissions: ['https://x.com/*', 'https://twitter.com/*'],
    minimum_chrome_version: '138',
  },
  webExt: {
    // chrome-launcher (via web-ext-run) defaults include
    // --disable-features=...,OptimizationHints,... which kills the Optimization
    // Guide and makes LanguageModel.availability() return "unavailable".
    // A later --disable-features switch replaces the earlier one in Chromium,
    // so re-list the same defaults minus OptimizationHints.
    chromiumArgs: [
      '--disable-features=Translate,MediaRouter,DialMediaRouteProvider,CalculateNativeWinOcclusion,InterestFeedContentSuggestions,CertificateTransparencyComponentUpdater,AutofillServerCommunication,PrivacySandboxSettings4',
    ],
  },
});
