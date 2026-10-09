import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("MetaNFTAuctionImplementationModule", (m) => {
  const implementation = m.contract("MetaNFTAuctionUUPS");
  return { implementation };
});
