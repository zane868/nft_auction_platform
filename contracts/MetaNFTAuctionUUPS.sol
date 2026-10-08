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

    function _authorizeUpgrade(
        address newImplementation
    ) internal virtual override onlyOwner {}

    constructor() {
        _disableInitializers();
    }

    function initialize(address admin_) external initializer {
        __Ownable_init(admin_);
    }

    function setTokenOracle(address token, address oracle) external onlyOwner {
        require(oracle != address(0), "invalid oracle");
        tokenToOracle[token] = oracle;
    }

    function getTokenOracle(address token) external view returns (address) {
        return tokenToOracle[token];
    }

    function getPriceInDollar(
        address token,
        uint256 amount
    ) public view returns (uint256) {
        address oracle = tokenToOracle[token];
        require(oracle != address(0), "oracle not set");
        AggregatorV3Interface priceFeed = AggregatorV3Interface(oracle);
        (, int256 price, , , ) = priceFeed.latestRoundData();
        uint8 decimals = priceFeed.decimals();
        return (amount * uint256(price)) / (10 ** decimals);
    }
}
