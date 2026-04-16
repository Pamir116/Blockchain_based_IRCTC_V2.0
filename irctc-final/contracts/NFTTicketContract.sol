// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title NFTTicketContract — ERC-721 railway tickets with on-chain SVG art
/// @notice Stack-too-deep fix: SVG split into focused helper functions
contract NFTTicketContract is ERC721, Ownable {
    using Strings for uint256;

    struct TicketMetadata {
        string  trainNumber;
        string  trainName;
        string  fromStation;
        string  toStation;
        string  seatType;
        uint256 seatNumber;
        string  coachNumber;
        uint256 journeyDate;
        uint256 price;
        address passenger;
        string  pnr;
        bool    isValid;
        bool    isBoarded;
    }

    uint256 private _tokenIdCounter;
    address public swapContractAddress;
    address public bookingContractAddress;

    mapping(uint256 => TicketMetadata) public ticketData;
    mapping(string  => uint256)        public pnrToTokenId;

    event TicketMinted(uint256 indexed tokenId, address indexed to, string pnr, string trainNumber);
    event TicketInvalidated(uint256 indexed tokenId, string reason);
    event TicketBoarded(uint256 indexed tokenId);

    constructor() ERC721("IRCTC Blockchain Ticket", "IRCTCT") Ownable(msg.sender) {}

    modifier onlyAuthorized() {
        require(msg.sender == bookingContractAddress || msg.sender == owner(), "Unauthorized");
        _;
    }

    function setSwapContract(address _s)    external onlyOwner { swapContractAddress   = _s; }
    function setBookingContract(address _b) external onlyOwner { bookingContractAddress = _b; }

    // ─── MINT ─────────────────────────────────────────────────────────
    function mintTicket(
        address _to,
        string memory _trainNumber, string memory _trainName,
        string memory _fromStation, string memory _toStation,
        string memory _seatType,    uint256 _seatNumber,
        string memory _coachNumber, uint256 _journeyDate,
        uint256 _price,             string memory _pnr
    ) external onlyAuthorized returns (uint256) {
        require(pnrToTokenId[_pnr] == 0, "PNR already used");
        _tokenIdCounter++;
        uint256 tokenId = _tokenIdCounter;
        _safeMint(_to, tokenId);
        ticketData[tokenId] = TicketMetadata({
            trainNumber: _trainNumber, trainName:   _trainName,
            fromStation: _fromStation, toStation:   _toStation,
            seatType:    _seatType,    seatNumber:  _seatNumber,
            coachNumber: _coachNumber, journeyDate: _journeyDate,
            price:       _price,       passenger:   _to,
            pnr:         _pnr,         isValid:     true,
            isBoarded:   false
        });
        pnrToTokenId[_pnr] = tokenId;
        emit TicketMinted(tokenId, _to, _pnr, _trainNumber);
        return tokenId;
    }

    function invalidateTicket(uint256 _id, string memory _reason) external onlyAuthorized {
        ticketData[_id].isValid = false;
        emit TicketInvalidated(_id, _reason);
    }

    function markBoarded(uint256 _id) external onlyAuthorized {
        require(ticketData[_id].isValid, "Invalid ticket");
        ticketData[_id].isBoarded = true;
        emit TicketBoarded(_id);
    }

    // ─── TRANSFER GUARD — wallet bound ────────────────────────────────
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) {
            require(
                msg.sender == swapContractAddress || msg.sender == owner(),
                "Tickets only transferable via SwapContract"
            );
        }
        return super._update(to, tokenId, auth);
    }

    // ─── TOKEN URI — on-chain JSON + SVG ──────────────────────────────
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        TicketMetadata memory t = ticketData[tokenId];
        string memory svg  = _buildSVG(tokenId, t);
        string memory json = _buildJSON(tokenId, t, svg);
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    // ── JSON builder ──────────────────────────────────────────────────
    function _buildJSON(uint256 id, TicketMetadata memory t, string memory svg)
        internal pure returns (string memory)
    {
        return string(abi.encodePacked(
            '{"name":"IRCTC Ticket #', id.toString(), ' PNR:', t.pnr, '",',
            '"description":"Blockchain railway ticket. Train:', t.trainNumber,
            ' ', t.fromStation, ' to ', t.toStation, '",',
            '"image":"data:image/svg+xml;base64,', Base64.encode(bytes(svg)), '",',
            '"attributes":', _buildAttrs(t), '}'
        ));
    }

    // ── Attributes builder ────────────────────────────────────────────
    function _buildAttrs(TicketMetadata memory t) internal pure returns (string memory) {
        return string(abi.encodePacked(
            '[{"trait_type":"Train","value":"', t.trainNumber, '"},',
            '{"trait_type":"From","value":"',  t.fromStation,  '"},',
            '{"trait_type":"To","value":"',    t.toStation,    '"},',
            '{"trait_type":"Class","value":"', t.seatType,     '"},',
            '{"trait_type":"Seat","value":"',  t.seatNumber.toString(), '"},',
            '{"trait_type":"PNR","value":"',   t.pnr,          '"},',
            '{"trait_type":"Valid","value":"', t.isValid ? "true":"false", '"}]'
        ));
    }

    // ── SVG: split into small pieces to avoid stack-too-deep ──────────
    function _buildSVG(uint256 id, TicketMetadata memory t) internal pure returns (string memory) {
        string memory statusColor = t.isValid  ? "#22c55e" : "#ef4444";
        string memory statusLabel = t.isValid
            ? (t.isBoarded ? "BOARDED" : "CONFIRMED")
            : "CANCELLED";

        return string(abi.encodePacked(
            _svgHeader(),
            _svgBackground(),
            _svgTitleBlock(t.trainNumber, t.trainName),
            _svgStatusBadge(statusColor, statusLabel),
            _svgRoute(t.fromStation, t.toStation),
            _svgDetails(t.seatType, t.coachNumber, t.seatNumber.toString(), _fmtDate(t.journeyDate)),
            _svgPNR(t.pnr, id.toString()),
            _svgFooter()
        ));
    }

    function _svgHeader() internal pure returns (string memory) {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="480" height="260" viewBox="0 0 480 260">'
               '<defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">'
               '<stop offset="0%" stop-color="#1e3a5f"/>'
               '<stop offset="100%" stop-color="#1e40af"/>'
               '</linearGradient></defs>';
    }

    function _svgBackground() internal pure returns (string memory) {
        return string(abi.encodePacked(
            '<rect width="480" height="260" rx="16" fill="url(#g)"/>',
            '<rect x="1" y="1" width="478" height="258" rx="15" fill="none"',
            ' stroke="rgba(255,255,255,0.15)" stroke-width="1"/>',
            '<line x1="0" y1="182" x2="480" y2="182"',
            ' stroke="rgba(255,255,255,0.2)" stroke-dasharray="6,4" stroke-width="1"/>',
            '<circle cx="0"   cy="182" r="12" fill="#0f172a"/>',
            '<circle cx="480" cy="182" r="12" fill="#0f172a"/>'
        ));
    }

    function _svgTitleBlock(string memory trainNum, string memory trainName)
        internal pure returns (string memory)
    {
        return string(abi.encodePacked(
            '<text x="22" y="40" font-family="Arial,sans-serif" font-size="10"',
            ' fill="rgba(255,255,255,0.5)" letter-spacing="2">BLOCKCHAIN RAILWAY TICKET</text>',
            '<text x="22" y="68" font-family="Arial,sans-serif" font-size="20"',
            ' font-weight="bold" fill="white">', trainName, '</text>',
            '<text x="22" y="86" font-family="Arial,sans-serif" font-size="12"',
            ' fill="#93c5fd">Train No: ', trainNum, '</text>'
        ));
    }

    function _svgStatusBadge(string memory color, string memory label)
        internal pure returns (string memory)
    {
        return string(abi.encodePacked(
            '<rect x="354" y="26" width="102" height="26" rx="13"',
            ' fill="', color, '" opacity="0.2"/>',
            '<rect x="354" y="26" width="102" height="26" rx="13"',
            ' fill="none" stroke="', color, '" stroke-width="1"/>',
            '<text x="405" y="43" font-family="Arial,sans-serif" font-size="10"',
            ' font-weight="bold" fill="', color, '" text-anchor="middle">', label, '</text>'
        ));
    }

    function _svgRoute(string memory from, string memory to)
        internal pure returns (string memory)
    {
        return string(abi.encodePacked(
            '<text x="22" y="122" font-family="Arial,sans-serif" font-size="26"',
            ' font-weight="bold" fill="white">', from, '</text>',
            '<text x="240" y="122" font-family="Arial,sans-serif" font-size="18"',
            ' fill="#93c5fd" text-anchor="middle">&#8594;</text>',
            '<text x="458" y="122" font-family="Arial,sans-serif" font-size="26"',
            ' font-weight="bold" fill="white" text-anchor="end">', to, '</text>'
        ));
    }

    function _svgDetails(
        string memory cls, string memory coach,
        string memory seat, string memory date
    ) internal pure returns (string memory) {
        return string(abi.encodePacked(
            '<text x="22"  y="152" font-family="Arial,sans-serif" font-size="10"',
            ' fill="rgba(255,255,255,0.5)">DATE</text>',
            '<text x="22"  y="168" font-family="Arial,sans-serif" font-size="12"',
            ' font-weight="bold" fill="white">', date, '</text>',
            '<text x="170" y="152" font-family="Arial,sans-serif" font-size="10"',
            ' fill="rgba(255,255,255,0.5)">CLASS</text>',
            '<text x="170" y="168" font-family="Arial,sans-serif" font-size="12"',
            ' font-weight="bold" fill="white">', cls, '</text>',
            '<text x="260" y="152" font-family="Arial,sans-serif" font-size="10"',
            ' fill="rgba(255,255,255,0.5)">SEAT</text>',
            '<text x="260" y="168" font-family="Arial,sans-serif" font-size="12"',
            ' font-weight="bold" fill="white">', coach, '-', seat, '</text>'
        ));
    }

    function _svgPNR(string memory pnr, string memory id)
        internal pure returns (string memory)
    {
        return string(abi.encodePacked(
            '<text x="22" y="210" font-family="Arial,sans-serif" font-size="10"',
            ' fill="rgba(255,255,255,0.5)">PNR NUMBER</text>',
            '<text x="22" y="232" font-family="monospace,Arial" font-size="18"',
            ' font-weight="bold" fill="#fbbf24" letter-spacing="3">', pnr, '</text>',
            '<text x="458" y="232" font-family="Arial,sans-serif" font-size="10"',
            ' fill="rgba(255,255,255,0.4)" text-anchor="end">NFT #', id, '</text>'
        ));
    }

    function _svgFooter() internal pure returns (string memory) {
        return string(abi.encodePacked(
            '<text x="240" y="252" font-family="Arial,sans-serif" font-size="8"',
            ' fill="rgba(255,255,255,0.2)" text-anchor="middle">',
            'Secured by Blockchain | Tamper-Proof | IRCTC Blockchain v2.0',
            '</text></svg>'
        ));
    }

    // ── Date formatter (no external libs needed) ──────────────────────
    function _fmtDate(uint256 ts) internal pure returns (string memory) {
        if (ts == 0) return "TBD";
        uint256 z   = ts / 86400 + 719468;
        uint256 era = z / 146097;
        uint256 doe = z - era * 146097;
        uint256 yoe = (doe - doe/1460 + doe/36524 - doe/146096) / 365;
        uint256 y   = yoe + era * 400;
        uint256 doy = doe - (365*yoe + yoe/4 - yoe/100);
        uint256 mp  = (5*doy + 2)/153;
        uint256 d   = doy - (153*mp+2)/5 + 1;
        uint256 m   = mp < 10 ? mp + 3 : mp - 9;
        if (m <= 2) y++;
        string memory dd = d < 10 ? string(abi.encodePacked("0", d.toString())) : d.toString();
        string memory mm = m < 10 ? string(abi.encodePacked("0", m.toString())) : m.toString();
        return string(abi.encodePacked(dd, "/", mm, "/", y.toString()));
    }

    // ─── VIEWS ────────────────────────────────────────────────────────
    function getTicketByPNR(string memory _pnr)
        external view returns (TicketMetadata memory, uint256)
    {
        uint256 id = pnrToTokenId[_pnr];
        require(id != 0, "PNR not found");
        return (ticketData[id], id);
    }

    function totalSupply() external view returns (uint256) { return _tokenIdCounter; }
}
