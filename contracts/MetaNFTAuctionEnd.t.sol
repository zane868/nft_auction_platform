// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {MetaNFTAuctionUUPS} from "./MetaNFTAuctionUUPS.sol";
import {MetaNFT} from "./MetaNFT.sol";

contract EndTestToken is ERC20 {
    constructor() ERC20("Test", "TST") {}
    function mint(address to, uint amount) external { _mint(to, amount); }
}
contract EndTestFeed {
    function latestRoundData() external view returns (uint80, int256, uint, uint, uint80) {
        return (1, 2000e8, block.timestamp, block.timestamp, 1);
    }
}
contract MetaNFTAuctionEndTest is Test {
    MetaNFTAuctionUUPS auction;
    MetaNFT nft;
    EndTestToken token;
    address seller = address(0x100);
    address bidder = address(0x200);
    address stranger = address(0x300);

    function setUp() public {
        MetaNFTAuctionUUPS implementation = new MetaNFTAuctionUUPS();
        auction = MetaNFTAuctionUUPS(address(new ERC1967Proxy(address(implementation), abi.encodeCall(implementation.initialize, (address(this))))));
        nft = new MetaNFT();
        token = new EndTestToken();
        nft.mint(seller);
        vm.prank(seller);
        nft.approve(address(auction), 1);
        auction.start(seller, 1, address(nft), 100, 3600, address(token));
        EndTestFeed feed = new EndTestFeed();
        auction.setTokenOracle(address(0), address(feed));
        auction.setTokenOracle(address(token), address(feed));
        vm.deal(bidder, 1 ether);
    }
    function ethBid() internal {
        vm.prank(bidder);
        auction.bid{value: 0.1 ether}(0, 0.1 ether);
    }
    function testOwnerEndsEarlyWithEthBid() public {
        ethBid();
        auction.end(0);
        assertEq(nft.ownerOf(1), bidder);
        assertEq(seller.balance, 0.1 ether);
        assertTrue(auction.settled(0));
        assertTrue(auction.isEnded(0));
        vm.expectRevert(bytes("already settled"));
        auction.end(0);
        vm.prank(stranger);
        vm.expectRevert(bytes("ended"));
        auction.bid(0, 1);
    }
    function testOwnerEndsEarlyWithoutBidsReturnsNft() public {
        auction.end(0);
        assertEq(nft.ownerOf(1), seller);
        assertTrue(auction.settled(0));
    }
    function testNonOwnerCannotEndEarly() public {
        vm.prank(stranger);
        vm.expectRevert(bytes("not ended"));
        auction.end(0);
        assertFalse(auction.settled(0));
        assertEq(nft.ownerOf(1), address(auction));
    }
    function testAnyoneEndsAfterExpiry() public {
        ethBid();
        vm.warp(block.timestamp + 3600);
        vm.prank(stranger);
        auction.end(0);
        assertEq(nft.ownerOf(1), bidder);
        assertEq(seller.balance, 0.1 ether);
    }
    function testExpiredAuctionWithoutBidsReturnsNft() public {
        vm.warp(block.timestamp + 3600);
        vm.prank(stranger);
        auction.end(0);
        assertEq(nft.ownerOf(1), seller);
    }
    function testOwnerEndsEarlyWithTokenBid() public {
        token.mint(bidder, 0.1 ether);
        vm.startPrank(bidder);
        token.approve(address(auction), 0.1 ether);
        auction.bid(0, 0.1 ether);
        vm.stopPrank();
        auction.end(0);
        assertEq(token.balanceOf(seller), 0.1 ether);
        assertEq(nft.ownerOf(1), bidder);
    }
    function testUnknownAuctionReverts() public {
        vm.expectRevert(bytes("not started"));
        auction.end(1);
    }
}
