export type Emote = {
  id: string;
  onchainId: number;
  emoji: string;
  name: string;
  displayAmount: string;
  amountUsdcBaseUnits: bigint;
  color: string;
};

export const EMOTES = [
  {
    id: "fire",
    onchainId: 1,
    emoji: "🔥",
    name: "Hype Fire",
    displayAmount: "0.10 USDC",
    amountUsdcBaseUnits: 100_000n,
    color: "from-orange-500 to-red-600",
  },
  {
    id: "rocket",
    onchainId: 2,
    emoji: "🚀",
    name: "To The Moon",
    displayAmount: "0.50 USDC",
    amountUsdcBaseUnits: 500_000n,
    color: "from-purple-500 to-indigo-600",
  },
  {
    id: "crown",
    onchainId: 3,
    emoji: "👑",
    name: "King/Queen",
    displayAmount: "1.00 USDC",
    amountUsdcBaseUnits: 1_000_000n,
    color: "from-amber-400 to-yellow-600",
  },
  {
    id: "gem",
    onchainId: 4,
    emoji: "💎",
    name: "Diamond Hands",
    displayAmount: "2.50 USDC",
    amountUsdcBaseUnits: 2_500_000n,
    color: "from-cyan-400 to-blue-600",
  },
] as const satisfies readonly Emote[];
