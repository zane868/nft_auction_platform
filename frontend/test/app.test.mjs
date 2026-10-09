import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { parseAbi, decodeErrorResult, encodeErrorResult, ContractFunctionRevertedError, ContractFunctionExecutionError, isAddress, parseUnits, formatUnits, zeroAddress } from "viem";
import * as config from "../js/config.js";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const source = fs.readFileSync(new URL("../js/app.js", import.meta.url), "utf8").replace(/^import .*;\n/gm, "").replace(/export /g, "");
const abiSource = fs.readFileSync(new URL("../js/abis.js", import.meta.url), "utf8").replace(/^import .*;\n/gm, "").replace(/export /g, "");
const owner = "0xEeBD193Cb96D61E93D22FdAeD12313E2BeC8ef6c";
const other = "0x1111111111111111111111111111111111111111";
const feed = "0x2222222222222222222222222222222222222222";

async function fixture() {
  const elements = {};
  for (const match of html.matchAll(/<([\w-]+)[^>]*\bid="([^"]+)"([^>]*)>/g)) {
    elements[match[2]] = { value: match[3].match(/value="([^"]*)"/)?.[1] ?? "", disabled: false, textContent: "", tag: match[1], hidden: /\bhidden\b/.test(match[3]), attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }, events: {}, addEventListener(name, action) { this.events[name] = action; } };
  }
  const el = id => { assert.ok(elements[id], `Missing element ${id}`); return elements[id]; };
  const events = {}, writes = [], reads = [];
  const mock = { account: owner, owner, chain: 11155111, oracle: feed, price: 100000000n, tokenDecimals: 6, receipt: "success", highestBidder: zeroAddress, nftOwner: owner, ended: false, allowance: 0n, reject: false, delaySimulation: null };
  const client = {
    readContract: async call => {
      reads.push(call);
      switch (call.functionName) {
        case "owner": return mock.owner;
        case "ownerOf": return mock.nftOwner;
        case "getTokenOracle": case "tokenToOracle": return mock.oracle;
        case "getPriceInDollar": assert.equal(call.args.length, 1); return mock.price;
        case "decimals": return call.address === feed ? 8 : mock.tokenDecimals;
        case "GetTokenIdsOfOwner": return [1n];
        case "auctionId": return 1n;
        case "isEnded": return mock.ended;
        case "settled": return false;
        case "allowance": return mock.allowance;
        case "auctions": return [config.NFT_ADDRESS, 1n, owner, 1000n, mock.highestBidder, 10000000000n, 30n, config.USDC_ADDRESS, 0n, 0n, zeroAddress];
        default: return 1n;
      }
    },
    getCode: async () => "0x1234",
    estimateContractGas: async () => 100000n,
    simulateContract: async call => { if (mock.delaySimulation) await mock.delaySimulation; return { request: call }; },
    waitForTransactionReceipt: async () => {
      if (mock.receipt === "success" && writes.at(-1)?.functionName === "transferOwnership") mock.owner = writes.at(-1).args[0];
      return { status: mock.receipt, blockNumber: 1n, transactionHash: "0xhash" };
    },
  };
  const wallet = {
    requestAddresses: async () => [mock.account], getAddresses: async () => [mock.account], getChainId: async () => mock.chain,
    switchChain: async () => { mock.chain = 11155111; },
    writeContract: async call => { if (mock.reject) throw new Error("User rejected"); writes.push(call); return "0xhash"; },
  };
  const context = vm.createContext({ ...config, parseAbi, decodeErrorResult, isAddress, parseUnits, formatUnits, zeroAddress,
    document: { getElementById: el, querySelectorAll: () => Object.values(elements).filter(e => e.tag === "input") },
    window: { ethereum: { on: (name, action) => { events[name] = action; } } },
    createPublicClient: () => client, createWalletClient: () => wallet, custom: () => {}, http: () => {}, sepolia: { id: 11155111 },
  });
  vm.runInContext(abiSource + source, context);
  await new Promise(resolve => setImmediate(resolve));
  return { el, mock, events, writes, reads, context, connect: () => el("connectBtn").onclick() };
}

test("wallet lifecycle and owner-only controls", async () => {
  const { el, mock, events, connect } = await fixture();
  assert.equal(el("setOracleBtn").disabled, true);
  await connect(); assert.equal(el("upgradeBtn").disabled, false);
  mock.account = other; await events.accountsChanged([other]); assert.equal(el("upgradeBtn").disabled, true);
  mock.chain = 1; await events.chainChanged("0x1"); assert.equal(el("mintBtn").disabled, true);
  await events.disconnect(); assert.equal(el("burnBtn").disabled, true);
});

