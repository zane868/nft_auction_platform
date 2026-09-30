import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

export default buildModule("MetaNFTModule", (m) => {
  const metaNFT = m.contract("MetaNFT");

  return { metaNFT };
});
