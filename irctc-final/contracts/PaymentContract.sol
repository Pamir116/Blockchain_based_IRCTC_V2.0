// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title PaymentContract — Escrow: holds MATIC until journey completes
contract PaymentContract is Ownable, ReentrancyGuard {

    enum PaymentStatus { HELD, RELEASED, REFUNDED }

    struct Payment {
        address       payer;
        uint256       amount;
        uint256       ticketId;
        PaymentStatus status;
        uint256       createdAt;
    }

    mapping(uint256 => Payment) public payments;

    event PaymentHeld(uint256 indexed ticketId, address indexed payer, uint256 amount);
    event PaymentReleased(uint256 indexed ticketId, uint256 amount);
    event PaymentRefunded(uint256 indexed ticketId, address indexed payer, uint256 amount);

    constructor() Ownable(msg.sender) {}

    function holdPayment(uint256 _ticketId) external payable nonReentrant {
        require(msg.value > 0,                           "Payment required");
        require(payments[_ticketId].payer == address(0), "Payment already held");
        payments[_ticketId] = Payment({
            payer:     msg.sender,
            amount:    msg.value,
            ticketId:  _ticketId,
            status:    PaymentStatus.HELD,
            createdAt: block.timestamp
        });
        emit PaymentHeld(_ticketId, msg.sender, msg.value);
    }

    function releasePayment(uint256 _ticketId) external onlyOwner nonReentrant {
        Payment storage p = payments[_ticketId];
        require(p.status == PaymentStatus.HELD, "Not in HELD state");
        p.status = PaymentStatus.RELEASED;
        payable(owner()).transfer(p.amount);
        emit PaymentReleased(_ticketId, p.amount);
    }

    function refundPayment(uint256 _ticketId, uint256 _refundAmount) external onlyOwner nonReentrant {
        Payment storage p = payments[_ticketId];
        require(p.status == PaymentStatus.HELD,     "Not in HELD state");
        require(_refundAmount <= p.amount,          "Refund exceeds held amount");
        p.status = PaymentStatus.REFUNDED;
        payable(p.payer).transfer(_refundAmount);
        uint256 penalty = p.amount - _refundAmount;
        if (penalty > 0) payable(owner()).transfer(penalty);
        emit PaymentRefunded(_ticketId, p.payer, _refundAmount);
    }

    function getPayment(uint256 _ticketId) external view returns (Payment memory) {
        return payments[_ticketId];
    }
}
