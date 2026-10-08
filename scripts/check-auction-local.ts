import assert from "node:assert/strict";
import { network } from "hardhat";
import { encodeFunctionData, getAddress } from "viem";

const { viem } = await network.create();
const owner = "0xEeBD193Cb96D61E93D22FdAeD12313E2BeC8ef6c";
const implementation = await viem.deployContract("MetaNFTAuctionUUPS");
const data = encodeFunctionData({ abi: implementation.abi, functionName: "initialize", args: [owner] });
const proxy = await viem.deployContract("AuctionProxy", [implementation.address, data]);
const auction = await viem.getContractAt("MetaNFTAuctionUUPS", proxy.address);
assert.equal(getAddress(await auction.read.owner()), getAddress(owner));
await viem.assertions.revertWithCustomError(auction.write.initialize([owner]), auction, "InvalidInitialization");
await viem.assertions.revertWithCustomError(implementation.write.initialize([owner]), implementation, "InvalidInitialization");
await viem.assertions.revertWithCustomError(auction.write.upgradeToAndCall([implementation.address, "0x"]), auction, "OwnableUnauthorizedAccount");
console.log("Passed: proxy owner, initialization guards, unauthorized upgrade rejection");
