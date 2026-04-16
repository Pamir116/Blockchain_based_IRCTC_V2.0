// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/// @title BookingContract (v1) — Original working contract kept intact
contract BookingContract is Ownable, ReentrancyGuard {

    struct Ticket {
        uint256 ticketId;
        address passenger;
        string  trainNumber;
        string  seatType;
        uint256 seatNumber;
        uint256 journeyDate;
        bool    isConfirmed;
        bool    isWaiting;
        bool    isCancelled;
        bool    qrScanned;
    }

    struct SeatHistory {
        address[] previousOwners;
        string[]  actions;
        uint256[] timestamps;
    }

    uint256 public nextTicketId = 1;
    uint256 public constant MAX_BOOKINGS_PER_WALLET = 2;
    uint256 public constant TICKET_PRICE            = 0.01 ether;
    uint256 public constant PENALTY_PERCENT         = 20;

    mapping(uint256 => Ticket)      public tickets;
    mapping(address => uint256[])   public userTickets;
    mapping(address => uint256)     public activeBookingCount;
    mapping(address => bool)        public verifiedUsers;
    mapping(uint256 => SeatHistory) internal seatHistories;
    mapping(address => uint256)     public bookingWindowOpen;

    event TicketBooked(uint256 indexed ticketId, address indexed passenger, string trainNumber, uint256 seatNumber);
    event TicketCancelled(uint256 indexed ticketId, address indexed passenger, uint256 refundAmount);
    event QRScanned(uint256 indexed ticketId, address indexed passenger);
    event PenaltyApplied(uint256 indexed ticketId, address indexed passenger, uint256 penaltyAmount);

    constructor() Ownable(msg.sender) {}

    function verifyUser(address _user) external onlyOwner { verifiedUsers[_user] = true; }
    function setBookingWindow(address _user, uint256 _openTime) external onlyOwner { bookingWindowOpen[_user] = _openTime; }

    function bookTicket(
        string memory _trainNumber,
        string memory _seatType,
        uint256 _seatNumber,
        uint256 _journeyDate
    ) external payable nonReentrant returns (uint256) {
        require(verifiedUsers[msg.sender],                                "User not KYC verified");
        require(activeBookingCount[msg.sender] < MAX_BOOKINGS_PER_WALLET,"Booking limit reached");
        require(block.timestamp >= bookingWindowOpen[msg.sender],         "Booking window not open yet");
        require(msg.value == TICKET_PRICE,                                "Incorrect payment amount");

        uint256 ticketId = nextTicketId++;
        tickets[ticketId] = Ticket({
            ticketId:    ticketId,
            passenger:   msg.sender,
            trainNumber: _trainNumber,
            seatType:    _seatType,
            seatNumber:  _seatNumber,
            journeyDate: _journeyDate,
            isConfirmed: true,
            isWaiting:   false,
            isCancelled: false,
            qrScanned:   false
        });

        userTickets[msg.sender].push(ticketId);
        activeBookingCount[msg.sender]++;

        seatHistories[ticketId].previousOwners.push(msg.sender);
        seatHistories[ticketId].actions.push("BOOKED");
        seatHistories[ticketId].timestamps.push(block.timestamp);

        emit TicketBooked(ticketId, msg.sender, _trainNumber, _seatNumber);
        return ticketId;
    }

    function cancelTicket(uint256 _ticketId) external nonReentrant {
        Ticket storage ticket = tickets[_ticketId];
        require(ticket.passenger == msg.sender, "Not ticket owner");
        require(!ticket.isCancelled,            "Already cancelled");
        require(!ticket.qrScanned,              "Journey started, cannot cancel");

        ticket.isCancelled = true;
        activeBookingCount[msg.sender]--;

        uint256 refundAmount;
        uint256 hoursLeft = ticket.journeyDate > block.timestamp
            ? (ticket.journeyDate - block.timestamp) / 3600 : 0;
        if      (hoursLeft > 48) refundAmount = TICKET_PRICE;
        else if (hoursLeft > 12) refundAmount = (TICKET_PRICE * 75) / 100;
        else                     refundAmount = (TICKET_PRICE * 50) / 100;

        seatHistories[_ticketId].previousOwners.push(msg.sender);
        seatHistories[_ticketId].actions.push("CANCELLED");
        seatHistories[_ticketId].timestamps.push(block.timestamp);

        (bool sent,) = payable(msg.sender).call{value: refundAmount}("");
        require(sent, "Refund failed");
        emit TicketCancelled(_ticketId, msg.sender, refundAmount);
    }

    function scanQR(uint256 _ticketId) external onlyOwner {
        Ticket storage t = tickets[_ticketId];
        require(t.isConfirmed && !t.isCancelled, "Invalid ticket");
        require(!t.qrScanned,                    "Already scanned");
        t.qrScanned = true;
        emit QRScanned(_ticketId, t.passenger);
    }

    function applyNoShowPenalty(uint256 _ticketId) external onlyOwner {
        Ticket storage t = tickets[_ticketId];
        require(t.isConfirmed && !t.isCancelled, "Invalid ticket");
        require(!t.qrScanned,                    "Passenger boarded");
        require(block.timestamp > t.journeyDate, "Journey not departed yet");
        uint256 penalty = (TICKET_PRICE * PENALTY_PERCENT) / 100;
        emit PenaltyApplied(_ticketId, t.passenger, penalty);
    }

    function getTicket(uint256 _ticketId) external view returns (Ticket memory) { return tickets[_ticketId]; }
    function getUserTickets(address _user) external view returns (uint256[] memory) { return userTickets[_user]; }
    function getSeatHistory(uint256 _ticketId) external view returns (
        address[] memory owners, string[] memory actions, uint256[] memory timestamps
    ) {
        SeatHistory memory h = seatHistories[_ticketId];
        return (h.previousOwners, h.actions, h.timestamps);
    }
    function withdraw() external onlyOwner { payable(owner()).transfer(address(this).balance); }
}