test("oracle queries and USD conversion preserve token and feed precision", async () => {
  const { el, mock, reads, context } = await fixture();
  el("priceToken").value = config.USDC_ADDRESS; el("priceAmount").value = "2.5";
  await el("priceBtn").onclick(); assert.match(el("priceResult").textContent, /价值：2.5 USD/);
  assert.match(el("toUsdDetails").textContent, /amount（最小单位）：2500000/);
  await el("oracleBtn").onclick(); assert.equal(reads.at(-1).functionName, "tokenToOracle");
  await el("getTokenOracleBtn").onclick(); assert.equal(reads.at(-1).functionName, "getTokenOracle");
  mock.oracle = zeroAddress; await el("getTokenOracleBtn").onclick(); assert.match(el("oracleResult").textContent, /未配置/);
  mock.oracle = feed; mock.price = 200000000000n; el("priceToken").value = zeroAddress; el("priceAmount").value = "0.1";
  await el("priceBtn").onclick(); assert.match(el("priceResult").textContent, /价值：200 USD/);
  assert.equal(vm.runInContext("toUsd(1n, 6, 1n)", context), 0n);
});

test("NFT approval, auction creation and queries", async () => {
  const { el, writes, connect } = await fixture(); await connect();
  el("auctionNftId").value = "1"; el("startingPrice").value = "100"; el("auctionDuration").value = "30";
  await el("approveNftBtn").onclick(); assert.equal(writes.at(-1).functionName, "approve");
  await el("startAuctionBtn").onclick(); assert.deepEqual(Array.from(writes.at(-1).args), [owner, 1n, config.NFT_ADDRESS, 100n, 30n, config.USDC_ADDRESS]);
  el("queryAuctionId").value = "0"; await el("queryAuctionBtn").onclick(); assert.match(el("auctionResult").textContent, /起拍价：100 USD/);
  el("queryAuctionId").value = "1"; await el("queryAuctionBtn").onclick(); assert.match(el("auctionResult").textContent, /不存在/);
  el("auctionPaymentToken").value = zeroAddress; const count = writes.length; await el("startAuctionBtn").onclick(); assert.equal(writes.length, count);
});

test("owner transactions, error recovery and ownership refresh", async () => {
  const { el, mock, writes, connect } = await fixture(); await connect();
  el("oracleAddress").value = feed; await el("setOracleBtn").onclick(); assert.equal(writes.at(-1).functionName, "setTokenOracle");
  await el("upgradeBtn").onclick(); assert.equal(writes.at(-1).address, config.AUCTION_ADDRESS); assert.deepEqual(Array.from(writes.at(-1).args), [config.IMPLEMENTATION_ADDRESS, "0x"]);
  el("newOwnerAddress").value = other; mock.reject = true; await el("transferOwnerBtn").onclick(); assert.match(el("status").textContent, /User rejected/); assert.equal(el("transferOwnerBtn").disabled, false);
  mock.reject = false; mock.receipt = "reverted"; await el("transferOwnerBtn").onclick(); assert.match(el("status").textContent, /执行失败/);
  mock.receipt = "success"; await el("transferOwnerBtn").onclick(); assert.equal(el("auctionOwner").textContent, other); assert.equal(el("setOracleBtn").disabled, true);
});

test("account change during simulation prevents submission and duplicate writes", async () => {
  const { el, mock, events, writes, connect } = await fixture(); await connect(); el("oracleAddress").value = feed;
  let release; mock.delaySimulation = new Promise(resolve => { release = resolve; });
  const pending = el("setOracleBtn").onclick(); await new Promise(resolve => setImmediate(resolve));
  await el("mintBtn").onclick(); assert.equal(writes.length, 0);
  mock.account = other; await events.accountsChanged([other]); release(); await pending;
  assert.equal(writes.length, 0); assert.match(el("status").textContent, /改变/);
});


test("NFT owner query works without connecting a wallet", async () => {
  const { el } = await fixture();
  assert.equal(el("queryBtn").disabled, false);
  el("queryId").value = "1";
  await el("queryBtn").onclick();
  assert.match(el("queryResult").textContent, /持有者/);
});


test("ETH bids send wei as both argument and transaction value", async () => {
  const { el, writes, connect } = await fixture(); await connect();
  el("bidAuctionId").value = "0"; el("bidCurrency").value = "eth"; el("bidAmount").value = "0.01";
  await el("bidBtn").onclick();
  assert.equal(writes.at(-1).functionName, "bid");
  assert.deepEqual(Array.from(writes.at(-1).args), [0n, 10000000000000000n]);
  assert.equal(writes.at(-1).value, 10000000000000000n);
});

