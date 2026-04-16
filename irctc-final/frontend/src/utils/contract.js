import { ethers } from "ethers";

let addresses  = {};
let BookingV1ABI  = [];
let BookingV2ABI  = [];
let NFTABI        = [];
let WLQueueABI    = [];
let SwapABI       = [];
let PricingABI    = [];
let MultisigABI   = [];

try { addresses    = require("../abi/addresses.json");             } catch {}
try { BookingV1ABI = require("../abi/BookingContract.json");       } catch {}
try { BookingV2ABI = require("../abi/BookingContractV2.json");     } catch {}
try { NFTABI       = require("../abi/NFTTicketContract.json");     } catch {}
try { WLQueueABI   = require("../abi/WLQueueContract.json");       } catch {}
try { SwapABI      = require("../abi/SwapContract.json");          } catch {}
try { PricingABI   = require("../abi/DynamicPricingContract.json");} catch {}
try { MultisigABI  = require("../abi/MultisigAdminWallet.json");   } catch {}

export { addresses, BookingV1ABI, BookingV2ABI, NFTABI, WLQueueABI, SwapABI, PricingABI, MultisigABI };

export function getBookingV1(signer) {
  if (!addresses.BookingContract) throw new Error("BookingContract not deployed");
  return new ethers.Contract(addresses.BookingContract, BookingV1ABI, signer);
}

export function getBookingV2(signer) {
  if (!addresses.BookingContractV2) throw new Error("BookingContractV2 not deployed");
  return new ethers.Contract(addresses.BookingContractV2, BookingV2ABI, signer);
}

export function getNFT(signer) {
  if (!addresses.NFTTicketContract) throw new Error("NFTTicketContract not deployed");
  return new ethers.Contract(addresses.NFTTicketContract, NFTABI, signer);
}

export function getWLQueue(signer) {
  if (!addresses.WLQueueContract) throw new Error("WLQueueContract not deployed");
  return new ethers.Contract(addresses.WLQueueContract, WLQueueABI, signer);
}

export function getSwap(signer) {
  if (!addresses.SwapContract) throw new Error("SwapContract not deployed");
  return new ethers.Contract(addresses.SwapContract, SwapABI, signer);
}

export function getPricing(signer) {
  if (!addresses.DynamicPricingContract) throw new Error("DynamicPricingContract not deployed");
  return new ethers.Contract(addresses.DynamicPricingContract, PricingABI, signer);
}

export function getMultisig(signer) {
  if (!addresses.MultisigAdminWallet) throw new Error("MultisigAdminWallet not deployed");
  return new ethers.Contract(addresses.MultisigAdminWallet, MultisigABI, signer);
}
