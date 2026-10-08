import assert from "node:assert/strict";
import { network } from "hardhat";
import { getAddress, zeroAddress } from "viem";
import fs from "node:fs";

const { viem } = await network.create();
const addresses = JSON.parse(fs.readFileSync("ignition/deployments/meta-nft-auction-sepolia/deployed_addresses.json", "utf8"));
const address = addresses["MetaNFTAuctionModule#Auction"];
const auction = await viem.getContractAt("MetaNFTAuctionUUPS", address);
assert.equal(getAddress(await auction.read.owner()), getAddress("0xEeBD193Cb96D61E93D22FdAeD12313E2BeC8ef6c"));
assert.equal(await auction.read.tokenToOracle([zeroAddress]), zeroAddress);
console.log("Verified proxy:", address);
console.log("Owner:", await auction.read.owner());
