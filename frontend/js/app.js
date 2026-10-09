import { createPublicClient, createWalletClient, custom, http, decodeErrorResult, isAddress, parseUnits, formatUnits, zeroAddress } from "https://esm.sh/viem@2";
import { sepolia } from "https://esm.sh/viem@2/chains";
import { NFT_ABI, AUCTION_ABI, NFT_APPROVAL_ABI, TOKEN_DECIMALS_ABI, ERC20_ABI, ERROR_ABI } from "./abis.js";
import { NFT_ADDRESS, AUCTION_ADDRESS, IMPLEMENTATION_ADDRESS, USDC_ADDRESS, EXPLORER_URL } from "./config.js";

const $ = id => document.getElementById(id);
const value = id => $(id).value.trim();
const show = (id, text) => { $(id).textContent = text; };
const errorHints = {
  BidBelowStartingPrice: "出价折算后的 USD 价值必须高于起拍价",
  BidNotHigherThanHighest: "出价折算后的 USD 价值必须高于当前最高价",
  OwnableUnauthorizedAccount: "当前调用账户不是合约 owner",
  OwnableInvalidOwner: "新 owner 地址无效",
  ERC721NonexistentToken: "该 NFT Token ID 不存在",
  ERC721InsufficientApproval: "NFT 授权不足，请由持有者授权给拍卖代理合约",
  ERC721IncorrectOwner: "NFT 的实际持有者与传入的卖家不一致",
  ERC20InsufficientAllowance: "ERC20 授权额度不足，请先授权出价金额",
  ERC20InsufficientBalance: "ERC20 余额不足",
  SafeERC20FailedOperation: "ERC20 转账失败",
  ERC1967InvalidImplementation: "实现合约地址无效",
  UUPSUnsupportedProxiableUUID: "新实现不兼容当前 UUPS 代理",
  "oracle not set": "尚未配置该代币的 USD 喂价",
  "invalid oracle": "喂价地址不能为零地址",
  "not started": "拍卖尚未开始或不存在",
  "ended": "拍卖已经结束",
  "already settled": "拍卖已经结算",
  "not ended": "拍卖尚未到期，只有 owner 可以提前结束",
  "invalid duration": "拍卖持续时间至少为 30 秒",
  "invalid payment token": "支付代币不能为零地址",
  "invalid nft": "NFT 合约地址不能为零地址",
  "invalid amount": "出价金额必须大于零",
  "amount mismatch": "ETH 转账金额与出价金额不一致",
  "not owner": "当前账户不是该 NFT 的持有者",
  "ETH refund failed": "向上一位竞价者退还 ETH 失败",
  "ETH payout failed": "向卖家支付 ETH 失败",
};
function explainRevert(decoded) {
  const { errorName, args = [], abiItem } = decoded;
  if (errorName === "Error") {
    const reason = String(args[0]);
    return `合约拒绝执行：${reason}${errorHints[reason] ? `（${errorHints[reason]}）` : ""}`;
  }
  const params = args.map((arg, index) => `${abiItem?.inputs?.[index]?.name || `参数${index + 1}`}=${String(arg)}`).join(", ");
  return `合约错误：${errorName}(${params})${errorHints[errorName] ? `
原因：${errorHints[errorName]}` : ""}`;
}
export function errorText(error) {
  const chain = [];
  const seen = new Set();
  for (let current = error; current && !seen.has(current); current = current.cause) {
    seen.add(current); chain.push(current);
  }
  for (const current of chain) {
    if (current.data?.errorName) return explainRevert(current.data);
    const raw = current.raw ?? (typeof current.data === "string" ? current.data : current.data?.data);
    if (typeof raw === "string" && /^0x[0-9a-f]{8,}$/i.test(raw)) {
      try { return explainRevert(decodeErrorResult({ abi: ERROR_ABI, data: raw })); }
      catch { return `合约返回了未识别的错误数据：${raw}
当前 ABI 无法解码该错误。`; }
    }
    if (current.reason && current.reason !== "execution reverted") {
      return `合约拒绝执行：${current.reason}${errorHints[current.reason] ? `（${errorHints[current.reason]}）` : ""}`;
    }
  }
  // RPC and wallet wrappers often keep the useful message in an inner cause.
  const messages = [...new Set(chain.flatMap(current => [current.shortMessage, current.details, current.message]).filter(Boolean))];
  return messages.join("\n\n") || String(error ?? "未知错误");
}
const same = (a, b) => !!a && !!b && a.toLowerCase() === b.toLowerCase();
const state = { wallet: null, account: null, chainId: null, owner: null, ownerAddress: null, busy: false, session: 0 };
const publicClient = createPublicClient({ chain: sepolia, transport: http() });
const ownerButtons = ["setOracleBtn", "transferOwnerBtn", "upgradeBtn", "startAuctionBtn"];
const walletButtons = ["mintBtn", "burnBtn", "approveNftBtn", "bidBtn", "bidApproveBtn", "endAuctionBtn"];
const FORMULA = "amount × price ÷ 10^amountDecimals";
let ownerRequest = 0;
let nftRequest = 0;

