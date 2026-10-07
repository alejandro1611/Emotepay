// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IUSDC is IERC20 {
    function receiveWithAuthorization(
        address from,
        address to,
        uint256 value,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 nonce,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

contract EmotePay {
    using SafeERC20 for IUSDC;

    error InvalidCreator();
    error InvalidDonor();
    error InvalidPaymentToken();
    error InvalidEmote();
    error SelfDonationNotAllowed();
    error PersistentCustodyInvariant();

    IUSDC public immutable usdc;

    bytes32 public constant DONATION_AUTHORIZATION_NONCE_DOMAIN =
        keccak256("EmotePay.receiveWithAuthorizationDonation.v1");

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

    constructor(IUSDC usdcToken) {
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

    function computeDonationAuthorizationNonce(
        address donor,
        address creator,
        uint256 emoteId,
        uint256 exactPrice,
        bytes32 randomSalt
    ) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                DONATION_AUTHORIZATION_NONCE_DOMAIN,
                block.chainid,
                address(this),
                address(usdc),
                donor,
                creator,
                emoteId,
                exactPrice,
                randomSalt
            )
        );
    }

    function donateWithAuthorization(
        address donor,
        address creator,
        uint256 emoteId,
        uint256 validAfter,
        uint256 validBefore,
        bytes32 randomSalt,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        if (donor == address(0)) revert InvalidDonor();
        if (creator == address(0)) revert InvalidCreator();
        if (donor == creator) revert SelfDonationNotAllowed();

        uint256 amount = getEmotePrice(emoteId);
        bytes32 nonce = computeDonationAuthorizationNonce(
            donor,
            creator,
            emoteId,
            amount,
            randomSalt
        );
        uint256 balanceBefore = usdc.balanceOf(address(this));

        usdc.receiveWithAuthorization(
            donor,
            address(this),
            amount,
            validAfter,
            validBefore,
            nonce,
            v,
            r,
            s
        );
        usdc.safeTransfer(creator, amount);

        if (usdc.balanceOf(address(this)) != balanceBefore) {
            revert PersistentCustodyInvariant();
        }

        emit Donation(donor, creator, amount, emoteId);
    }
}
