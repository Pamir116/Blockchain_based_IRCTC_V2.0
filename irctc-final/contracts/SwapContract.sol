// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title SwapContract — Only official channel for ticket transfer (no black market)
contract SwapContract is Ownable {

    struct SwapRequest {
        uint256 ticketA;
        uint256 ticketB;
        address requesterA;
        address requesterB;
        bool    approvedByB;
        bool    executed;
    }

    uint256 public nextSwapId = 1;
    mapping(uint256 => SwapRequest) public swapRequests;

    event SwapRequested(uint256 swapId, uint256 ticketA, uint256 ticketB);
    event SwapApproved(uint256 swapId);
    event SwapExecuted(uint256 swapId);

    constructor() Ownable(msg.sender) {}

    function requestSwap(uint256 _myTicket, uint256 _theirTicket, address _them) external returns (uint256) {
        uint256 swapId = nextSwapId++;
        swapRequests[swapId] = SwapRequest({
            ticketA:    _myTicket,
            ticketB:    _theirTicket,
            requesterA: msg.sender,
            requesterB: _them,
            approvedByB: false,
            executed:   false
        });
        emit SwapRequested(swapId, _myTicket, _theirTicket);
        return swapId;
    }

    function approveSwap(uint256 _swapId) external {
        SwapRequest storage s = swapRequests[_swapId];
        require(msg.sender == s.requesterB, "Not the other party");
        require(!s.executed,                "Already executed");
        s.approvedByB = true;
        emit SwapApproved(_swapId);
    }

    function executeSwap(uint256 _swapId) external onlyOwner {
        SwapRequest storage s = swapRequests[_swapId];
        require(s.approvedByB, "Not approved by both");
        require(!s.executed,   "Already done");
        s.executed = true;
        emit SwapExecuted(_swapId);
    }

    function getSwapRequest(uint256 _swapId) external view returns (SwapRequest memory) {
        return swapRequests[_swapId];
    }
}
