// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

interface INFTTicket {
    function mintTicket(
        address _to, string memory _trainNumber, string memory _trainName,
        string memory _from, string memory _to2,
        string memory _seatType, uint256 _seatNumber, string memory _coach,
        uint256 _journeyDate, uint256 _price, string memory _pnr
    ) external returns (uint256);
    function invalidateTicket(uint256 _id, string memory _reason) external;
    function markBoarded(uint256 _id) external;
}

interface IWLQueue {
    function upgradeNextInLine(string memory _train) external returns (address);
}

interface IPricing {
    function previewPrice(
        string memory _from, string memory _to,
        string memory _class, bool _tatkal, uint256 _date
    ) external view returns (uint256 price, uint256 distKm);
}

/// @title BookingContractV2 — Full booking + NFT + seat map + dynamic price + auto WL
contract BookingContractV2 is Ownable, ReentrancyGuard {

    struct Ticket {
        uint256 ticketId;
        uint256 nftTokenId;
        address passenger;
        string  trainNumber;
        string  fromStation;
        string  toStation;
        string  seatType;
        uint256 seatNumber;
        string  coachNumber;
        uint256 journeyDate;
        uint256 pricePaid;
        bool    isConfirmed;
        bool    isCancelled;
        bool    qrScanned;
        bool    isTatkal;
        string  pnr;
    }

    struct SeatHistory {
        address[] previousOwners;
        string[]  actions;
        uint256[] timestamps;
    }

    // 0=AVAILABLE 1=BOOKED 2=CANCELLED_AVAILABLE 3=WAITING_LIST
    enum SeatStatus { AVAILABLE, BOOKED, CANCELLED_AVAILABLE, WAITING_LIST }

    struct SeatState {
        SeatStatus status;
        address    occupant;
        uint256    ticketId;
        string     berthType;
    }

    uint256 public nextTicketId = 1;
    uint256 public constant MAX_BOOKINGS_PER_WALLET = 2;
    uint256 public constant PENALTY_PERCENT         = 20;

    mapping(uint256 => Ticket)      public tickets;
    mapping(address => uint256[])   public userTickets;
    mapping(address => uint256)     public activeBookingCount;
    mapping(address => bool)        public verifiedUsers;
    mapping(uint256 => SeatHistory) internal seatHistories;
    mapping(address => uint256)     public bookingWindowOpen;

    // trainNumber => coachNumber => seatNumber => berthType (static, set once)
    mapping(string => mapping(string => mapping(uint256 => string))) public seatBerthType;

    // trainNumber => coachNumber => seatNumber => dateKey (midnight timestamp) => SeatState
    mapping(string => mapping(string => mapping(uint256 => mapping(uint256 => SeatState)))) public seatBookings;

    uint256 private _pnrCounter;

    INFTTicket public nftContract;
    IWLQueue   public wlContract;
    IPricing   public pricingContract;

    event TicketBooked(
        uint256 indexed ticketId, uint256 indexed nftTokenId,
        address indexed passenger, string trainNumber, string pnr, uint256 price
    );
    event TicketCancelled(
        uint256 indexed ticketId, address indexed passenger,
        uint256 refundAmount, address wlUpgraded
    );
    event QRScanned(uint256 indexed ticketId, address indexed passenger);
    event SeatStatusChanged(string trainNumber, string coach, uint256 seat, uint8 status);
    event WLAutoUpgraded(string trainNumber, address passenger);

    constructor() Ownable(msg.sender) {}

    // ─── SETUP ────────────────────────────────────────────────────────
    function setNFTContract(address _a)     external onlyOwner { nftContract     = INFTTicket(_a); }
    function setWLContract(address _a)      external onlyOwner { wlContract      = IWLQueue(_a);   }
    function setPricingContract(address _a) external onlyOwner { pricingContract = IPricing(_a);   }
    function verifyUser(address _u)         external onlyOwner { verifiedUsers[_u] = true;         }
    function setBookingWindow(address _u, uint256 _t) external onlyOwner { bookingWindowOpen[_u] = _t; }

    // Normalize any timestamp to midnight of that day
    function _dateKey(uint256 ts) internal pure returns (uint256) {
        return (ts / 86400) * 86400;
    }

    function initCoach(
        string memory _train, string memory _coach,
        uint256[] memory _seats, string[] memory _types
    ) external onlyOwner {
        require(_seats.length == _types.length, "Length mismatch");
        for (uint i = 0; i < _seats.length; i++) {
            seatBerthType[_train][_coach][_seats[i]] = _types[i];
        }
    }

    // ─── BOOK TICKET ──────────────────────────────────────────────────
    function bookTicket(
        string memory _train,    string memory _trainName,
        string memory _from,     string memory _to,
        string memory _seatType, uint256 _seatNumber,
        string memory _coach,    uint256 _journeyDate,
        bool _tatkal
    ) external payable nonReentrant returns (uint256 ticketId, uint256 nftId) {

        require(verifiedUsers[msg.sender],                                  "KYC not verified");
        require(activeBookingCount[msg.sender] < MAX_BOOKINGS_PER_WALLET,   "Booking limit reached");
        require(block.timestamp >= bookingWindowOpen[msg.sender],           "Booking window not open");

        uint256 dateKey = _dateKey(_journeyDate);
        SeatState storage seat = seatBookings[_train][_coach][_seatNumber][dateKey];
        require(
            seat.status == SeatStatus.AVAILABLE ||
            seat.status == SeatStatus.CANCELLED_AVAILABLE,
            "Seat not available"
        );

        // Dynamic price check (only if pricing contract is set)
        if (address(pricingContract) != address(0)) {
            (uint256 expected,) = pricingContract.previewPrice(_from, _to, _seatType, _tatkal, _journeyDate);
            if (expected > 0) require(msg.value >= expected, "Insufficient payment");
        } else {
            require(msg.value > 0, "Payment required");
        }

        string memory pnr = _mkPNR();
        ticketId = nextTicketId++;

        tickets[ticketId] = Ticket({
            ticketId:    ticketId, nftTokenId: 0,
            passenger:   msg.sender, trainNumber: _train,
            fromStation: _from,      toStation:   _to,
            seatType:    _seatType,  seatNumber:  _seatNumber,
            coachNumber: _coach,     journeyDate: _journeyDate,
            pricePaid:   msg.value,  isConfirmed: true,
            isCancelled: false,      qrScanned:   false,
            isTatkal:    _tatkal,    pnr:         pnr
        });

        userTickets[msg.sender].push(ticketId);
        activeBookingCount[msg.sender]++;

        seatHistories[ticketId].previousOwners.push(msg.sender);
        seatHistories[ticketId].actions.push("BOOKED");
        seatHistories[ticketId].timestamps.push(block.timestamp);

        seat.status   = SeatStatus.BOOKED;
        seat.occupant = msg.sender;
        seat.ticketId = ticketId;

        // Mint NFT (non-blocking — if NFT contract not set, booking still works)
        if (address(nftContract) != address(0)) {
            try nftContract.mintTicket(
                msg.sender, _train, _trainName, _from, _to,
                _seatType, _seatNumber, _coach, _journeyDate, msg.value, pnr
            ) returns (uint256 tokenId) {
                nftId = tokenId;
                tickets[ticketId].nftTokenId = tokenId;
            } catch {}
        }

        emit TicketBooked(ticketId, nftId, msg.sender, _train, pnr, msg.value);
        emit SeatStatusChanged(_train, _coach, _seatNumber, uint8(SeatStatus.BOOKED));
    }

    // ─── CANCEL ───────────────────────────────────────────────────────
    function cancelTicket(uint256 _id) external nonReentrant {
        Ticket storage t = tickets[_id];
        require(t.passenger == msg.sender, "Not ticket owner");
        require(!t.isCancelled,            "Already cancelled");
        require(!t.qrScanned,              "Journey started");

        t.isCancelled = true;
        activeBookingCount[msg.sender]--;

        uint256 hoursLeft = t.journeyDate > block.timestamp
            ? (t.journeyDate - block.timestamp) / 3600 : 0;
        uint256 refund;
        if      (hoursLeft > 48) refund = t.pricePaid;
        else if (hoursLeft > 12) refund = (t.pricePaid * 75) / 100;
        else                     refund = (t.pricePaid * 50) / 100;

        seatHistories[_id].previousOwners.push(msg.sender);
        seatHistories[_id].actions.push("CANCELLED");
        seatHistories[_id].timestamps.push(block.timestamp);

        uint256 dateKey = _dateKey(t.journeyDate);
        SeatState storage seat = seatBookings[t.trainNumber][t.coachNumber][t.seatNumber][dateKey];

        if (address(nftContract) != address(0) && t.nftTokenId != 0) {
            try nftContract.invalidateTicket(t.nftTokenId, "Cancelled") {} catch {}
        }

        // Auto WL upgrade
        address upgraded = address(0);
        if (address(wlContract) != address(0)) {
            try wlContract.upgradeNextInLine(t.trainNumber) returns (address next) {
                upgraded = next;
                if (next != address(0)) {
                    seat.status   = SeatStatus.BOOKED;
                    seat.occupant = next;
                    emit WLAutoUpgraded(t.trainNumber, next);
                    emit SeatStatusChanged(t.trainNumber, t.coachNumber, t.seatNumber, uint8(SeatStatus.BOOKED));
                }
            } catch {}
        }
        if (upgraded == address(0)) {
            seat.status   = SeatStatus.CANCELLED_AVAILABLE;
            seat.occupant = address(0);
            seat.ticketId = 0;
            emit SeatStatusChanged(t.trainNumber, t.coachNumber, t.seatNumber, uint8(SeatStatus.CANCELLED_AVAILABLE));
        }

        (bool sent,) = payable(msg.sender).call{value: refund}("");
        require(sent, "Refund failed");
        emit TicketCancelled(_id, msg.sender, refund, upgraded);
    }

    // ─── QR SCAN ──────────────────────────────────────────────────────
    function scanQR(uint256 _id) external onlyOwner {
        Ticket storage t = tickets[_id];
        require(t.isConfirmed && !t.isCancelled, "Invalid ticket");
        require(!t.qrScanned,                    "Already scanned");
        t.qrScanned = true;
        if (address(nftContract) != address(0) && t.nftTokenId != 0) {
            try nftContract.markBoarded(t.nftTokenId) {} catch {}
        }
        emit QRScanned(_id, t.passenger);
    }

    // ─── VIEWS ────────────────────────────────────────────────────────
    function getTicket(uint256 _id) external view returns (Ticket memory) { return tickets[_id]; }
    function getUserTickets(address _u) external view returns (uint256[] memory) { return userTickets[_u]; }
    function getSeatHistory(uint256 _id) external view returns (
        address[] memory, string[] memory, uint256[] memory
    ) {
        SeatHistory memory h = seatHistories[_id];
        return (h.previousOwners, h.actions, h.timestamps);
    }

    function getCoachSeatMap(
        string memory _train, string memory _coach, uint256[] memory _seats, uint256 _date
    ) external view returns (uint8[] memory statuses, address[] memory occupants, string[] memory berthTypes) {
        uint256 dateKey = _dateKey(_date);
        statuses   = new uint8[](_seats.length);
        occupants  = new address[](_seats.length);
        berthTypes = new string[](_seats.length);
        for (uint i = 0; i < _seats.length; i++) {
            SeatState memory s = seatBookings[_train][_coach][_seats[i]][dateKey];
            statuses[i]   = uint8(s.status);
            occupants[i]  = s.occupant;
            // Berth type is static — read from separate mapping
            string memory bt = seatBerthType[_train][_coach][_seats[i]];
            berthTypes[i] = bytes(bt).length > 0 ? bt : "LB";
        }
    }

    // ─── PNR GENERATION ───────────────────────────────────────────────
    function _mkPNR() internal returns (string memory) {
        _pnrCounter++;
        bytes32 h = keccak256(abi.encodePacked(msg.sender, block.timestamp, _pnrCounter, block.prevrandao));
        uint256 n = (uint256(h) % 9000000000) + 1000000000;
        return _u2s(n);
    }

    function _u2s(uint256 v) internal pure returns (string memory) {
        if (v == 0) return "0";
        uint256 tmp = v; uint256 d;
        while (tmp != 0) { d++; tmp /= 10; }
        bytes memory b = new bytes(d);
        while (v != 0) { d--; b[d] = bytes1(uint8(48 + v % 10)); v /= 10; }
        return string(b);
    }

    function withdraw() external onlyOwner { payable(owner()).transfer(address(this).balance); }
}
