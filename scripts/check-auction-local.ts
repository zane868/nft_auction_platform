import assert from "node:assert/strict";
import { network } from "hardhat";
import { encodeFunctionData, getAddress } from "viem";

const { viem, networkHelpers } = await network.create();
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

// Validate the newly added auction flow with an owner-controlled local proxy.
const [seller] = await viem.getWalletClients();
const auctionProxy = await viem.deployContract("AuctionProxy", [implementation.address,
  encodeFunctionData({ abi: implementation.abi, functionName: "initialize", args: [seller.account.address] }),
]);
const localAuction = await viem.getContractAt("MetaNFTAuctionUUPS", auctionProxy.address);
const nft = await viem.deployContract("MetaNFT");
await nft.write.mint([seller.account.address]);
await nft.write.approve([auctionProxy.address, 1n]);
await localAuction.write.start([seller.account.address, 1n, nft.address, 100n, 30n, nft.address]);
assert.equal(await localAuction.read.auctionId(), 1n);
assert.equal(getAddress(await nft.read.ownerOf([1n])), getAddress(auctionProxy.address));
const firstAuction = await localAuction.read.auctions([0n]);
assert.equal(firstAuction[5], 100n * 10n ** 8n);
assert.equal(await localAuction.read.isEnded([0n]), false);
await networkHelpers.time.increase(30);
assert.equal(await localAuction.read.isEnded([0n]), true);
console.log("Passed: auction creation, NFT custody, USD precision and initial time status");

const replacement = await viem.deployContract("MetaNFTAuctionUUPS");
const savedOwner = await localAuction.read.owner();
const savedAuction = await localAuction.read.auctions([0n]);
await localAuction.write.upgradeToAndCall([replacement.address, "0x"]);
assert.equal(await localAuction.read.owner(), savedOwner);
assert.equal(await localAuction.read.auctionId(), 1n);
assert.deepEqual(await localAuction.read.auctions([0n]), savedAuction);
assert.equal(getAddress(await nft.read.ownerOf([1n])), getAddress(auctionProxy.address));
console.log("Passed: in-place upgrade preserves owner, auction record and NFT custody");
