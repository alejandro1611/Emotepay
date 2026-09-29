export type Emote = {
  id: string;
  onchainId: number;
  emoji: string;
  name: string;
  displayAmount: string;
  amountMon: string;
  color: string;
};

export const EMOTES = [
  {
    id: "fire",
    onchainId: 1,
    emoji: "🔥",
    name: "Hype Fire",
    displayAmount: "0.001 MON",
    amountMon: "0.001",
    color: "from-orange-500 to-red-600",
  },
  {
    id: "rocket",
    onchainId: 2,
    emoji: "🚀",
    name: "To The Moon",
    displayAmount: "0.005 MON",
    amountMon: "0.005",
    color: "from-purple-500 to-indigo-600",
  },
  {
    id: "crown",
    onchainId: 3,
    emoji: "👑",
    name: "King/Queen",
    displayAmount: "0.01 MON",
    amountMon: "0.01",
    color: "from-amber-400 to-yellow-600",
  },
  {
    id: "gem",
    onchainId: 4,
    emoji: "💎",
    name: "Diamond Hands",
    displayAmount: "0.025 MON",
    amountMon: "0.025",
    color: "from-cyan-400 to-blue-600",
  },
] as const satisfies readonly Emote[];
