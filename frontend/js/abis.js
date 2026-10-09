import { parseAbi } from "https://esm.sh/viem@2";

// Include errors from the auction, NFT and ERC20 calls so viem can decode reverts.
const CONTRACT_ERRORS = [
  "error ERC721EnumerableForbiddenBatchMint()",
  "error ERC721IncorrectOwner(address sender, uint256 tokenId, address owner)",
  "error ERC721InsufficientApproval(address operator, uint256 tokenId)",
  "error ERC721InvalidApprover(address approver)",
  "error ERC721InvalidOperator(address operator)",
  "error ERC721InvalidOwner(address owner)",
  "error ERC721InvalidReceiver(address receiver)",
  "error ERC721InvalidSender(address sender)",
  "error ERC721NonexistentToken(uint256 tokenId)",
  "error ERC721OutOfBoundsIndex(address owner, uint256 index)",
  "error AddressEmptyCode(address target)",
  "error BidBelowStartingPrice()",
  "error BidNotHigherThanHighest()",
  "error ERC1967InvalidImplementation(address implementation)",
  "error ERC1967NonPayable()",
  "error FailedCall()",
  "error InvalidInitialization()",
  "error NotInitializing()",
  "error OwnableInvalidOwner(address owner)",
  "error OwnableUnauthorizedAccount(address account)",
  "error SafeERC20FailedOperation(address token)",
  "error UUPSUnauthorizedCallContext()",
  "error UUPSUnsupportedProxiableUUID(bytes32 slot)",
  "error ERC20InsufficientBalance(address sender, uint256 balance, uint256 needed)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error ERC20InvalidSender(address sender)",
  "error ERC20InvalidReceiver(address receiver)",
  "error ERC20InvalidApprover(address approver)",
  "error ERC20InvalidSpender(address spender)"
];
export const ERROR_ABI = parseAbi(CONTRACT_ERRORS);

export const NFT_ABI = parseAbi([
  ...CONTRACT_ERRORS,
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function mint(address to) returns (uint256)",
  "function burn(uint256 id)",
  "function GetTokenIdsOfOwner() view returns (uint256[])"
]);

export const AUCTION_ABI = parseAbi([
  ...CONTRACT_ERRORS,
  "function bid(uint256 auctionId_, uint256 amount) payable",
  "function end(uint256 _auctionId)",
  "function settled(uint256) view returns (bool)",
  "function upgradeToAndCall(address newImplementation, bytes data) payable",
  "function auctionId() view returns (uint256)",
  "function auctions(uint256) view returns (address nft, uint256 nftId, address seller, uint256 startingTime, address highestBidder, uint256 startingPriceInDollar, uint256 duration, address paymentToken, uint256 highestBid, uint256 highestBidInDollar, address highestBidToken)",
  "function getVersion() pure returns (string)",
  "function isEnded(uint256 _auctionId) view returns (bool)",
  "function start(address seller, uint256 nftId, address nft, uint256 startingPriceInDollar, uint256 duration, address paymentToken)",
  "function transferOwnership(address newOwner)",
  "function owner() view returns (address)",
  "function setTokenOracle(address token, address oracle)",
  "function getTokenOracle(address token) view returns (address)",
  "function tokenToOracle(address token) view returns (address)",
  "function getPriceInDollar(address token) view returns (uint256)"
]);

export const NFT_APPROVAL_ABI = parseAbi([
  ...CONTRACT_ERRORS,
  "function approve(address to, uint256 tokenId)",
  "function ownerOf(uint256 tokenId) view returns (address)"
]);

export const TOKEN_DECIMALS_ABI = parseAbi([
  ...CONTRACT_ERRORS,
  "function decimals() view returns (uint8)"
]);

export const ERC20_ABI = parseAbi([
  ...CONTRACT_ERRORS,
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
]);