test("ERC20 bids require allowance and send no ETH; same bidder is blocked", async () => {
  const { el, mock, writes, connect } = await fixture(); await connect();
  el("bidAuctionId").value = "0"; el("bidCurrency").value = "erc20"; el("bidAmount").value = "2.5";
  await el("bidBtn").onclick(); assert.equal(writes.length, 0); assert.match(el("status").textContent, /授权额度不足/);
  await el("bidApproveBtn").onclick(); assert.equal(writes.at(-1).address, config.USDC_ADDRESS); assert.deepEqual(Array.from(writes.at(-1).args), [config.AUCTION_ADDRESS, 2500000n]);
  mock.allowance = 2500000n; await el("bidBtn").onclick(); assert.equal(writes.at(-1).functionName, "bid"); assert.equal(writes.at(-1).value, 0n);
  mock.highestBidder = owner; const count = writes.length; await el("bidBtn").onclick(); assert.equal(writes.length, count); assert.match(el("status").textContent, /最高出价者/);
});


test("owner can settle early or without bids; other accounts wait for expiry", async () => {
  const { el, mock, events, writes, connect } = await fixture(); await connect();
  el("queryAuctionId").value = "0";
  mock.account = other; await events.accountsChanged([other]);
  await el("endAuctionBtn").onclick(); assert.match(el("status").textContent, /仅 owner/); assert.equal(writes.length, 0);
  mock.account = owner; await events.accountsChanged([owner]); mock.nftOwner = config.AUCTION_ADDRESS;
  await el("endAuctionBtn").onclick(); assert.equal(writes.at(-1).functionName, "end"); assert.match(el("auctionResult").textContent, /无人出价/);
  mock.highestBidder = other; mock.ended = true;
  await el("endAuctionBtn").onclick(); assert.deepEqual(Array.from(writes.at(-1).args), [0n]); assert.match(el("endResult").textContent, /已结算/);
  mock.nftOwner = other; const count = writes.length; await el("endAuctionBtn").onclick(); assert.equal(writes.length, count); assert.match(el("status").textContent, /可能已结算/);
});


test("errors stay visible in a dismissible notification and in the operation card", async () => {
  const { el, mock, connect } = await fixture(); await connect();
  el("newOwnerAddress").value = other; mock.reject = true;
  await el("transferOwnerBtn").onclick();
  assert.equal(el("statusPanel").hidden, false);
  assert.match(el("statusPanel").className, /err/);
  assert.match(el("statusTitle").textContent, /操作失败/);
  assert.equal(el("status").attributes["aria-live"], "assertive");
  assert.equal(el("transferOwnerBtnFeedback").hidden, false);
  assert.match(el("transferOwnerBtnFeedback").textContent, /User rejected/);
  el("dismissStatusBtn").onclick();
  assert.equal(el("statusPanel").hidden, true);
  assert.equal(el("transferOwnerBtnFeedback").hidden, false);
  mock.reject = false; await el("transferOwnerBtn").onclick();
  assert.equal(el("transferOwnerBtnFeedback").hidden, true);
  assert.equal(el("statusPanel").hidden, false);
  assert.match(el("statusPanel").className, /ok/);
  el("queryId").value = "invalid"; await el("queryBtn").onclick();
  assert.equal(el("queryBtnFeedback").hidden, false);
  assert.match(el("queryBtnFeedback").textContent, /必须为整数/);
});


test("real viem nested reverts show custom errors, parameters and require reasons", async () => {
  const { context } = await fixture();
  const abi = vm.runInContext("AUCTION_ABI", context);
  const format = error => { context.testError = error; return vm.runInContext("errorText(testError)", context); };
  const wrapped = data => new ContractFunctionExecutionError(
    new ContractFunctionRevertedError({ abi, data, functionName: "bid" }),
    { abi, args: [0n, 1n], contractAddress: config.AUCTION_ADDRESS, functionName: "bid", sender: owner },
  );
  const bidError = wrapped(encodeErrorResult({ abi, errorName: "BidBelowStartingPrice" }));
  assert.match(format(bidError), /BidBelowStartingPrice\(\)/);
  assert.match(format(bidError), /高于起拍价/);
  const allowanceError = wrapped(encodeErrorResult({ abi, errorName: "ERC20InsufficientAllowance", args: [owner, 5n, 10n] }));
  assert.match(format(allowanceError), /allowance=5, needed=10/);
  assert.match(format(allowanceError), /授权额度不足/);
  const requireError = wrapped(encodeErrorResult({ abi: parseAbi(["error Error(string message)"]), errorName: "Error", args: ["not ended"] }));
  assert.match(format(requireError), /not ended/);
  assert.match(format(requireError), /只有 owner 可以提前结束/);
  const raw = encodeErrorResult({ abi, errorName: "ERC721NonexistentToken", args: [42n] });
  assert.match(format({ shortMessage: "RPC error", cause: { data: raw } }), /tokenId=42/);
  assert.match(format({ shortMessage: "RPC error", cause: { data: "0x12345678" } }), /未识别.*0x12345678/);
  assert.match(format({ shortMessage: "RPC error", cause: { message: "insufficient funds for gas" } }), /insufficient funds for gas/);
});
