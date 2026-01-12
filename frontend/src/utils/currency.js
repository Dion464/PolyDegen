/**
 * Utility functions for currency display based on network
 */

import { CHAIN_ID } from '../contracts/eth-config';

/**
 * Get the currency symbol for the current network
 * @param {number} chainId - The chain ID (optional, defaults to config)
 * @returns {string} Currency symbol (TCENT or ETH)
 */
export const getCurrencySymbol = (chainId = CHAIN_ID) => {
  switch (chainId) {
    case 28802: // Incentiv Testnet
      return 'TCENT';
    case 1337:  // Hardhat Local
    case 31337: // Alternative Hardhat
    case 1:     // Ethereum Mainnet
    case 5:     // Goerli
    default:
      return 'ETH';
  }
};

/**
 * Get the currency name for the current network
 * @param {number} chainId - The chain ID (optional, defaults to config)
 * @returns {string} Currency name
 */
export const getCurrencyName = (chainId = CHAIN_ID) => {
  switch (chainId) {
    case 28802:
      return 'TCENT';
    case 1337:
    case 31337:
      return 'Ether';
    case 1:
      return 'Ethereum';
    default:
      return 'ETH';
  }
};

