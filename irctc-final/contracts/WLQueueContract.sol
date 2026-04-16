// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title WLQueueContract — FIFO waiting list, auto-upgrade on cancellation
contract WLQueueContract is Ownable {

    struct WLEntry {
        address passenger;
        string  trainNumber;
        string  seatType;
        uint256 requestTime;
        bool    upgraded;
    }

    mapping(string => WLEntry[])              public waitingLists;
    mapping(address => mapping(string => bool)) public isInWaitingList;

    event AddedToWL(address indexed passenger, string trainNumber, uint256 position);
    event WLUpgraded(address indexed passenger, string trainNumber, uint256 position);

    constructor() Ownable(msg.sender) {}

    function joinWaitingList(string memory _trainNumber, string memory _seatType) external {
        require(!isInWaitingList[msg.sender][_trainNumber], "Already in WL");
        waitingLists[_trainNumber].push(WLEntry({
            passenger:   msg.sender,
            trainNumber: _trainNumber,
            seatType:    _seatType,
            requestTime: block.timestamp,
            upgraded:    false
        }));
        isInWaitingList[msg.sender][_trainNumber] = true;
        emit AddedToWL(msg.sender, _trainNumber, waitingLists[_trainNumber].length);
    }

    function upgradeNextInLine(string memory _trainNumber) external onlyOwner returns (address) {
        WLEntry[] storage queue = waitingLists[_trainNumber];
        for (uint i = 0; i < queue.length; i++) {
            if (!queue[i].upgraded) {
                queue[i].upgraded = true;
                isInWaitingList[queue[i].passenger][_trainNumber] = false;
                emit WLUpgraded(queue[i].passenger, _trainNumber, i);
                return queue[i].passenger;
            }
        }
        return address(0);
    }

    function getWaitingListLength(string memory _trainNumber) external view returns (uint256) {
        return waitingLists[_trainNumber].length;
    }

    function getWaitingList(string memory _trainNumber) external view returns (WLEntry[] memory) {
        return waitingLists[_trainNumber];
    }
}
