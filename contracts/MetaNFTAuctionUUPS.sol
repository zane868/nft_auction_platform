// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract MetaNFTAuctionUUPS is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable
{
    using SafeERC20 for IERC20;

    struct Auction {
        IERC721 nft;
        uint nftId;
        address payable seller;
        uint startingTime;
        address highestBidder;
        uint startingPriceInDollar;
        uint duration;
        IERC20 paymentToken;
        uint highestBid;
        uint highestBidInDollar;
        address highestBidToken;
    }

    //代币和语言机的映射
    mapping(address => address) public tokenToOracle;

    //拍卖场次和拍卖信息的映射
    mapping(uint => Auction) public auctions;

    //开始拍卖
    event StartBid(address indexed seller, uint startingBid);
    event Bid(address indexed sender, uint amount);
    event EndBid(uint indexed auctionId);

    //错误定义
    error BidBelowStartingPrice();
    error BidNotHigherThanHighest();
    //拍卖场次的自增id
    uint public auctionId;

    // Append new storage to preserve the layout of deployed UUPS proxies.
    mapping(uint => bool) public settled;

    function _authorizeUpgrade(
        address newImplementation
    ) internal virtual override onlyOwner {}

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin_) external initializer {
        __Ownable_init(admin_);
    }

    // 卖家发起拍卖
    function start(
        address seller,
        uint nftId,
        address nft,
        uint startingPriceInDollar,
        uint duration,
        address paymentToken
    ) external onlyOwner {
        require(nft != address(0), "invalid nft");
        require(duration >= 30, "invalid duration");
        require(paymentToken != address(0), "invalid payment token");
        Auction storage auction = auctions[auctionId];
        auction.nft = IERC721(nft);
        auction.nftId = nftId;
        auction.seller = payable(seller);
        auction.startingTime = block.timestamp;
        auction.startingPriceInDollar = startingPriceInDollar * 10 ** 8;
        auction.duration = duration;
        auction.paymentToken = IERC20(paymentToken);
        auction.highestBid = 0;
        auction.highestBidder = address(0);
        auction.highestBidInDollar = 0;
        auction.highestBidToken = address(0);
        IERC721(nft).transferFrom(seller, address(this), nftId);
        auctionId++;
        emit StartBid(_msgSender(), auctionId);
    }

    function ethBid(uint amount) internal returns (uint bidPrice) {
        require(amount == msg.value, "amount mismatch");
        uint price = getPriceInDollar(address(0));
        return toUsd(msg.value, 18, price);
    }

    function erc20Bid(
        Auction storage auction,
        uint amount
    ) internal returns (uint bidPrice) {
        require(amount > 0, "invalid amount");
        uint price = getPriceInDollar(address(auction.paymentToken));
        uint8 tokenDecimals = IERC20Metadata(address(auction.paymentToken))
            .decimals();
        bidPrice = toUsd(amount, tokenDecimals, price);
        IERC20(address(auction.paymentToken)).transferFrom(
            msg.sender,
            address(this),
            amount
        );
        return bidPrice;
    }

    function refundEth(Auction storage auction, uint refundAmount) internal {
        (bool success, ) = payable(auction.highestBidder).call{
            value: refundAmount
        }("");
        require(success, "ETH refund failed");
    }

    function refundERC20(Auction storage auction, uint refundAmount) internal {
        IERC20(address(auction.paymentToken)).transfer(
            auction.highestBidder,
            refundAmount
        );
    }

    function refund(Auction storage auction) internal {
        bool self = auction.highestBidder != msg.sender;
        bool address0 = auction.highestBidder != address(0);
        //有人出最高价，并且不是自己出价，才退钱
        if (self && address0) {
            uint refundAmount = auction.highestBid;

            if (refundAmount <= 0) {
                return;
            }
            if (auction.highestBidToken == address(0)) {
                refundEth(auction, refundAmount);
            } else {
                refundERC20(auction, refundAmount);
            }
        }
    }

    function checkBidPrice(
        Auction storage auction,
        uint bidPrice
    ) internal view {
        if (bidPrice <= auction.startingPriceInDollar) {
            revert BidBelowStartingPrice();
        }

        if (bidPrice <= auction.highestBidInDollar) {
            revert BidNotHigherThanHighest();
        }
    }

    // 买家竞价
    function bid(uint auctionId_, uint amount) external payable {
        Auction storage auction = auctions[auctionId_];
        require(auction.startingTime > 0, "not started");
        require(!isEnded(auctionId_), "ended");
        uint bidPrice;
        bool isEthBid = msg.value > 0;

        if (isEthBid) {
            bidPrice = ethBid(amount);
        } else {
            bidPrice = erc20Bid(auction, amount);
        }

        checkBidPrice(auction, bidPrice);

        //出价完成后，退回上一个最高价的出价者
        refund(auction);

        if (isEthBid) {
            auction.highestBid = msg.value;
            auction.highestBidToken = address(0);
        } else {
            auction.highestBid = amount;
            auction.highestBidToken = address(auction.paymentToken);
        }

        auction.highestBidder = _msgSender();
        auction.highestBidInDollar = bidPrice;
        emit Bid(_msgSender(), msg.value);
    }

    function isEnded(uint _auctionId) public view returns (bool) {
        Auction storage auction = auctions[_auctionId];
        return settled[_auctionId] || block.timestamp >= auction.startingTime + auction.duration;
    }

    // Owner can settle early; all other callers must wait for expiry.
    function end(uint _auctionId) external {
        Auction storage auction = auctions[_auctionId];
        require(auction.startingTime > 0, "not started");
        require(!settled[_auctionId], "already settled");
        require(_msgSender() == owner() || isEnded(_auctionId), "not ended");

        address recipient = auction.highestBidder == address(0)
            ? auction.seller
            : auction.highestBidder;
        uint payout = auction.highestBid;
        address paymentToken = auction.highestBidToken;

        // Close the auction before any external call.
        settled[_auctionId] = true;
        auction.highestBid = 0;
        auction.nft.transferFrom(address(this), recipient, auction.nftId);

        if (payout > 0) {
            if (paymentToken == address(0)) {
                (bool success, ) = auction.seller.call{value: payout}("");
                require(success, "ETH payout failed");
            } else {
                IERC20(paymentToken).safeTransfer(auction.seller, payout);
            }
        }
        emit EndBid(_auctionId);
    }

    function setTokenOracle(address token, address oracle) external onlyOwner {
        require(oracle != address(0), "invalid oracle");
        tokenToOracle[token] = oracle;
    }

    function getTokenOracle(address token) external view returns (address) {
        return tokenToOracle[token];
    }

    function getPriceInDollar(address token) public view returns (uint) {
        address oracle = tokenToOracle[token];
        require(oracle != address(0), "oracle not set");
        AggregatorV3Interface priceFeed = AggregatorV3Interface(oracle);
        (, int256 answer, , , ) = priceFeed.latestRoundData();
        return uint(answer);
    }

    // 8位小数的usd
    //如果代币有 6 位小数，scale 就是 10⁶ = 1,000,000；
    //如果有 18 位小数，scale 就是 10¹⁸。
    function toUsd(
        uint amount, //金额
        uint amountDecimals, //精度
        uint price //具体价格
    ) internal pure returns (uint) {
        // amount is in smallest units; convert to USD using price decimals.
        uint scale = 10 ** amountDecimals;
        uint usd = (amount * price) / scale;
        return usd;
    }

    function getVersion() external pure virtual returns (string memory) {
        return "MetaNFTAuctionUUPS V1";
    }
}
