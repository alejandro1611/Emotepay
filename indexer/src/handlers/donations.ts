import {
  indexer,
  type Creator,
  type CreatorDonor,
  type Donation,
  type Donor,
  type Emote,
} from "envio";

function normalizeAddress(address: string) {
  return address.toLowerCase();
}

function getDonationId(transactionHash: string, logIndex: number) {
  return `${transactionHash}-${logIndex}`;
}

function getTimestampSeconds(timestamp: number | bigint) {
  return typeof timestamp === "bigint" ? timestamp : BigInt(timestamp);
}

indexer.onEvent(
  { contract: "EmotePay", event: "Donation" },
  async ({ event, context }) => {
    const donor = normalizeAddress(event.params.donor);
    const creator = normalizeAddress(event.params.creator);
    const amount = event.params.amount;
    const emoteId = event.params.emoteId;
    const donationId = getDonationId(event.transaction.hash, event.logIndex);
    const creatorDonorId = `${creator}-${donor}`;
    const emoteAggregateId = emoteId.toString();

    const [
      existingCreator,
      existingCreatorDonor,
      existingDonor,
      existingEmote,
    ] = await Promise.all([
      context.Creator.get(creator),
      context.CreatorDonor.get(creatorDonorId),
      context.Donor.get(donor),
      context.Emote.get(emoteAggregateId),
    ]);

    const donation: Donation = {
      id: donationId,
      donor,
      creator,
      amount,
      emoteId,
      transactionHash: event.transaction.hash,
      blockNumber: BigInt(event.block.number),
      logIndex: event.logIndex,
      timestamp: getTimestampSeconds(event.block.timestamp),
    };

    const creatorEntity: Creator = existingCreator
      ? {
          ...existingCreator,
          totalDonationsCount: existingCreator.totalDonationsCount + 1,
          totalAmountReceived: existingCreator.totalAmountReceived + amount,
          uniqueDonorsCount:
            existingCreator.uniqueDonorsCount + (existingCreatorDonor ? 0 : 1),
        }
      : {
          id: creator,
          totalDonationsCount: 1,
          totalAmountReceived: amount,
          uniqueDonorsCount: 1,
        };

    const donorEntity: Donor = existingDonor
      ? {
          ...existingDonor,
          donationCount: existingDonor.donationCount + 1,
          totalDonated: existingDonor.totalDonated + amount,
        }
      : {
          id: donor,
          donationCount: 1,
          totalDonated: amount,
        };

    const emoteEntity: Emote = existingEmote
      ? {
          ...existingEmote,
          usageCount: existingEmote.usageCount + 1,
          totalAmount: existingEmote.totalAmount + amount,
        }
      : {
          id: emoteAggregateId,
          emoteId,
          usageCount: 1,
          totalAmount: amount,
        };

    context.Donation.set(donation);
    context.Creator.set(creatorEntity);
    context.Donor.set(donorEntity);
    context.Emote.set(emoteEntity);

    if (!existingCreatorDonor) {
      const creatorDonor: CreatorDonor = {
        id: creatorDonorId,
        creator,
        donor,
      };

      context.CreatorDonor.set(creatorDonor);
    }
  },
);
