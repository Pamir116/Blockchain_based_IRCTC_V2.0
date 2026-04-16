require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun", viaIR: true },
  },
  networks: {
    hardhat: {
      chainId: 31337,
      hardfork: "cancun",
      mining: {
        auto: true,          // still mine instantly on every transaction
        interval: 600000,    // also mine a new block every 10 minutes (600,000 ms)
      },
    },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
    mumbai: {
      url:      process.env.POLYGON_RPC_URL || "https://rpc-mumbai.maticvigil.com",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId:  80001,
    },
    amoy: {
      url:      "https://rpc-amoy.polygon.technology",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
      chainId:  80002,
    },
  },
};
