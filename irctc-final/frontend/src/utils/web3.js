import { ethers } from "ethers";

export async function connectWallet() {
  if (!window.ethereum) {
    alert("MetaMask not found! Install from https://metamask.io");
    return null;
  }
  try {
    await window.ethereum.request({ method: "eth_requestAccounts" });
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();
    const address  = await signer.getAddress();
    return { provider, signer, address };
  } catch (err) {
    console.error("Wallet connection failed:", err);
    throw err;
  }
}

export async function switchToLocalhost() {
  if (!window.ethereum) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x7a69" }],
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x7a69", chainName: "Hardhat Localhost",
          rpcUrls: ["http://127.0.0.1:8545"],
          nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
        }],
      });
    }
  }
}

export async function switchToAmoy() {
  if (!window.ethereum) return;
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: "0x13882" }],
    });
  } catch (err) {
    if (err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [{
          chainId: "0x13882", chainName: "Polygon Amoy Testnet",
          rpcUrls: ["https://rpc-amoy.polygon.technology"],
          nativeCurrency: { name: "MATIC", symbol: "MATIC", decimals: 18 },
          blockExplorerUrls: ["https://amoy.polygonscan.com/"],
        }],
      });
    }
  }
}

export function shortenAddress(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

export async function getBalance(address) {
  if (!window.ethereum || !address) return "0";
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    const bal = await provider.getBalance(address);
    return parseFloat(ethers.formatEther(bal)).toFixed(4);
  } catch { return "0"; }
}
