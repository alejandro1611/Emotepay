"use client";

import React, { useEffect, useMemo, useReducer, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  createPublicClient,
  formatEther,
  http,
  isAddress,
  isAddressEqual,
  type Address,
  type Hash,
} from "viem";
import { emotePayContract } from "@/lib/contracts";
import { demoCreator } from "@/lib/creator";
import { EMOTES, type Emote } from "@/lib/emotes";
import { monadTestnet } from "@/lib/chains";

const ALERT_DURATION_MS = 4400;
const emotesByOnchainId = new Map<number, Emote>(
  EMOTES.map((emote) => [emote.onchainId, emote]),
);

type OverlayDonation = {
  id: string;
  donor: Address;
  creator: Address;
  amount: bigint;
  emoteId: bigint;
  emote: Emote;
  transactionHash: Hash;
  blockNumber: bigint;
};

type OverlayState = {
  activeDonation: OverlayDonation | null;
  queue: OverlayDonation[];
};

type OverlayAction =
  | { type: "enqueue"; donations: OverlayDonation[] }
  | { type: "dismiss-active" };

type DonationLogShape = {
  args?: {
    donor?: unknown;
    creator?: unknown;
    amount?: unknown;
    emoteId?: unknown;
  };
  blockNumber?: unknown;
  logIndex?: unknown;
  transactionHash?: unknown;
};

const monadPublicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(monadTestnet.rpcUrls.default.http[0]),
});

function shortenAddress(address: Address) {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getFormattedAmount(amount: bigint) {
  const fullAmount = formatEther(amount);
  const [whole, fraction = ""] = fullAmount.split(".");
  const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, "");

  return `${trimmedFraction ? `${whole}.${trimmedFraction}` : whole} MON`;
}

function getNextOverlayState(queue: OverlayDonation[]): OverlayState {
  const [activeDonation = null, ...remainingQueue] = queue;

  return {
    activeDonation,
    queue: remainingQueue,
  };
}

function overlayReducer(
  state: OverlayState,
  action: OverlayAction,
): OverlayState {
  switch (action.type) {
    case "enqueue": {
      if (state.activeDonation) {
        return {
          ...state,
          queue: [...state.queue, ...action.donations],
        };
      }

      return getNextOverlayState([...state.queue, ...action.donations]);
    }
    case "dismiss-active":
      return getNextOverlayState(state.queue);
  }
}

function isValidDonationLog(
  log: unknown,
  creatorAddress: Address,
): log is {
  args: {
    donor: Address;
    creator: Address;
    amount: bigint;
    emoteId: bigint;
  };
  blockNumber: bigint;
  logIndex: number;
  transactionHash: Hash;
} {
  const { args, blockNumber, logIndex, transactionHash } =
    log as DonationLogShape;
  const donor = args?.donor;
  const creator = args?.creator;
  const amount = args?.amount;
  const emoteId = args?.emoteId;

  return (
    typeof donor === "string" &&
    isAddress(donor) &&
    typeof creator === "string" &&
    isAddress(creator) &&
    typeof amount === "bigint" &&
    typeof emoteId === "bigint" &&
    typeof blockNumber === "bigint" &&
    typeof logIndex === "number" &&
    typeof transactionHash === "string" &&
    isAddressEqual(creator, creatorAddress)
  );
}

export default function OverlayPage() {
  const [{ activeDonation }, dispatch] = useReducer(overlayReducer, {
    activeDonation: null,
    queue: [],
  });
  const seenDonationIds = useRef(new Set<string>());
  const creatorAddress = demoCreator.walletAddress;
  const contractAddress = emotePayContract.address;
  const isConfigured =
    Boolean(creatorAddress) && Boolean(contractAddress);

  useEffect(() => {
    if (!creatorAddress || !contractAddress) {
      return;
    }

    const unwatch = monadPublicClient.watchContractEvent({
      address: contractAddress,
      abi: emotePayContract.abi,
      eventName: "Donation",
      onLogs: (logs) => {
        const donations: OverlayDonation[] = [];

        for (const log of logs) {
          if (!isValidDonationLog(log, creatorAddress)) {
            continue;
          }

          const id = `${log.transactionHash}-${log.logIndex}`;

          if (seenDonationIds.current.has(id)) {
            continue;
          }

          seenDonationIds.current.add(id);

          const emote = emotesByOnchainId.get(Number(log.args.emoteId));

          if (!emote) {
            continue;
          }

          donations.push({
            id,
            donor: log.args.donor,
            creator: log.args.creator,
            amount: log.args.amount,
            emoteId: log.args.emoteId,
            emote,
            transactionHash: log.transactionHash,
            blockNumber: log.blockNumber,
          });
        }

        if (donations.length > 0) {
          dispatch({ type: "enqueue", donations });
        }
      },
      onError: (error) => {
        console.error("Donation overlay watcher failed", error);
      },
      pollingInterval: 1_500,
      strict: true,
    });

    return () => {
      unwatch();
    };
  }, [contractAddress, creatorAddress]);

  useEffect(() => {
    if (!activeDonation) {
      return;
    }

    const timeout = window.setTimeout(() => {
      dispatch({ type: "dismiss-active" });
    }, ALERT_DURATION_MS);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeDonation]);

  const statusText = useMemo(() => {
    if (isConfigured) {
      return null;
    }

    if (!contractAddress) {
      return "Overlay missing contract address";
    }

    return "Overlay missing creator address";
  }, [contractAddress, isConfigured]);

  return (
    <main className="fixed inset-0 overflow-hidden bg-transparent text-white">
      {statusText && (
        <div className="absolute left-4 top-4 rounded border border-amber-300/40 bg-black/45 px-3 py-2 text-xs font-medium text-amber-100">
          {statusText}
        </div>
      )}

      <AnimatePresence mode="wait">
        {activeDonation && (
          <motion.section
            key={activeDonation.id}
            initial={{ opacity: 0, scale: 0.3, y: 120, rotate: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.75, y: -120, rotate: 8 }}
            transition={{ type: "spring", stiffness: 220, damping: 18 }}
            className="absolute inset-x-0 bottom-[12vh] mx-auto flex w-[min(88vw,520px)] flex-col items-center text-center drop-shadow-[0_12px_28px_rgba(0,0,0,0.55)]"
          >
            <motion.div
              animate={{
                scale: [1, 1.2, 0.96, 1.1, 1],
                rotate: [0, -8, 8, -4, 0],
              }}
              transition={{ duration: 1.15, repeat: 2, ease: "easeInOut" }}
              className="text-[clamp(5rem,18vw,12rem)] leading-none"
            >
              {activeDonation.emote.emoji}
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.35 }}
              className="mt-4 rounded-lg border border-white/25 bg-black/65 px-8 py-5 backdrop-blur-md"
            >
              <div className="text-[clamp(1.6rem,5vw,3.4rem)] font-black leading-none text-white">
                {getFormattedAmount(activeDonation.amount)}
              </div>
              <div className="mt-3 text-[clamp(0.9rem,2.6vw,1.25rem)] font-semibold text-cyan-100">
                from {shortenAddress(activeDonation.donor)}
              </div>
            </motion.div>
          </motion.section>
        )}
      </AnimatePresence>
    </main>
  );
}
