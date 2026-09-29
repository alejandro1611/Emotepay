// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

contract EmotePay {
    error InvalidCreator();
    error ZeroDonation();
    error SelfDonationNotAllowed();
    error TransferFailed();

    event Donation(
        address indexed donor,
        address indexed creator,
        uint256 amount,
        uint256 indexed emoteId
    );

    function donate(address creator, uint256 emoteId) external payable {
        if (creator == address(0)) revert InvalidCreator();
        if (msg.value == 0) revert ZeroDonation();
        if (msg.sender == creator) revert SelfDonationNotAllowed();

        (bool success, ) = creator.call{value: msg.value}("");
        if (!success) revert TransferFailed();

        emit Donation(msg.sender, creator, msg.value, emoteId);
    }
}
