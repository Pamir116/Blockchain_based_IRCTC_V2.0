// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

/// @title DynamicPricingContract — On-chain ticket price: distance × class × tatkal × season
contract DynamicPricingContract is Ownable {

    // 0.00002 MATIC per km base rate
    uint256 public baseRatePerKm = 20000000000000;

    uint256 public constant MULTIPLIER_SL = 100;
    uint256 public constant MULTIPLIER_3A = 150;
    uint256 public constant MULTIPLIER_2A = 200;
    uint256 public constant MULTIPLIER_1A = 300;
    uint256 public constant MULTIPLIER_CC = 120;
    uint256 public constant MULTIPLIER_2S = 80;
    uint256 public constant TATKAL_SURCHARGE = 150;
    uint256 public constant PEAK_SURCHARGE   = 120;
    uint256 public constant MIN_PRICE        = 0.001 ether;

    mapping(bytes32 => uint256) public stationDistances;

    event PriceCalculated(string from, string to, string seatClass, bool isTatkal, uint256 price);

    constructor() Ownable(msg.sender) { _seedDistances(); }

    function _seedDistances() internal {
        // Delhi (NDLS/NZM/DEE) routes
        _set("NDLS","BCT",1384);  _set("NDLS","MMCT",1384); // BCT = Mumbai Central
        _set("NZM","BCT",1400);   _set("NZM","MMCT",1400);
        _set("DEE","BDTS",1430);
        _set("NDLS","MAS",2175);  _set("NZM","MAS",2200);
        _set("NDLS","HWH",1447);  _set("NZM","HWH",1450);
        _set("NDLS","SBC",2150);  _set("NZM","SBC",2150);
        _set("NDLS","HYB",1661);  _set("NZM","HYB",1661);
        _set("NDLS","PNBE",1001); _set("NDLS","LKO",498);
        _set("NDLS","JP",308);    _set("NDLS","ADI",935);
        _set("NDLS","BPL",702);   _set("NDLS","SDAH",1453);
        _set("NDLS","CDG",243);   _set("NDLS","AGC",195);
        _set("NDLS","ASR",447);   _set("NDLS","CNB",440);
        _set("NDLS","GKP",762);   _set("NDLS","DBG",1082);
        // Mumbai routes
        _set("BCT","MAS",1279);   _set("MMCT","MAS",1279);
        _set("BCT","SBC",1006);   _set("MMCT","SBC",1006);
        _set("BCT","PUNE",192);   _set("MMCT","PUNE",192);
        _set("BCT","HYB",711);    _set("BDTS","DEE",1430);
        // South India
        _set("MAS","SBC",362);    _set("MAS","HYB",794);
        _set("SBC","HYB",574);    _set("MAS","ERS",640);
        // East India
        _set("HWH","PNBE",530);   _set("HWH","SDAH",8);
        // Jaipur routes
        _set("JP","BCT",1207);    _set("JP","MMCT",1207);
        _set("JP","BDTS",1220);   _set("JP","PUNE",1399);
        _set("JP","SBC",2060);
    }

    function _set(string memory a, string memory b, uint256 km) internal {
        stationDistances[_key(a,b)] = km;
        stationDistances[_key(b,a)] = km;
    }

    function setDistance(string memory a, string memory b, uint256 km) external onlyOwner { _set(a,b,km); }
    function setBaseRate(uint256 _rate) external onlyOwner { baseRatePerKm = _rate; }

    function previewPrice(
        string memory _from, string memory _to,
        string memory _class, bool _tatkal, uint256 _date
    ) external view returns (uint256 price, uint256 distKm) {
        distKm = stationDistances[_key(_from, _to)];
        if (distKm == 0) return (0, 0);
        price = baseRatePerKm * distKm;
        price = (price * _classMultiplier(_class)) / 100;
        if (_tatkal)            price = (price * TATKAL_SURCHARGE) / 100;
        if (_isPeak(_date))     price = (price * PEAK_SURCHARGE)   / 100;
        if (price < MIN_PRICE)  price = MIN_PRICE;
    }

    function calculatePrice(
        string memory _from, string memory _to,
        string memory _class, bool _tatkal, uint256 _date
    ) external returns (uint256 price) {
        uint256 distKm = stationDistances[_key(_from, _to)];
        require(distKm > 0, "Route not found");
        price = baseRatePerKm * distKm;
        price = (price * _classMultiplier(_class)) / 100;
        if (_tatkal)           price = (price * TATKAL_SURCHARGE) / 100;
        if (_isPeak(_date))    price = (price * PEAK_SURCHARGE)   / 100;
        if (price < MIN_PRICE) price = MIN_PRICE;
        emit PriceCalculated(_from, _to, _class, _tatkal, price);
    }

    function getDistance(string memory a, string memory b) external view returns (uint256) {
        return stationDistances[_key(a,b)];
    }

    function _key(string memory a, string memory b) internal pure returns (bytes32) {
        return keccak256(bytes(a)) < keccak256(bytes(b))
            ? keccak256(abi.encodePacked(a,"-",b))
            : keccak256(abi.encodePacked(b,"-",a));
    }

    function _classMultiplier(string memory c) internal pure returns (uint256) {
        bytes32 h = keccak256(bytes(c));
        if (h == keccak256("1A"))  return MULTIPLIER_1A;
        if (h == keccak256("2A"))  return MULTIPLIER_2A;
        if (h == keccak256("3A"))  return MULTIPLIER_3A;
        if (h == keccak256("CC"))  return MULTIPLIER_CC;
        if (h == keccak256("2S"))  return MULTIPLIER_2S;
        return MULTIPLIER_SL;
    }

    function _isPeak(uint256 ts) internal pure returns (bool) {
        uint256 month = ((ts / 86400 + 4) % 365) / 30 + 1;
        return (month >= 10 || month <= 1);
    }
}