const feedbackTargets = {"connectBtn": "connectBtnFeedback", "myTokensBtn": "myTokensBtnFeedback", "mintBtn": "mintBtnFeedback", "queryBtn": "queryBtnFeedback", "burnBtn": "burnBtnFeedback", "refreshOwnerBtn": "refreshOwnerBtnFeedback", "oracleBtn": "oracleBtnFeedback", "getTokenOracleBtn": "oracleBtnFeedback", "priceBtn": "oracleBtnFeedback", "setOracleBtn": "oracleBtnFeedback", "approveNftBtn": "approveNftBtnFeedback", "startAuctionBtn": "approveNftBtnFeedback", "queryAuctionBtn": "queryAuctionBtnFeedback", "endAuctionBtn": "queryAuctionBtnFeedback", "bidApproveBtn": "bidApproveBtnFeedback", "bidBtn": "bidApproveBtnFeedback", "transferOwnerBtn": "transferOwnerBtnFeedback", "upgradeBtn": "transferOwnerBtnFeedback"};

function clearFeedback(button) {
  const target = $(feedbackTargets[button]);
  target.textContent = "";
  target.hidden = true;
}
function reportError(button, message) {
  const target = $(feedbackTargets[button]);
  target.textContent = message;
  target.hidden = false;
  status(message, "err");
}
$("dismissStatusBtn").onclick = () => { $("statusPanel").hidden = true; };

