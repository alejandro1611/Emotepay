export type Emote = {
  id: string;
  onchainId: number;
  emoji: string;
  name: string;
  displayAmount: string;
  amountUsdcBaseUnits: bigint;
  /**
   * Color sólido de la reacción, en hex. La tarjeta lo usa para el borde y
   * para el halo detrás del emoji, así que no puede ser una clase de Tailwind:
   * va a estilos en línea porque el valor es dinámico.
   */
  accent: string;
};

export const EMOTES = [
  {
    id: "fire",
    onchainId: 1,
    emoji: "🔥",
    name: "Hype Fire",
    displayAmount: "0.10 USDC",
    amountUsdcBaseUnits: 100_000n,
    accent: "#f97316",
  },
  {
    id: "rocket",
    onchainId: 2,
    emoji: "🚀",
    name: "To The Moon",
    displayAmount: "0.50 USDC",
    amountUsdcBaseUnits: 500_000n,
    accent: "#a855f7",
  },
  {
    id: "crown",
    onchainId: 3,
    emoji: "👑",
    name: "King/Queen",
    displayAmount: "1.00 USDC",
    amountUsdcBaseUnits: 1_000_000n,
    accent: "#fbbf24",
  },
  {
    id: "gem",
    onchainId: 4,
    emoji: "💎",
    name: "Diamond Hands",
    displayAmount: "2.50 USDC",
    amountUsdcBaseUnits: 2_500_000n,
    accent: "#22d3ee",
  },
] as const satisfies readonly Emote[];
