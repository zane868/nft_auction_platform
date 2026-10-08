import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("MetaNFTAuctionModule", (m) => {
  const owner = m.getParameter("owner", "0xEeBD193Cb96D61E93D22FdAeD12313E2BeC8ef6c");
  const implementation = m.contract("MetaNFTAuctionUUPS");
  const initialization = m.encodeFunctionCall(implementation, "initialize", [owner]);
  const proxy = m.contract("AuctionProxy", [implementation, initialization]);
  const auction = m.contractAt("MetaNFTAuctionUUPS", proxy, { id: "Auction" });
  return { implementation, proxy, auction };
});
