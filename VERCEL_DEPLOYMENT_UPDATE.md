# Vercel Deployment Update Guide

## 🆕 New Contract Deployment

**New Contract Address:** `0x07286B39978f360C2C55525ebE9De4472D9265FC`  
**Network:** Incentive Testnet (Chain ID: 28802)  
**Deployment Date:** December 19, 2025

---

## 📝 Environment Variables to Update in Vercel

Go to your Vercel project settings → Environment Variables and update the following:

### Required Updates:

1. **`VITE_CONTRACT_ADDRESS`**
   - **Old:** (previous contract address)
   - **New:** `0x07286B39978f360C2C55525ebE9De4472D9265FC`
   - **Description:** The new ETH Prediction Market contract address

2. **`VITE_CHAIN_ID`**
   - **Value:** `28802`
   - **Description:** Incentive Testnet chain ID

3. **`VITE_RPC_URL`**
   - **Value:** `https://rpc-testnet.incentiv.io/`
   - **Description:** RPC endpoint for Incentive Testnet

4. **`VITE_NETWORK_NAME`**
   - **Value:** `Incentive Testnet` or `incentiv`
   - **Description:** Network name for display

5. **`VITE_BLOCK_EXPLORER_URL`**
   - **Value:** `https://explorer-testnet.incentiv.io`
   - **Description:** Block explorer URL for transaction links

### Optional (if not already set):

6. **`VITE_MARKET_CREATION_FEE`**
   - **Value:** `0.01`
   - **Description:** Market creation fee in ETH

7. **`VITE_PLATFORM_FEE_BPS`**
   - **Value:** `200`
   - **Description:** Platform fee in basis points (200 = 2%)

---

## 🔄 Steps to Update in Vercel Dashboard

1. **Go to Vercel Dashboard**
   - Navigate to your project
   - Click on **Settings** → **Environment Variables**

2. **Update Each Variable**
   - Find each variable listed above
   - Click **Edit** or **Add** if it doesn't exist
   - Update the value
   - Make sure it's enabled for **Production**, **Preview**, and **Development** environments

3. **Redeploy**
   - After updating all variables, trigger a new deployment:
     - Go to **Deployments** tab
     - Click **Redeploy** on the latest deployment
     - Or push a new commit to trigger automatic deployment

---

## ✨ What's New in This Contract

### 1. **Pari-Mutuel Payout Model**
   - Winners split the total pool (losers' funds)
   - No house vault paying $1 per share
   - Payout calculated as: `(totalPool * userShares) / totalWinningShares`

### 2. **User-to-User Sell Orders**
   - `placeSellOrder()` - Create sell orders
   - `buyFromSellOrder()` - Buy from existing sell orders
   - `cancelSellOrder()` - Cancel your sell orders
   - `getMarketSellOrders()` - View all sell orders for a market
   - `getUserSellOrders()` - View your sell orders

### 3. **Automatic Order Matching**
   - `placeLimitOrder()` - Place buy orders that auto-match
   - Limit orders automatically match with sell orders at the same price
   - Partial fills supported

### 4. **New View Functions**
   - `calculatePotentialPayout()` - Calculate potential winnings
   - `getPayoutPerShare()` - Get payout ratio per share
   - `getMarket()` now includes `totalPool` field

---

## 📋 Complete Environment Variables List

```bash
VITE_CONTRACT_ADDRESS=0x07286B39978f360C2C55525ebE9De4472D9265FC
VITE_CHAIN_ID=28802
VITE_RPC_URL=https://rpc-testnet.incentiv.io/
VITE_NETWORK_NAME=Incentive Testnet
VITE_BLOCK_EXPLORER_URL=https://explorer-testnet.incentiv.io
VITE_MARKET_CREATION_FEE=0.01
VITE_PLATFORM_FEE_BPS=200
```

---

## ✅ Verification Checklist

After updating and redeploying:

- [ ] Contract address updated in Vercel environment variables
- [ ] Chain ID is set to 28802
- [ ] RPC URL points to Incentive Testnet
- [ ] New deployment triggered in Vercel
- [ ] Frontend loads without errors
- [ ] Can connect wallet to Incentive Testnet
- [ ] Can view markets from new contract
- [ ] Can create new markets
- [ ] Can place buy/sell orders

---

## 🐛 Troubleshooting

**If the frontend shows "Contract not found":**
- Verify `VITE_CONTRACT_ADDRESS` is correct
- Check that the contract is deployed on the correct network
- Ensure wallet is connected to Incentive Testnet (Chain ID 28802)

**If transactions fail:**
- Verify `VITE_RPC_URL` is correct
- Check that you have testnet ETH in your wallet
- Ensure the contract address matches the deployment

**If environment variables aren't loading:**
- Make sure variables are prefixed with `VITE_`
- Redeploy after adding new variables
- Check that variables are enabled for the correct environments

---

## 📞 Support

If you encounter issues:
1. Check the contract on block explorer: https://explorer-testnet.incentiv.io/address/0x07286B39978f360C2C55525ebE9De4472D9265FC
2. Verify deployment transaction: `0x0cae996734200e8d5a6b1a464d459795a0434d83d7c0a06ae34b450a9a98a24f`
3. Review contract ABI in `frontend/src/contracts/eth-config.js`

