// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract EmotePay {
    using SafeERC20 for IERC20;

    error InvalidCreator();
    error InvalidPaymentToken();
    error InvalidEmote();
    error SelfDonationNotAllowed();

    IERC20 public immutable usdc;

    uint256 public constant HYPE_FIRE_EMOTE_ID = 1;
    uint256 public constant TO_THE_MOON_EMOTE_ID = 2;
    uint256 public constant KING_QUEEN_EMOTE_ID = 3;
    uint256 public constant DIAMOND_HANDS_EMOTE_ID = 4;

    uint256 public constant HYPE_FIRE_PRICE = 100_000;
    uint256 public constant TO_THE_MOON_PRICE = 500_000;
    uint256 public constant KING_QUEEN_PRICE = 1_000_000;
    uint256 public constant DIAMOND_HANDS_PRICE = 2_500_000;

    event Donation(
        address indexed donor,
        address indexed creator,
        uint256 amount,
        uint256 indexed emoteId
    );

    constructor(IERC20 usdcToken) {
        if (address(usdcToken) == address(0)) revert InvalidPaymentToken();

        usdc = usdcToken;
    }

    function getEmotePrice(uint256 emoteId) public pure returns (uint256) {
        if (emoteId == HYPE_FIRE_EMOTE_ID) return HYPE_FIRE_PRICE;
        if (emoteId == TO_THE_MOON_EMOTE_ID) return TO_THE_MOON_PRICE;
        if (emoteId == KING_QUEEN_EMOTE_ID) return KING_QUEEN_PRICE;
        if (emoteId == DIAMOND_HANDS_EMOTE_ID) return DIAMOND_HANDS_PRICE;

        revert InvalidEmote();
    }

    function donate(address creator, uint256 emoteId) external {
        if (creator == address(0)) revert InvalidCreator();
        if (msg.sender == creator) revert SelfDonationNotAllowed();

        uint256 amount = getEmotePrice(emoteId);

        usdc.safeTransferFrom(msg.sender, creator, amount);

        emit Donation(msg.sender, creator, amount, emoteId);
    }
}
