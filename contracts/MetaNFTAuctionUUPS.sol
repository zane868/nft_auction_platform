// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.34;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {UUPSUpgradeable} from "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/shared/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import {OwnableUpgradeable} from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

contract MetaNFTAuctionUUPS is
    Initializable,
    UUPSUpgradeable,
    OwnableUpgradeable
{
    struct Auction {
        IERC721 nft;
        uint256 nftId;
        address payable seller;
        uint256 startingTime;
        address highestBidder;
        uint256 startingPriceInDollar;
        uint256 duration;
        IERC20 paymentToken;
        uint256 highestBid;
        uint256 highestBidInDollar;
        address highestBidToken;
    }

    //代币和语言机的映射
    mapping(address => address) public tokenToOracle;

    //拍卖场次和拍卖信息的映射
    mapping(uint => Auction) public auctions;

    //开始拍卖
    event StartBid(address indexed seller, uint256 startingBid);
    event Bid(address indexed sender, uint256 amount);
    event EndBid(uint256 indexed auctionId);

    //拍卖场次的自增id
    uint256 public auctionId;

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
        uint256 nftId,
        address nft,
        uint256 startingPriceInDollar,
        uint256 duration,
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

    function isEnded(uint _auctionId) public view returns (bool) {
        Auction storage auction = auctions[_auctionId];
        return block.timestamp >= auction.startingTime + auction.duration;
    }

    function setTokenOracle(address token, address oracle) external onlyOwner {
        require(oracle != address(0), "invalid oracle");
        tokenToOracle[token] = oracle;
    }

    function getTokenOracle(address token) external view returns (address) {
        return tokenToOracle[token];
    }

    function getPriceInDollar(address token) public view returns (uint256) {
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
        uint256 amount, //金额
        uint256 amountDecimals, //精度
        uint256 price //具体价格
    ) internal pure returns (uint256) {
        // amount is in smallest units; convert to USD using price decimals.
        uint256 scale = 10 ** amountDecimals;
        uint256 usd = (amount * price) / scale;
        return usd;
    }

    function getVersion() external pure virtual returns (string memory) {
        return "MetaNFTAuctionUUPS V1";
    }
}
