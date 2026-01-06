# Complete Guide: Smart Contracts & Blockchain in This Prediction Market

## 📚 Table of Contents
1. [What is Blockchain?](#what-is-blockchain)
2. [What are Smart Contracts?](#what-are-smart-contracts)
3. [Contract Architecture](#contract-architecture)
4. [Data Structures](#data-structures)
5. [Core Functions Explained](#core-functions-explained)
6. [Pari-Mutuel System](#pari-mutuel-system)
7. [Order Book System](#order-book-system)
8. [Security Features](#security-features)
9. [Events & Monitoring](#events--monitoring)
10. [Gas & Costs](#gas--costs)

---

## 🌐 What is Blockchain?

**Blockchain** is a distributed ledger technology that:
- Stores data in **blocks** linked together in a **chain**
- Is **decentralized** - no single authority controls it
- Is **immutable** - once data is written, it cannot be changed
- Is **transparent** - all transactions are publicly visible
- Uses **cryptography** to secure transactions

### Key Concepts:
- **Ethereum**: A blockchain platform that supports smart contracts
- **ETH/TCENT**: The native cryptocurrency (like digital money)
- **Wallet**: Software that holds your cryptocurrency and signs transactions
- **Transaction**: An action on the blockchain (sending ETH, calling a function)
- **Gas**: The fee paid to execute transactions (measured in wei/gwei)
- **Block**: A collection of transactions that gets added to the chain
- **Mining/Validation**: Process of verifying and adding blocks to the chain

---

## 🤖 What are Smart Contracts?

**Smart Contracts** are self-executing programs stored on the blockchain:
- They run automatically when conditions are met
- They cannot be changed once deployed (immutable)
- They handle money (ETH) and execute logic
- They are **trustless** - no need to trust a middleman

### Example:
```solidity
// Simple smart contract example
contract SimpleWallet {
    mapping(address => uint256) public balances;
    
    function deposit() public payable {
        balances[msg.sender] += msg.value;
    }
    
    function withdraw(uint256 amount) public {
        require(balances[msg.sender] >= amount, "Insufficient balance");
        payable(msg.sender).transfer(amount);
        balances[msg.sender] -= amount;
    }
}
```

---

## 🏗️ Contract Architecture

This prediction market uses **two main contracts**:

### 1. `ETHPredictionMarket.sol` (Main Contract)
- Handles all market operations
- Manages user positions
- Processes trades and payouts
- **Inherits from**: `ReentrancyGuard`, `Ownable`

### 2. `PricingAMM.sol` (Pricing Contract)
- Calculates share prices using LMSR (Logarithmic Market Scoring Rule)
- Provides liquidity and price discovery
- Used by main contract for pricing

---

## 📊 Data Structures

### Market Structure
```solidity
struct Market {
    uint256 id;                    // Unique market ID
    string question;                // The prediction question
    string description;             // Detailed description
    string category;                // Category (Politics, Sports, etc.)
    uint256 endTime;               // When trading ends
    uint256 resolutionTime;        // When market resolves
    bool resolved;                  // Is market resolved?
    uint8 outcome;                  // 0=unresolved, 1=YES, 2=NO, 3=INVALID
    uint256 totalYesShares;         // Total YES shares in circulation
    uint256 totalNoShares;          // Total NO shares in circulation
    uint256 totalVolume;            // Total ETH traded
    address creator;                 // Who created the market
    uint256 createdAt;              // Creation timestamp
    bool active;                    // Is market active?
    
    // Pricing data
    uint256 lastTradedPrice;        // Last trade price (basis points)
    uint256 yesBidPrice;            // Best YES bid price
    uint256 yesAskPrice;            // Best YES ask price
    uint256 noBidPrice;             // Best NO bid price
    uint256 noAskPrice;             // Best NO ask price
    
    // Pari-mutuel pools
    uint256 totalPool;              // Total ETH in pool
    uint256 yesPool;                // ETH invested in YES side
    uint256 noPool;                 // ETH invested in NO side
}
```

### Position Structure (User Holdings)
```solidity
struct Position {
    uint256 yesShares;              // User's YES shares
    uint256 noShares;               // User's NO shares
    uint256 totalInvested;          // Total ETH invested
    uint256 yesInvested;            // ETH invested in YES
    uint256 noInvested;             // ETH invested in NO
}
```

### Sell Order Structure
```solidity
struct SellOrder {
    uint256 id;                     // Order ID
    uint256 marketId;                // Which market
    address seller;                  // Who is selling
    bool isYes;                      // YES or NO shares
    uint256 shares;                  // How many shares
    uint256 pricePerShare;           // Price per share (wei)
    uint256 timestamp;               // When created
    bool filled;                     // Is order filled?
    bool cancelled;                  // Is order cancelled?
}
```

### Limit Order Structure
```solidity
struct LimitOrder {
    uint256 marketId;                // Which market
    address trader;                  // Who placed order
    bool isYes;                      // YES or NO
    uint256 price;                   // Price in basis points
    uint256 amount;                  // ETH amount
    uint256 timestamp;               // When created
    bool filled;                     // Is order filled?
    bool cancelled;                  // Is order cancelled?
}
```

---

## ⚙️ Core Functions Explained

### 1. `createMarket()` - Create a New Market
```solidity
function createMarket(
    string memory _question,
    string memory _description,
    string memory _category,
    uint256 _endTime,
    uint256 _resolutionTime
) external payable
```

**What it does:**
- Creates a new prediction market
- Requires payment of `marketCreationFee` (0.01 TCENT)
- Sets up initial market state
- Initializes pricing AMM
- Emits `MarketCreated` event

**Example:**
- Question: "Will Bitcoin reach $100k by 2025?"
- Category: "Crypto"
- End Time: Dec 31, 2024
- Resolution Time: Jan 1, 2025

### 2. `buyShares()` - Buy YES or NO Shares
```solidity
function buyShares(uint256 _marketId, bool _isYes) external payable
```

**What it does:**
1. User sends ETH to buy shares
2. Platform takes 2% fee
3. Remaining 98% is invested
4. Shares calculated based on current price
5. User's position updated
6. Market pools updated
7. Price recalculated using AMM

**Price Calculation:**
- Uses LMSR (Logarithmic Market Scoring Rule)
- Price depends on supply/demand
- More YES shares = higher YES price
- Formula: `shares = (investment * 10000) / currentPrice`

**Example:**
- Current YES price: 50¢ (5000 basis points)
- User invests: 0.1 TCENT
- Platform fee: 0.002 TCENT (2%)
- Investment: 0.098 TCENT
- Shares received: ~0.196 shares

### 3. `placeSellOrder()` - Create a Sell Order
```solidity
function placeSellOrder(
    uint256 _marketId,
    bool _isYes,
    uint256 _shares,
    uint256 _pricePerShare
) external
```

**What it does:**
- Locks user's shares
- Creates a sell order in the order book
- Tries to match with existing limit orders
- If matched, trade executes immediately
- If not matched, order stays open

**User-to-User Trading:**
- No instant selling to AMM
- Must find a buyer
- Price set by seller
- Platform takes 2% fee on trade

### 4. `buyFromSellOrder()` - Buy from Sell Order
```solidity
function buyFromSellOrder(uint256 _orderId) external payable
```

**What it does:**
- Buyer pays seller directly
- Shares transferred to buyer
- Platform fee deducted (2%)
- Order marked as filled
- Trade recorded

### 5. `placeLimitOrder()` - Create Limit Buy Order
```solidity
function placeLimitOrder(
    uint256 _marketId,
    bool _isYes,
    uint256 _price,
    uint256 _amount
) external payable
```

**What it does:**
- Locks buyer's ETH
- Creates limit order at specified price
- Tries to match with sell orders
- If matched, trade executes
- If not matched, order waits

**Automatic Matching:**
- If sell order exists at same price → instant match
- Partial fills supported
- Remaining ETH refunded if fully filled

### 6. `resolveMarket()` - Resolve Market (Admin Only)
```solidity
function resolveMarket(uint256 _marketId, uint8 _outcome) external onlyOwner
```

**What it does:**
- Sets market outcome (YES/NO/INVALID)
- Marks market as resolved
- Removes from active markets
- Emits `MarketResolved` event

**Outcomes:**
- `1` = YES won
- `2` = NO won
- `3` = INVALID (refund all)

### 7. `claimWinnings()` - Individual Winner Claims
```solidity
function claimWinnings(uint256 _marketId) external
```

**What it does:**
- Calculates user's payout
- Refunds investment + share of losing pool
- Deducts 2% platform fee
- Transfers payout to user
- Clears user's position

**Payout Formula:**
```
grossPayout = userInvestment + (losingPool * userShares / totalWinningShares)
platformFee = grossPayout * 2% / 100
netPayout = grossPayout - platformFee
```

### 8. `batchPayoutWinners()` - Pay All Winners at Once
```solidity
function batchPayoutWinners(
    uint256 _marketId,
    address[] calldata _winners
) external returns (uint256 totalPaid, uint256 totalFees)
```

**What it does:**
- Pays all winners in ONE transaction
- Processes up to 200 winners per batch
- Calculates each winner's payout
- Sends all platform fees in one transfer
- Much more gas-efficient than individual claims

---

## 💰 Pari-Mutuel System

### How It Works:

**Traditional Model (House Pays):**
- House guarantees 1 TCENT per share
- House takes all risk
- Winners paid from house vault

**Pari-Mutuel Model (This Platform):**
- Winners split the losing side's pool
- No house vault needed
- All funds come from other users
- Platform takes 2% fee

### Example Scenario:

**Market:** "Will it rain tomorrow?"
- YES Pool: 10 TCENT (100 shares)
- NO Pool: 5 TCENT (50 shares)
- Total Pool: 15 TCENT

**Resolution:** YES wins

**Payout Calculation:**
- YES winners get: Their investment back + share of NO pool
- User with 10 YES shares (10% of YES):
  - Investment: 1 TCENT
  - Share of NO pool: 5 TCENT * 10% = 0.5 TCENT
  - Gross payout: 1 + 0.5 = 1.5 TCENT
  - Platform fee (2%): 0.03 TCENT
  - Net payout: 1.47 TCENT

**NO losers:**
- Lose their investment (5 TCENT)
- Goes to YES winners

### Key Features:
- ✅ Winners get investment back + profit
- ✅ Losers lose their investment
- ✅ Platform takes 2% fee
- ✅ No house risk
- ✅ All funds from users

---

## 📋 Order Book System

### How User-to-User Trading Works:

**1. Selling Shares:**
```
User A has 10 YES shares
User A places sell order: 10 shares @ 0.7 TCENT each
Shares are LOCKED
Order appears in order book
```

**2. Buying from Order:**
```
User B wants to buy YES shares
User B sees User A's sell order
User B pays: 10 * 0.7 = 7 TCENT
Platform fee: 7 * 2% = 0.14 TCENT
User A receives: 7 - 0.14 = 6.86 TCENT
User B gets: 10 YES shares
```

**3. Limit Orders:**
```
User C wants to buy YES @ 0.6 TCENT
User C places limit order with 5 TCENT
ETH is LOCKED
If someone sells @ 0.6 TCENT → instant match
If no match → order waits
```

**4. Automatic Matching:**
- When sell order placed → checks for matching limit orders
- When limit order placed → checks for matching sell orders
- Same price → instant match
- Partial fills supported

### Order States:
- **Open**: Waiting for match
- **Filled**: Fully executed
- **Partially Filled**: Partially executed
- **Cancelled**: User cancelled

---

## 🔒 Security Features

### 1. ReentrancyGuard
```solidity
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
```
- Prevents reentrancy attacks
- Locks functions during execution
- Critical for functions that transfer ETH

### 2. Ownable
```solidity
import "@openzeppelin/contracts/access/Ownable.sol";
```
- Only owner can resolve markets
- Owner can update fees
- Prevents unauthorized access

### 3. Input Validation
```solidity
require(msg.value > 0, "Must send ETH");
require(market.active, "Market not active");
require(!market.resolved, "Market already resolved");
```
- Checks all inputs
- Prevents invalid operations
- Protects against errors

### 4. Safe Math
- Solidity 0.8+ has built-in overflow protection
- All arithmetic is checked
- Prevents integer overflow attacks

### 5. Access Control
- `onlyOwner` modifier for admin functions
- Public functions for trading
- No unauthorized access

---

## 📡 Events & Monitoring

### Key Events:

**Market Events:**
```solidity
event MarketCreated(uint256 indexed marketId, address indexed creator, ...);
event MarketResolved(uint256 indexed marketId, uint8 outcome, ...);
```

**Trading Events:**
```solidity
event SharesPurchased(uint256 indexed marketId, address indexed buyer, ...);
event SharesSold(uint256 indexed marketId, address indexed seller, ...);
```

**Order Events:**
```solidity
event SellOrderPlaced(uint256 indexed orderId, ...);
event SellOrderMatched(uint256 indexed orderId, ...);
event LimitOrderPlaced(uint256 indexed marketId, ...);
```

**Payout Events:**
```solidity
event BatchPayoutCompleted(uint256 indexed marketId, uint256 winnerCount, ...);
```

### Why Events Matter:
- **Frontend can listen** to events in real-time
- **Indexing services** can track all activity
- **Analytics** can analyze market behavior
- **Notifications** can alert users

---

## ⛽ Gas & Costs

### What is Gas?
- **Gas** = computational cost of executing code
- Measured in **wei** or **gwei** (1 gwei = 10^9 wei)
- Users pay gas fees to miners/validators
- More complex operations = more gas

### Gas Costs in This Contract:

**Low Gas:**
- `getCurrentPrice()` - View function (free)
- `getMarket()` - View function (free)
- `getUserPosition()` - View function (free)

**Medium Gas:**
- `buyShares()` - ~150,000 gas
- `placeSellOrder()` - ~100,000 gas
- `buyFromSellOrder()` - ~120,000 gas

**High Gas:**
- `createMarket()` - ~200,000 gas
- `batchPayoutWinners()` - ~50,000 gas per winner
- `resolveMarket()` - ~100,000 gas

### Gas Optimization:
- ✅ Batch operations (batchPayoutWinners)
- ✅ Efficient data structures
- ✅ Minimal storage writes
- ✅ ReentrancyGuard (prevents attacks)

---

## 🔄 Complete Trade Flow

### Example: User Buys YES Shares

1. **User Action:**
   - User connects wallet
   - Clicks "Buy YES"
   - Enters amount: 0.1 TCENT
   - Approves transaction

2. **Transaction Sent:**
   - Transaction sent to blockchain
   - Includes: function call, parameters, ETH amount
   - Gas fee paid

3. **Contract Execution:**
   ```
   buyShares(marketId=1, isYes=true)
   ├─ Check market is active ✓
   ├─ Calculate platform fee (2%) = 0.002 TCENT
   ├─ Investment = 0.098 TCENT
   ├─ Get current price from AMM = 5000 (50¢)
   ├─ Calculate shares = 0.196 shares
   ├─ Update market state
   ├─ Update user position
   ├─ Update pools (yesPool += 0.098)
   ├─ Emit SharesPurchased event
   └─ Return success
   ```

4. **Blockchain Confirmation:**
   - Transaction included in block
   - Block validated by network
   - State updated on blockchain
   - Event emitted

5. **Frontend Update:**
   - Frontend listens for event
   - Updates UI with new data
   - Shows new shares
   - Updates price

---

## 📈 Pricing Mechanism (LMSR)

### Logarithmic Market Scoring Rule

**Formula:**
```
Price_YES = e^(q_YES/b) / (e^(q_YES/b) + e^(q_NO/b))
Price_NO = e^(q_NO/b) / (e^(q_YES/b) + e^(q_NO/b))
```

Where:
- `q_YES` = Total YES shares
- `q_NO` = Total NO shares
- `b` = Liquidity parameter (10 TCENT)
- `e` = Euler's number

### How It Works:
- **More YES shares** → Higher YES price
- **More NO shares** → Higher NO price
- **Prices always sum to 100%**
- **Smooth price curve** (no sudden jumps)

### Example:
- Initial: 0 YES, 0 NO → 50¢ each
- After: 10 YES, 5 NO → YES ~67¢, NO ~33¢
- After: 20 YES, 5 NO → YES ~80¢, NO ~20¢

---

## 🎯 Key Takeaways

1. **Blockchain** = Decentralized, immutable ledger
2. **Smart Contracts** = Self-executing programs on blockchain
3. **Pari-Mutuel** = Winners split losing pool (no house risk)
4. **User-to-User Trading** = Direct peer-to-peer trades
5. **Order Book** = Matching buy/sell orders
6. **Security** = ReentrancyGuard, Ownable, input validation
7. **Events** = Real-time updates for frontend
8. **Gas** = Cost of executing transactions

---

## 🔍 Additional Resources

- **Solidity Docs**: https://docs.soliditylang.org/
- **OpenZeppelin**: https://docs.openzeppelin.com/
- **Ethereum Docs**: https://ethereum.org/en/developers/
- **Hardhat**: https://hardhat.org/

---

**This prediction market is a fully decentralized, trustless system where users can create markets, trade shares, and get paid based on real-world outcomes - all without needing to trust a central authority!**