function status(message, kind = "") {
  show("status", message);
  $("statusPanel").className = `status-panel ${kind}`;
  $("statusPanel").hidden = false;
  show("statusTitle", kind === "err" ? "⚠ 操作失败" : kind === "ok" ? "✓ 操作成功" : "操作进度");
  $("status").setAttribute("role", kind === "err" ? "alert" : "status");
  $("status").setAttribute("aria-live", kind === "err" ? "assertive" : "polite");
}
function addressField(id, label, allowZero = false) {
  const address = value(id);
  if (!isAddress(address) || (!allowZero && same(address, zeroAddress))) throw new Error(`请输入有效的${label}地址`);
  return address;
}
function integerField(id, label, min = 0n) {
  const text = value(id);
  if (!/^\d+$/.test(text)) throw new Error(`${label}必须为整数`);
  const number = BigInt(text);
  if (number < min || number >= 2n ** 256n) throw new Error(`${label}超出有效范围，最小值为 ${min}`);
  return number;
}
const proxyAddress = () => addressField("auctionAddress", "拍卖代理合约");
const read = (address, abi, functionName, args = [], extra = {}) => publicClient.readContract({ address, abi, functionName, args, ...extra });
const readAuction = (address, name, args = []) => read(address, AUCTION_ABI, name, args);
function ownsProxy() {
  return same(state.ownerAddress, value("auctionAddress")) && same(state.owner, state.account);
}
function renderPermissions() {
  const connected = !!state.wallet && !!state.account && state.chainId === sepolia.id;
  walletButtons.forEach(id => { $(id).disabled = state.busy || !connected; });
  $("bidApproveBtn").disabled = state.busy || !connected || value("bidCurrency") !== "erc20";
  ownerButtons.forEach(id => { $(id).disabled = state.busy || !connected || !ownsProxy(); });
  $("myTokensBtn").disabled = !state.account;
  $("connectBtn").disabled = state.busy;
  document.querySelectorAll("input, select").forEach(input => { input.disabled = state.busy; });
  show("account", state.account ?? "未连接");
  show("connectBtn", state.account ? "已连接（点击检查网络）" : "连接 MetaMask");
  if (!state.owner) return;
  show("ownerStatus", !state.account ? "未连接钱包，无法判断是否为 owner"
    : state.chainId !== sepolia.id ? "钱包未连接 Sepolia，请切换网络"
    : ownsProxy() ? "当前钱包是 owner，可以管理喂价、发起拍卖、转移 owner 和升级"
    : "当前钱包不是 owner，可查询或以卖家身份授权 NFT");
}
async function refreshOwner() {
  const request = ++ownerRequest;
  const selectedAddress = value("auctionAddress");
  state.owner = null;
  state.ownerAddress = null;
  renderPermissions();
  show("auctionOwner", "读取中…");
  show("ownerStatus", "正在检查 owner…");
  try {
    const address = proxyAddress();
    const owner = await readAuction(address, "owner");
    if (request !== ownerRequest || selectedAddress !== value("auctionAddress")) return false;
    state.owner = owner;
    state.ownerAddress = address;
    show("auctionOwner", owner);
    renderPermissions();
    return ownsProxy();
  } catch (error) {
    if (request === ownerRequest) {
      show("auctionOwner", "读取失败");
      show("ownerStatus", `无法判断 owner：${errorText(error)}`);
    }
    return false;
  }
}
async function refreshNft() {
  const request = ++nftRequest;
  const account = state.account;
  if (!account) { show("myBalance", "-"); show("myTokens", "-"); return; }
  const [balance, tokens] = await Promise.allSettled([
    read(NFT_ADDRESS, NFT_ABI, "balanceOf", [account]),
    read(NFT_ADDRESS, NFT_ABI, "GetTokenIdsOfOwner", [], { account }),
  ]);
  if (request !== nftRequest || !same(account, state.account)) return;
  show("myBalance", balance.status === "fulfilled" ? balance.value.toString() : "读取失败");
  show("myTokens", tokens.status === "fulfilled" ? (tokens.value.length ? tokens.value.map(id => `#${id}`).join(", ") : "（暂无）") : `查询失败：${errorText(tokens.reason)}`);
}
async function loadNftInfo() {
  const [name, symbol, supply] = await Promise.all(["name", "symbol", "totalSupply"].map(name => read(NFT_ADDRESS, NFT_ABI, name)));
  show("nftName", name); show("nftSymbol", symbol); show("totalSupply", supply.toString());
}
async function walletContext() {
  if (!state.wallet || !state.account) throw new Error("请先连接钱包");
  const [account] = await state.wallet.getAddresses();
  const chainId = await state.wallet.getChainId();
  if (!same(account, state.account)) throw new Error("钱包账户已改变，请重新连接");
  if (chainId !== sepolia.id) throw new Error("请切换到 Sepolia 测试网");
  return { account, session: state.session, proxy: value("auctionAddress") };
}
async function sendTransaction({ address, abi, name, args, label, ownerOnly = false, value: transactionValue = 0n }) {
  const context = await walletContext();
  if (ownerOnly) {
    const owner = await readAuction(context.proxy, "owner");
    if (!same(owner, context.account)) throw new Error("当前钱包不是拍卖合约 owner");
  }
  status(`${label}：正在预检查交易...`);
  const { request } = await publicClient.simulateContract({ address, abi, functionName: name, args, account: context.account, value: transactionValue });
  const estimated = await publicClient.estimateContractGas({ ...request, account: context.account });
  const gas = (estimated * 120n) / 100n;
  const latest = await walletContext();
  if (context.session !== latest.session || context.proxy !== latest.proxy) throw new Error("账户、网络或代理地址已改变，请重新提交");
  status(`${label}：等待钱包确认...`);
  const hash = await state.wallet.writeContract({ ...request, gas, chain: sepolia });
  status(`${label}：交易 ${hash}，等待确认...`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error(`交易执行失败。交易哈希：${hash}。链上回执未包含 revert 原因，请在区块浏览器查看交易详情。`);
  status(`${label}成功！区块 ${receipt.blockNumber}`, "ok");
  return receipt;
}
function bindWrite(button, label, action) {
  $(button).onclick = async () => {
    if (state.busy) return;
    clearFeedback(button);
    state.busy = true; renderPermissions();
    try { await action(); }
    catch (error) { reportError(button, `${label}失败：${errorText(error)}`); }
    finally {
      await Promise.allSettled([refreshOwner(), refreshNft(), loadNftInfo()]);
      state.busy = false; renderPermissions();
    }
  };
}
function bindRead(button, action, result) {
  $(button).onclick = async () => {
    clearFeedback(button);
    $(button).disabled = true;
    if (result) show(result, "-");
    try { await action(); }
    catch (error) {
      if (result) show(result, `查询失败：${errorText(error)}`);
      reportError(button, `查询失败：${errorText(error)}`);
    } finally { $(button).disabled = false; renderPermissions(); }
  };
}
function resetPrice() { show("priceResult", "-"); show("toUsdDetails", FORMULA); }
function formSnapshot(ids) {
  const values = ids.map(value);
  return () => ids.every((id, index) => value(id) === values[index]);
}
export function toUsd(amount, amountDecimals, price) {
  return (amount * price) / (10n ** BigInt(amountDecimals));
}

// Wallet lifecycle: account and network changes invalidate pending checks.
async function updateWallet(account, chainId) {
  state.session++;
  state.account = account ?? null;
  state.chainId = chainId;
  renderPermissions();
  await Promise.allSettled([refreshOwner(), refreshNft()]);
}
$("connectBtn").onclick = async () => {
  clearFeedback("connectBtn");
  if (!window.ethereum) { reportError("connectBtn", "未检测到 MetaMask"); return; }
  $("connectBtn").disabled = true;
  try {
    state.wallet = createWalletClient({ chain: sepolia, transport: custom(window.ethereum) });
    const [account] = await state.wallet.requestAddresses();
    if (await state.wallet.getChainId() !== sepolia.id) await state.wallet.switchChain({ id: sepolia.id });
    await updateWallet(account, await state.wallet.getChainId());
    if (!value("sellerAddress")) $("sellerAddress").value = account;
    status("钱包已连接", "ok");
  } catch (error) { reportError("connectBtn", `连接失败：${errorText(error)}`); }
  finally { renderPermissions(); }
};
if (window.ethereum?.on) {
  window.ethereum.on("accountsChanged", accounts => updateWallet(accounts[0], state.chainId));
  window.ethereum.on("chainChanged", chainId => updateWallet(state.account, Number(chainId)));
  window.ethereum.on("disconnect", () => updateWallet(null, null));
}
$("auctionAddress").addEventListener("input", () => {
  show("oracleResult", "-"); show("auctionResult", "-"); show("startResult", "-"); resetPrice(); refreshOwner();
});
$("priceToken").addEventListener("input", () => { show("oracleResult", "-"); resetPrice(); });
$("priceAmount").addEventListener("input", resetPrice);
bindRead("refreshOwnerBtn", refreshOwner);
bindRead("myTokensBtn", refreshNft);

// NFT reads and transactions.
bindRead("queryBtn", async () => {
  const id = integerField("queryId", "Token ID", 1n);
  const valid = formSnapshot(["queryId"]);
  const owner = await read(NFT_ADDRESS, NFT_ABI, "ownerOf", [id]);
  if (valid()) show("queryResult", `#${id} 持有者：${owner}`);
}, "queryResult");
bindWrite("mintBtn", "铸造", async () => {
  await walletContext();
  await sendTransaction({ address: NFT_ADDRESS, abi: NFT_ABI, name: "mint", args: [state.account], label: "铸造" });
});
bindWrite("burnBtn", "销毁", async () => {
  const id = integerField("burnId", "Token ID", 1n);
  const { account } = await walletContext();
  if (!same(await read(NFT_ADDRESS, NFT_ABI, "ownerOf", [id]), account)) throw new Error("你不是这枚 NFT 的持有者");
  await sendTransaction({ address: NFT_ADDRESS, abi: NFT_ABI, name: "burn", args: [id], label: `销毁 #${id}` });
});

// Oracle reads and decimal-safe USD conversion.
for (const [button, name] of [["oracleBtn", "tokenToOracle"], ["getTokenOracleBtn", "getTokenOracle"]]) {
  bindRead(button, async () => {
    const address = proxyAddress(), token = addressField("priceToken", "支付代币", true);
    const valid = formSnapshot(["auctionAddress", "priceToken"]);
    const oracle = await readAuction(address, name, [token]);
    if (valid()) show("oracleResult", `${name}：${same(oracle, zeroAddress) ? "未配置（零地址）" : oracle}`);
  }, "oracleResult");
}
bindRead("priceBtn", async () => {
  resetPrice();
  const address = proxyAddress(), token = addressField("priceToken", "支付代币", true), quantity = value("priceAmount");
  if (!/^\d+(\.\d+)?$/.test(quantity)) throw new Error("请输入有效的非负代币数量");
  const valid = formSnapshot(["auctionAddress", "priceToken", "priceAmount"]);
  const decimals = same(token, zeroAddress) ? 18 : await read(token, TOKEN_DECIMALS_ABI, "decimals");
  if ((quantity.split(".")[1]?.length ?? 0) > decimals) throw new Error(`该代币最多支持 ${decimals} 位小数`);
  const amount = parseUnits(quantity, decimals);
  if (amount >= 2n ** 256n) throw new Error("数量超出 uint256 范围");
  const [price, oracle] = await Promise.all([readAuction(address, "getPriceInDollar", [token]), readAuction(address, "getTokenOracle", [token])]);
  const feedDecimals = await read(oracle, TOKEN_DECIMALS_ABI, "decimals");
  const usd = toUsd(amount, decimals, price);
  if (!valid()) return;
  show("priceResult", `单价：${formatUnits(price, feedDecimals)} USD；${quantity} 个代币价值：${formatUnits(usd, feedDecimals)} USD`);
  show("toUsdDetails", `amount（最小单位）：${amount}\namountDecimals（代币精度）：${decimals}\nprice（原始喂价）：${price}\n喂价精度：${feedDecimals}\ntoUsd = ${amount} × ${price} ÷ 10^${decimals}\n结果（原始单位）：${usd}\n美元价值：${formatUnits(usd, feedDecimals)} USD`);
  status("toUsd 美元价值换算成功", "ok");
}, "priceResult");
bindWrite("setOracleBtn", "设置喂价", async () => {
  const address = proxyAddress(), token = addressField("priceToken", "支付代币", true), oracle = addressField("oracleAddress", "喂价");
  await sendTransaction({ address, abi: AUCTION_ABI, name: "setTokenOracle", args: [token, oracle], label: "设置喂价", ownerOnly: true });
  show("oracleResult", await readAuction(address, "getTokenOracle", [token])); resetPrice();
});

// Owner actions share the same signer checks, simulation and receipt handling.
bindWrite("transferOwnerBtn", "转移 owner", async () => {
  const address = proxyAddress(), newOwner = addressField("newOwnerAddress", "新 owner");
  if (same(newOwner, state.account)) throw new Error("新 owner 不能与当前 owner 相同");
  await sendTransaction({ address, abi: AUCTION_ABI, name: "transferOwnership", args: [newOwner], label: `转移 owner 至 ${newOwner}`, ownerOnly: true });
});
bindWrite("upgradeBtn", "原地升级", async () => {
  const address = proxyAddress(), implementation = addressField("upgradeImplementation", "实现合约");
  if (same(address, implementation)) throw new Error("实现合约地址不能使用代理地址");
  const code = await publicClient.getCode({ address: implementation });
  if (!code || code === "0x") throw new Error("该地址在 Sepolia 上没有合约代码");
  await sendTransaction({ address, abi: AUCTION_ABI, name: "upgradeToAndCall", args: [implementation, "0x"], label: "原地升级", ownerOnly: true });
});

// Auction creation, NFT custody approval and state queries.
function auctionInputs() {
  return { address: proxyAddress(), seller: addressField("sellerAddress", "卖家"), nft: addressField("auctionNft", "NFT 合约"), id: integerField("auctionNftId", "NFT Token ID") };
}
bindWrite("approveNftBtn", "授权 NFT", async () => {
  const { address, seller, nft, id } = auctionInputs();
  const { account } = await walletContext();
  if (!same(seller, account)) throw new Error("请连接卖家钱包进行授权");
  if (!same(await read(nft, NFT_APPROVAL_ABI, "ownerOf", [id]), seller)) throw new Error("卖家不是这枚 NFT 的持有者");
  await sendTransaction({ address: nft, abi: NFT_APPROVAL_ABI, name: "approve", args: [address, id], label: "授权 NFT" });
});
bindWrite("startAuctionBtn", "发起拍卖", async () => {
  show("startResult", "-");
  const { address, seller, nft, id } = auctionInputs();
  const price = integerField("startingPrice", "起拍价"), duration = integerField("auctionDuration", "持续时间", 30n), token = addressField("auctionPaymentToken", "ERC20 支付代币");
  const receipt = await sendTransaction({ address, abi: AUCTION_ABI, name: "start", args: [seller, id, nft, price, duration, token], label: "发起拍卖", ownerOnly: true });
  show("startResult", `拍卖创建成功，交易 ${receipt.transactionHash}`);
});
bindRead("queryAuctionBtn", async () => {
  const address = proxyAddress(), id = integerField("queryAuctionId", "拍卖 ID");
  const valid = formSnapshot(["auctionAddress", "queryAuctionId"]);
  const count = await readAuction(address, "auctionId");
  if (id >= count) throw new Error(`拍卖不存在，当前共 ${count} 场拍卖`);
  const [auction, ended, settled] = await Promise.all([readAuction(address, "auctions", [id]), readAuction(address, "isEnded", [id]), readAuction(address, "settled", [id])]);
  if (!valid()) return;
  show("auctionResult", `拍卖 #${id}\nNFT：${auction[0]} #${auction[1]}\n卖家：${auction[2]}\n起拍价：${formatUnits(auction[5], 8)} USD\n支付代币：${auction[7]}\n最高出价者：${auction[4]}\n最高出价：${formatUnits(auction[9], 8)} USD\n开始时间：${new Date(Number(auction[3]) * 1000).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}（上海时间）\n持续时间：${auction[6]} 秒\n状态：${settled ? "已结算" : ended ? "已到结束时间，待结算" : "进行中"}`);
}, "auctionResult");

bindWrite("endAuctionBtn", "结束拍卖", async () => {
  show("endResult", "-");
  const address = proxyAddress(), id = integerField("queryAuctionId", "拍卖 ID");
  if (id >= await readAuction(address, "auctionId")) throw new Error("拍卖不存在");
  const [auction, ended] = await Promise.all([readAuction(address, "auctions", [id]), readAuction(address, "isEnded", [id])]);
  const chainOwner = await readAuction(address, "owner");
  if (!ended && !same(chainOwner, state.account)) throw new Error("拍卖尚未到结束时间，仅 owner 可以强制结束");
  if (!same(await read(auction[0], NFT_APPROVAL_ABI, "ownerOf", [auction[1]]), address)) throw new Error("NFT 已不在拍卖合约中，可能已结算，请勿重复提交");
  const label = !ended ? "owner 强制结束拍卖" : "结束拍卖并结算";
  const receipt = await sendTransaction({ address, abi: AUCTION_ABI, name: "end", args: [id], label });
  show("endResult", `拍卖 #${id} 已结算，交易 ${receipt.transactionHash}`);
  show("auctionResult", same(auction[4], zeroAddress) ? `拍卖 #${id} 已结束：无人出价，NFT 退回卖家 ${auction[2]}` : `拍卖 #${id} 已结算：NFT 转给 ${auction[4]}，资金转给卖家 ${auction[2]}`);
});

// Bids use the auction's payment token; ETH bids send amount as transaction value.
async function bidInputs() {
  const address = proxyAddress(), id = integerField("bidAuctionId", "拍卖 ID");
  const { account } = await walletContext();
  const count = await readAuction(address, "auctionId");
  if (id >= count) throw new Error("拍卖不存在");
  const [auction, ended] = await Promise.all([readAuction(address, "auctions", [id]), readAuction(address, "isEnded", [id])]);
  if (ended) throw new Error("拍卖已结束");
  if (same(auction[4], account)) throw new Error("你已是最高出价者，当前合约暂不支持再次加价");
  const isEth = value("bidCurrency") === "eth";
  const token = isEth ? zeroAddress : auction[7];
  const decimals = isEth ? 18 : await read(token, ERC20_ABI, "decimals");
  const quantity = value("bidAmount");
  if (!/^\d+(\.\d+)?$/.test(quantity) || (quantity.split(".")[1]?.length ?? 0) > decimals) throw new Error(`请输入有效数量，最多 ${decimals} 位小数`);
  const amount = parseUnits(quantity, decimals);
  if (amount <= 0n || amount >= 2n ** 256n) throw new Error("出价数量必须大于零且在有效范围内");
  return { address, id, account, token, amount, isEth };
}
$("bidCurrency").addEventListener("change", () => { show("bidResult", "-"); renderPermissions(); });
bindWrite("bidApproveBtn", "授权出价", async () => {
  const { address, token, amount, isEth } = await bidInputs();
  if (isEth) throw new Error("ETH 出价无需授权");
  await sendTransaction({ address: token, abi: ERC20_ABI, name: "approve", args: [address, amount], label: "授权出价金额" });
  show("bidResult", "代币授权成功，现在可以提交出价");
});
bindWrite("bidBtn", "出价", async () => {
  show("bidResult", "-");
  const { address, id, account, token, amount, isEth } = await bidInputs();
  if (!isEth && await read(token, ERC20_ABI, "allowance", [account, address]) < amount) throw new Error("代币授权额度不足，请先授权出价金额");
  const receipt = await sendTransaction({ address, abi: AUCTION_ABI, name: "bid", args: [id, amount], value: isEth ? amount : 0n, label: "提交出价" });
  show("bidResult", `出价成功，交易 ${receipt.transactionHash}`);
});

// Deployment addresses live in config.js.
$("auctionAddress").value = AUCTION_ADDRESS;
$("auctionNft").value = NFT_ADDRESS;
$("auctionPaymentToken").value = USDC_ADDRESS;
$("upgradeImplementation").value = IMPLEMENTATION_ADDRESS;
$("explorerLink").href = `${EXPLORER_URL}/address/${NFT_ADDRESS}`;
show("explorerLink", NFT_ADDRESS);
renderPermissions();
refreshOwner();
loadNftInfo().catch(error => status(`读取 NFT 信息失败：${errorText(error)}`, "err"));
