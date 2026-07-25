// Preset filter categories. The `description` is what the LLM actually sees,
// so it is written as a classification criterion, not a UI label.

export interface CategoryDef {
  id: string;
  label: string;
  emoji: string;
  description: string;
}

export const CATEGORIES: CategoryDef[] = [
  {
    id: 'ai',
    label: 'AI',
    emoji: '🤖',
    description:
      'Artificial intelligence, LLMs, chatbots, generative-AI tools, AI hype threads, or AI-generated content.',
  },
  {
    id: 'tech',
    label: 'Tech',
    emoji: '💻',
    description:
      'Software, programming, startups, gadgets, big-tech company news, or product launches.',
  },
  {
    id: 'gaming',
    label: 'Gaming',
    emoji: '🎮',
    description:
      'Video games, game releases and reviews, esports, streamers, or gaming hardware.',
  },
  {
    id: 'ads',
    label: 'Ads / promotions',
    emoji: '📢',
    description:
      'Advertisements, sponsored content, product plugs, giveaways, or self-promotion.',
  },
  {
    id: 'crypto',
    label: 'Crypto / NFT',
    emoji: '🪙',
    description:
      'Cryptocurrency, tokens, NFTs, or related trading and shilling promotion.',
  },
  {
    id: 'politics',
    label: 'Politics',
    emoji: '🏛',
    description:
      'Political news, partisan commentary, elections, or government policy debates.',
  },
  {
    id: 'outrage',
    label: 'Rage / outrage bait',
    emoji: '🔥',
    description:
      'Content designed to provoke anger or moral outrage, inflammatory hot takes, or ragebait.',
  },
  {
    id: 'engagement',
    label: 'Engagement bait',
    emoji: '🎣',
    description:
      'Reply-farming, "repost if", follow-for-follow, or low-effort viral engagement bait.',
  },
  {
    id: 'sports',
    label: 'Sports',
    emoji: '⚽',
    description: 'Sports scores, commentary, or athlete/team news.',
  },
  {
    id: 'crime',
    label: 'Crime / violence',
    emoji: '🚨',
    description:
      'Graphic crime, violence, accidents, war footage, or distressing shock content.',
  },
];
