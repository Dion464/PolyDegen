// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "hardhat/console.sol";

contract PricingAMM {
    struct Market {
        uint256 yesShares;
        uint256 noShares;
        uint256 liquidity; // total ETH in pool
        uint256 b;         // liquidity parameter (higher = more liquid)
    }

    mapping(uint256 => Market) public markets;
    // Polymarket-style smooth price impact: Higher B = smoother price curve
    // B = 10 ETH provides smooth price impact similar to Polymarket
    // For 0.1 ETH trade: ~0.5-1% price movement (similar to Polymarket)
    // For 1 ETH trade: ~5-10% price movement
    uint256 public constant B_PARAM = 10000000000000000000; // 10 ETH in wei - matches Polymarket's smooth price impact
    uint256 public constant FEE_BASIS_POINTS = 200; // 2% fee

    event MarketCreated(uint256 indexed marketId, uint256 initialLiquidity);
    event YesBought(uint256 indexed marketId, uint256 amount, uint256 newYesPrice, uint256 newNoPrice);
    event NoBought(uint256 indexed marketId, uint256 amount, uint256 newYesPrice, uint256 newNoPrice);

    function createMarket(uint256 marketId, uint256 initialLiquidity) external {
        // Allow overwriting existing markets to fix the issue
        markets[marketId] = Market({
            yesShares: 0,
            noShares: 0,
            liquidity: initialLiquidity,
            b: B_PARAM
        });
        
        emit MarketCreated(marketId, initialLiquidity);
    }
    
    // Update AMM state when shares are bought/sold in the main contract
    function updateMarketState(uint256 marketId, uint256 yesShares, uint256 noShares) external {
        Market storage m = markets[marketId];
        if (m.liquidity == 0) {
            return; // Market not initialized yet
        }
        m.yesShares = yesShares;
        m.noShares = noShares;
        
        console.log(
            "PricingAMM::updateMarketState -> marketId %s, yesShares %s, noShares %s",
            marketId,
            yesShares,
            noShares
        );
    }

    function calculatePrice(uint256 marketId)
        public
        view
        returns (uint256 yesPrice, uint256 noPrice)
    {
        Market memory m = markets[marketId];
        
        // Implement LMSR formula: p_i = e^(q_i/b) / Σ_j e^(q_j/b)
        // For YES/NO: p_YES = e^(q_YES/b) / (e^(q_YES/b) + e^(q_NO/b))
        
        if (m.liquidity == 0 || (m.yesShares == 0 && m.noShares == 0)) {
            // Initial state: 50/50 (e^0 / (e^0 + e^0) = 1/2 = 0.5)
            return (5000, 5000); // 50¢ each in basis points
        }

        uint256 b = m.b > 0 ? m.b : B_PARAM;
        
        // Calculate e^(q_YES/b) and e^(q_NO/b) using LMSR formula
        // q_i is in wei, b is in wei, so q_i/b should be reasonable
        // For small q_i/b, we can use Taylor series
        
        uint256 expYes;
        uint256 expNo;
        
        unchecked {
            if (b > 0) {
                // Calculate q_YES/b and q_NO/b scaled to 1e18
                uint256 qYesOverB = (m.yesShares * 1e18) / b; // Scaled to 1e18
                uint256 qNoOverB = (m.noShares * 1e18) / b;
                
                expYes = expScaled(qYesOverB); // Returns value scaled by 1e18
                expNo = expScaled(qNoOverB);
            } else {
                expYes = 1e18; // e^0 = 1
                expNo = 1e18;
            }
        }
        
        uint256 sumExp = expYes + expNo;
        
        if (sumExp == 0) {
            return (5000, 5000); // Fallback to 50/50
        }
        
        // Calculate prices: p_YES = expYes / sumExp, p_NO = expNo / sumExp
        unchecked {
            // Convert to basis points (multiply by 10000)
            yesPrice = (expYes * 10000) / sumExp;
            noPrice = (expNo * 10000) / sumExp;
            
            // CRITICAL: Clamp prices to prevent 0 or 100% which breaks trading
            // Keep prices in range [100, 9900] basis points (1% to 99%)
            // This ensures trading is always possible on both sides
            uint256 MIN_PRICE = 100;   // 1% minimum
            uint256 MAX_PRICE = 9900;  // 99% maximum
            
            if (yesPrice < MIN_PRICE) {
                yesPrice = MIN_PRICE;
            } else if (yesPrice > MAX_PRICE) {
                yesPrice = MAX_PRICE;
            }
            
            // Ensure they always sum to exactly 10000 (100%)
            noPrice = 10000 - yesPrice;
            
            // Double-check noPrice is also in valid range
            if (noPrice < MIN_PRICE) {
                noPrice = MIN_PRICE;
                yesPrice = 10000 - noPrice;
            } else if (noPrice > MAX_PRICE) {
                noPrice = MAX_PRICE;
                yesPrice = 10000 - noPrice;
            }
        }
    }
    
    // Exponential function for scaled values (x is already scaled, returns scaled result)
    function expScaled(uint256 x) internal pure returns (uint256) {
        // exp(x) for x in reasonable range
        // Use Taylor series: exp(x) ≈ 1 + x + x²/2! + x³/3! + x⁴/4!
        
        if (x == 0) return 1e18; // exp(0) = 1, scaled
        
        unchecked {
            uint256 result = 1e18;
            uint256 term = x;
            
            // Compute up to 6 terms for better accuracy
            for (uint256 i = 1; i <= 6; i++) {
                result += term;
                term = (term * x) / (i * 1e18);
                
                // Stop if term becomes too small
                if (term < 1e12) break;
            }
            
            return result;
        }
    }

    function buyYes(uint256 marketId, uint256 amount) external payable {
        Market storage m = markets[marketId];
        require(m.liquidity > 0, "Market not initialized");

        // Calculate shares to give based on current price
        uint256 sharesToGive = calculateSharesToGive(marketId, true, amount);
        
        // Update shares - this affects pricing
        m.yesShares += sharesToGive;
        m.liquidity += amount;
        
        // Get new prices after the update
        (uint256 newYesPrice, uint256 newNoPrice) = calculatePrice(marketId);
        
        emit YesBought(marketId, amount, newYesPrice, newNoPrice);
    }

    function buyNo(uint256 marketId, uint256 amount) external payable {
        Market storage m = markets[marketId];
        require(m.liquidity > 0, "Market not initialized");

        // Calculate shares to give based on current price
        uint256 sharesToGive = calculateSharesToGive(marketId, false, amount);
        
        // Update shares - this affects pricing
        m.noShares += sharesToGive;
        m.liquidity += amount;
        
        // Get new prices after the update
        (uint256 newYesPrice, uint256 newNoPrice) = calculatePrice(marketId);
        
        emit NoBought(marketId, amount, newYesPrice, newNoPrice);
    }

    // Sell YES shares - decreases YES shares, increases YES price
    function sellYes(uint256 marketId, uint256 shares) external {
        Market storage m = markets[marketId];
        require(m.liquidity > 0, "Market not initialized");
        require(shares > 0, "Must sell at least some shares");
        require(m.yesShares >= shares, "Not enough YES shares in pool");
        
        // Decrease YES shares - this increases YES price (less supply)
        m.yesShares -= shares;
        
        // Get new prices after the update
        (uint256 newYesPrice, uint256 newNoPrice) = calculatePrice(marketId);
        
        emit YesBought(marketId, shares, newYesPrice, newNoPrice);
    }

    // Sell NO shares - decreases NO shares, increases NO price
    function sellNo(uint256 marketId, uint256 shares) external {
        Market storage m = markets[marketId];
        require(m.liquidity > 0, "Market not initialized");
        require(shares > 0, "Must sell at least some shares");
        require(m.noShares >= shares, "Not enough NO shares in pool");
        
        // Decrease NO shares - this increases NO price (less supply)
        m.noShares -= shares;
        
        // Get new prices after the update
        (uint256 newYesPrice, uint256 newNoPrice) = calculatePrice(marketId);
        
        emit NoBought(marketId, shares, newYesPrice, newNoPrice);
    }

    function calculateSharesToGive(uint256 marketId, bool isYes, uint256 amount) 
        public 
        view 
        returns (uint256) 
    {
        Market memory m = markets[marketId];
        
        // For initial liquidity or edge cases, use 1:1 ratio
        if (m.liquidity == 0 || (m.yesShares == 0 && m.noShares == 0)) {
            return amount; // 1:1 ratio for initial liquidity
        }

        // Calculate current price using the same dampening logic
        uint256 totalShares = m.yesShares + m.noShares;
        
        if (totalShares == 0) {
            return amount;
        }
        
        // Get current price from calculatePrice function for consistency
        (uint256 yesPrice, uint256 noPrice) = calculatePrice(marketId);
        uint256 currentPrice = isYes ? yesPrice : noPrice;
        uint256 sharesToGive;
        
        // Calculate shares based on current price
        // Formula: shares = (amount * 10000) / currentPrice
        // currentPrice is in basis points (5000 = 50%)
        
        if (currentPrice == 0) {
            currentPrice = 1; // Prevent division by zero
        }
        
        // Use unchecked to avoid overflow panic
        unchecked {
            // shares = (amount * 10000) / currentPrice
            // This may overflow for very large amounts, but in practice won't
            sharesToGive = (amount * 10000) / currentPrice;
            
            // Apply a small fee (2%)
            sharesToGive = (sharesToGive * 9800) / 10000;
            
            // Ensure minimum of 1 wei share to avoid returning 0
            if (sharesToGive == 0) {
                sharesToGive = 1;
            }
        }
        
        return sharesToGive;
    }

    function calculateCost(uint256 yesShares, uint256 noShares) internal pure returns (uint256) {
        // Prevent division by zero
        if (B_PARAM == 0) {
            return 0;
        }
        
        // C = b * ln(exp(q_yes/b) + exp(q_no/b))
        uint256 expYes = exp(yesShares * 1e18 / B_PARAM);
        uint256 expNo = exp(noShares * 1e18 / B_PARAM);
        uint256 sum = expYes + expNo;
        
        // Prevent overflow
        if (sum == 0) {
            return 0;
        }
        
        // Approximate ln(x) for small x
        if (sum <= 1e18) {
            return B_PARAM * (sum - 1e18) / 1e18;
        }
        
        return B_PARAM * lnApprox(sum);
    }

    // Basic exponential approximation for LMSR
    function exp(uint256 x) internal pure returns (uint256) {
        // exp(x) ≈ 1 + x + x²/2! + x³/3! for small x
        if (x == 0) return 1e18;
        
        uint256 result = 1e18;
        uint256 term = x;
        
        for (uint256 i = 1; i <= 3; i++) {
            result += term;
            term = (term * x) / (i * 1e18);
        }
        
        return result;
    }

    // Basic logarithm approximation
    function lnApprox(uint256 x) internal pure returns (uint256) {
        // Simple approximation: ln(x) ≈ x - 1 for x close to 1
        if (x >= 1e18) {
            return (x - 1e18) / 1e18;
        }
        return 0;
    }

    // Get current market state
    function getMarketState(uint256 marketId) external view returns (
        uint256 yesShares,
        uint256 noShares,
        uint256 liquidity,
        uint256 yesPrice,
        uint256 noPrice
    ) {
        Market memory m = markets[marketId];
        (yesPrice, noPrice) = calculatePrice(marketId);
        
        return (m.yesShares, m.noShares, m.liquidity, yesPrice, noPrice);
    }
}
