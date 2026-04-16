// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title MultisigAdminWallet — 2-of-3 multisig, no single corrupt admin
contract MultisigAdminWallet {

    uint256 public constant REQUIRED = 2;

    address[3] public owners;
    mapping(address => bool) public isOwner;

    struct Tx {
        address target;
        bytes   data;
        uint256 value;
        bool    executed;
        uint256 sigCount;
        string  description;
        uint256 createdAt;
    }

    Tx[] public transactions;
    mapping(uint256 => mapping(address => bool)) public hasSigned;

    event Submitted(uint256 indexed txId, address indexed by, string desc);
    event Signed(uint256 indexed txId, address indexed by);
    event Executed(uint256 indexed txId);
    event Revoked(uint256 indexed txId, address indexed by);

    modifier onlyOwner()          { require(isOwner[msg.sender],       "Not owner");      _; }
    modifier exists(uint256 id)   { require(id < transactions.length,  "No such tx");     _; }
    modifier notDone(uint256 id)  { require(!transactions[id].executed,"Already done");   _; }
    modifier notSigned(uint256 id){ require(!hasSigned[id][msg.sender],"Already signed"); _; }

    constructor(address o1, address o2, address o3) {
        require(o1 != address(0) && o2 != address(0) && o3 != address(0), "Zero address");
        require(o1 != o2 && o2 != o3 && o1 != o3, "Duplicate owners");
        owners[0] = o1; owners[1] = o2; owners[2] = o3;
        isOwner[o1] = true; isOwner[o2] = true; isOwner[o3] = true;
    }

    function submitTransaction(address _target, bytes memory _data, uint256 _value, string memory _desc)
        external onlyOwner returns (uint256 txId)
    {
        txId = transactions.length;
        transactions.push(Tx({ target: _target, data: _data, value: _value,
                                executed: false, sigCount: 0,
                                description: _desc, createdAt: block.timestamp }));
        emit Submitted(txId, msg.sender, _desc);
        _sign(txId);
    }

    function signTransaction(uint256 id)
        external onlyOwner exists(id) notDone(id) notSigned(id)
    { _sign(id); }

    function _sign(uint256 id) internal {
        hasSigned[id][msg.sender] = true;
        transactions[id].sigCount++;
        emit Signed(id, msg.sender);
        if (transactions[id].sigCount >= REQUIRED) _execute(id);
    }

    function _execute(uint256 id) internal {
        Tx storage t = transactions[id];
        require(!t.executed,           "Already executed");
        require(t.sigCount >= REQUIRED,"Not enough sigs");
        t.executed = true;
        (bool ok, bytes memory ret) = t.target.call{value: t.value}(t.data);
        require(ok, string(abi.encodePacked("Exec failed: ", ret)));
        emit Executed(id);
    }

    function revokeSignature(uint256 id)
        external onlyOwner exists(id) notDone(id)
    {
        require(hasSigned[id][msg.sender], "Not signed");
        hasSigned[id][msg.sender] = false;
        transactions[id].sigCount--;
        emit Revoked(id, msg.sender);
    }

    function getTransaction(uint256 id) external view returns (
        address target, bytes memory data, uint256 value,
        bool executed, uint256 sigCount, string memory description, uint256 createdAt
    ) {
        Tx storage t = transactions[id];
        return (t.target, t.data, t.value, t.executed, t.sigCount, t.description, t.createdAt);
    }

    function getPendingTransactions() external view returns (uint256[] memory) {
        uint256 cnt;
        for (uint i = 0; i < transactions.length; i++) if (!transactions[i].executed) cnt++;
        uint256[] memory out = new uint256[](cnt);
        uint256 j;
        for (uint i = 0; i < transactions.length; i++) if (!transactions[i].executed) out[j++] = i;
        return out;
    }

    function transactionCount() external view returns (uint256) { return transactions.length; }

    receive() external payable {}
}
