/**
 * MG3012 Assignment 3 - GoalVault on Truffle + Ganache
 *
 * Network "development" points at a local Ganache blockchain started with:
 *     ganache --port 7545
 * (Chain ID 1337, 10 funded test accounts.)
 */
module.exports = {
  networks: {
    development: {
      host: "127.0.0.1", // Ganache
      port: 7545,        // Ganache CLI port used in this project
      network_id: "*",   // match any network id
    },
  },

  // Truffle compiler settings
  compilers: {
    solc: {
      version: "0.8.20", // GoalVault uses pragma ^0.8.20
      settings: {
        optimizer: { enabled: false, runs: 200 },
        evmVersion: "shanghai", // Ganache 7.9 runs the Shanghai hardfork
      },
    },
  },
};
