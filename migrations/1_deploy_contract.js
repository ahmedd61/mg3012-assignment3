const fs = require("fs");
const path = require("path");

const GoalVault = artifacts.require("GoalVault");

module.exports = async function (deployer, network) {
  // 1. Deploy the contract to the connected network (Ganache).
  await deployer.deploy(GoalVault);
  const vault = await GoalVault.deployed();

  // 2. Write the deployed address to the frontend so the dApp always points
  //    at the latest deployment (no copy-pasting the address by hand).
  const chainId = Number(await web3.eth.getChainId());
  const config = { address: vault.address, chainId, network };
  const file = path.join(__dirname, "..", "frontend", "contract-config.js");
  fs.writeFileSync(file, "window.APP_CONFIG = " + JSON.stringify(config, null, 2) + ";\n");

  console.log("\nGoalVault deployed at:", vault.address);
  console.log("Frontend config written to frontend/contract-config.js");
};
