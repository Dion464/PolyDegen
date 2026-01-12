/**
 * Frontend EIP-712 Utilities for Order Signing
 * Compatible with Wagmi/Viem and Ethers.js
 */

import { ethers } from 'ethers';

const EIP712_DOMAIN_NAME = 'Exchange';
const EIP712_DOMAIN_VERSION = '1';

const ORDER_TYPE = {
  Order: [
    { name: 'maker', type: 'address' },
    { name: 'marketId', type: 'uint256' },
    { name: 'outcomeId', type: 'uint256' },
    { name: 'price', type: 'uint256' },
    { name: 'size', type: 'uint256' },
    { name: 'side', type: 'bool' },
    { name: 'expiry', type: 'uint256' },
    { name: 'salt', type: 'uint256' }
  ]
};

/**
 * Get EIP-712 domain separator
 */
export function getDomain(chainId, verifyingContract) {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId: chainId,
    verifyingContract: verifyingContract
  };
}

/**
 * Create order object for signing
 */
export function createOrder({
  maker,
  marketId,
  outcomeId,
  price, // in ticks (4000 = 0.04 = 4¢)
  size, // number of shares
  side, // true = buy, false = sell
  expiry, // timestamp in seconds
  salt // random nonce
}) {
  return {
    maker,
    marketId: marketId.toString(),
    outcomeId: outcomeId.toString(),
    price: price.toString(),
    size: size.toString(),
    side,
    expiry: expiry.toString(),
    salt: salt.toString()
  };
}

/**
 * Sign order with EIP-712 (using ethers.js)
 */
export async function signOrder(order, chainId, verifyingContract, signer) {
  try {
    const domain = getDomain(chainId, verifyingContract);
    
    const signature = await signer._signTypedData(
      domain,
      ORDER_TYPE,
      order
    );
    
    return signature;
  } catch (error) {
    console.error('Error signing order:', error);
    throw error;
  }
}

/**
 * Generate random salt (nonce)
 */
export function generateSalt() {
  return ethers.BigNumber.from(ethers.utils.randomBytes(32)).toString();
}

/**
 * Create order with expiry (defaults to 30 days)
 */
export function createOrderWithDefaults({
  maker,
  marketId,
  outcomeId,
  price,
  size,
  side
}, options = {}) {
  const expiry = options.expiry || Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60); // 30 days default
  const salt = options.salt || generateSalt();
  
  return createOrder({
    maker,
    marketId,
    outcomeId,
    price,
    size,
    side,
    expiry,
    salt
  });
}

/**
 * Convert price from cents to ticks
 * 1 cent = 100 ticks (4000 ticks = 40 cents = 0.40)
 */
export function centsToTicks(cents) {
  return Math.round(cents * 100);
}

/**
 * Convert ticks to cents
 */
export function ticksToCents(ticks) {
  return ticks / 100;
}

/**
 * Validate order before signing
 */
export function validateOrder(order) {
  if (!order.maker || !ethers.utils.isAddress(order.maker)) {
    return { valid: false, error: 'Invalid maker address' };
  }
  
  if (!order.marketId || parseInt(order.marketId) <= 0) {
    return { valid: false, error: 'Invalid market ID' };
  }
  
  if (order.outcomeId !== '0' && order.outcomeId !== '1') {
    return { valid: false, error: 'Outcome ID must be 0 (YES) or 1 (NO)' };
  }
  
  const price = parseInt(order.price);
  if (price <= 0 || price > 10000) {
    return { valid: false, error: 'Price must be between 1 and 10000 ticks' };
  }
  
  const size = parseInt(order.size);
  if (size <= 0) {
    return { valid: false, error: 'Size must be positive' };
  }
  
  const expiry = parseInt(order.expiry);
  if (expiry <= Math.floor(Date.now() / 1000)) {
    return { valid: false, error: 'Order expiry must be in the future' };
  }
  
  return { valid: true };
}

