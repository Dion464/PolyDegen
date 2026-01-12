/**
 * Application constants
 */

// Admin wallet addresses (lowercase)
export const ADMIN_ADDRESSES = [
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', // Hardhat account #0
  '0xed27c34a8434adc188a2d7503152024f64967b61', // Production admin
].map(addr => addr.toLowerCase());

// Market outcomes
export const OUTCOME = {
  UNRESOLVED: 0,
  YES: 1,
  NO: 2,
  INVALID: 3,
};

export const OUTCOME_LABELS = {
  [OUTCOME.YES]: 'YES',
  [OUTCOME.NO]: 'NO', 
  [OUTCOME.INVALID]: 'INVALID',
};

// Market status
export const MARKET_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  DEPLOYED: 'DEPLOYED',
};

// Categories
export const CATEGORIES = [
  'crypto',
  'politics', 
  'sports',
  'entertainment',
  'science',
  'finance',
  'other',
];

// Time constants
export const ONE_HOUR = 60 * 60 * 1000;
export const ONE_DAY = 24 * ONE_HOUR;

// Platform fee (basis points)
export const PLATFORM_FEE_BPS = 200; // 2%

