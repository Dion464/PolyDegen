// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "./PricingAMM.sol";

contract ETHPredictionMarket is ReentrancyGuard, Ownable {
    PricingAMM public pricingAMM;
    struct Market {
        uint256 id;
        string question;
        string description;
        string category;
        uint256 endTime;
        uint256 resolutionTime;
        bool resolved;
        uint8 outcome; // 0 = not resolved, 1 = YES, 2 = NO, 3 = INVALID
        uint256 totalYesShares;
        uint256 totalNoShares;
        uint256 totalVolume;
        address creator;
        uint256 createdAt;
        bool active;
        // Polymarket-style orderbook pricing
        uint256 lastTradedPrice; // Last traded price in basis points (0-10000)
        uint256 yesBidPrice; // Best bid for YES in basis points
        uint256 yesAskPrice; // Best ask for YES in basis points
        uint256 noBidPrice;  // Best bid for NO in basis points
        uint256 noAskPrice;  // Best ask for NO in basis points
        // Pari-mutuel pool tracking
        uint256 totalPool; // Total ETH pooled from all purchases (for pari-mutuel payouts)
        uint256 yesPool; // Total ETH invested in YES side (after platform fees)
        uint256 noPool;  // Total ETH invested in NO side (after platform fees)
    }

    struct Position {
        uint256 yesShares;
        uint256 noShares;
        uint256 totalInvested;
        uint256 yesInvested; // Investment in YES side
        uint256 noInvested;  // Investment in NO side
    }

    struct Trade {
        uint256 marketId;
        address trader;
        bool isYes;
        uint256 shares;
        uint256 price;
        uint256 timestamp;
    }

    struct LimitOrder {
        uint256 marketId;
        address trader;
        bool isYes;
        uint256 price; // Price in basis points (0-10000)
        uint256 amount; // Amount in ETH
        uint256 timestamp;
        bool filled;
        bool cancelled;
    }

    // Sell Order for user-to-user trading
    struct SellOrder {
        uint256 id;
        uint256 marketId;
        address seller;
        bool isYes; // true = selling YES shares, false = selling NO shares
        uint256 shares; // Number of shares to sell
        uint256 pricePerShare; // Price per share in wei
        uint256 timestamp;
        bool filled;
        bool cancelled;
    }

    // State variables
    uint256 public nextMarketId;
    uint256 public marketCreationFee; // Fee to create market
    uint256 public platformFeePercent; // Platform fee in basis points
    address public feeRecipient; // Address to receive platform fees
    
    mapping(uint256 => Market) public markets;
    mapping(uint256 => mapping(address => Position)) public positions;
    mapping(address => uint256[]) public userMarkets;
    
    uint256[] public activeMarketIds;
    Trade[] public allTrades;
    LimitOrder[] public allLimitOrders;
    mapping(uint256 => uint256[]) public marketLimitOrders; // marketId => order IDs
    
    // Sell order book for user-to-user trading
    SellOrder[] public allSellOrders;
    mapping(uint256 => uint256[]) public marketSellOrders; // marketId => sell order IDs
    mapping(address => uint256[]) public userSellOrders; // user => sell order IDs
    
    // Optimistic Oracle Resolution System
    struct ResolutionProposal {
        uint8 proposedOutcome; // 1=YES, 2=NO, 3=INVALID
        address proposer;
        uint256 proposalTime;
        uint256 proposerBond;
        bool disputed;
        address disputer;
        uint256 disputeTime;
        uint256 disputerBond;
        bool finalized;
    }
    
    mapping(uint256 => ResolutionProposal) public resolutionProposals;
    uint256 public proposerBondAmount = 0.01 ether; // Default bond amount (0.01 ETH)
    uint256 public disputePeriod = 1 days; // Default dispute period (1 day)
    uint256 public disputerBondMultiplier = 2; // Disputer must post 2x the proposer bond
    
    // Events
    event MarketCreated(
        uint256 indexed marketId,
        address indexed creator,
        string question,
        string category,
        uint256 endTime
    );
    
    event SharesPurchased(
        uint256 indexed marketId,
        address indexed buyer,
        bool isYes,
        uint256 shares,
        uint256 cost,
        uint256 newPrice
    );
    
    event SharesSold(
        uint256 indexed marketId,
        address indexed seller,
        bool isYes,
        uint256 shares,
        uint256 payout,
        uint256 newPrice
    );
    
    event MarketResolved(
        uint256 indexed marketId,
        uint8 outcome,
        uint256 totalPayout
    );
    
    event LimitOrderPlaced(uint256 indexed marketId, address indexed trader, bool isYes, uint256 price, uint256 amount);
    
    // Sell order events for user-to-user trading
    event SellOrderPlaced(
        uint256 indexed orderId,
        uint256 indexed marketId,
        address indexed seller,
        bool isYes,
        uint256 shares,
        uint256 pricePerShare
    );
    
    event SellOrderMatched(
        uint256 indexed orderId,
        uint256 indexed marketId,
        address indexed buyer,
        address seller,
        uint256 shares,
        uint256 totalPrice
    );
    
    event SellOrderCancelled(
        uint256 indexed orderId,
        uint256 indexed marketId,
        address indexed seller
    );
    
    // Optimistic Oracle Events
    event ResolutionProposed(
        uint256 indexed marketId,
        address indexed proposer,
        uint8 proposedOutcome,
        uint256 proposalTime,
        uint256 bond
    );
    
    event ResolutionDisputed(
        uint256 indexed marketId,
        address indexed disputer,
        uint256 disputeTime,
        uint256 bond
    );
    
    event ResolutionFinalized(
        uint256 indexed marketId,
        uint8 finalOutcome,
        address indexed finalizer
    );

    constructor(uint256 _marketCreationFee, uint256 _platformFeePercent, address _feeRecipient) {
        nextMarketId = 1;
        marketCreationFee = _marketCreationFee;
        platformFeePercent = _platformFeePercent;
        feeRecipient = _feeRecipient;
        require(_feeRecipient != address(0), "Fee recipient cannot be zero address");
        
        // Deploy and initialize the pricing AMM with a unique salt
        // Use block.timestamp to ensure unique deployment
        bytes32 salt = keccak256(abi.encodePacked(block.timestamp, block.difficulty));
        pricingAMM = new PricingAMM{salt: salt}();
    }

    // Create a new prediction market
    function createMarket(
        string memory _question,
        string memory _description,
        string memory _category,
        uint256 _endTime,
        uint256 _resolutionTime
    ) external payable nonReentrant {
        require(msg.value >= marketCreationFee, "Insufficient market creation fee");
        require(_endTime > block.timestamp, "End time must be in future");
        require(_resolutionTime > _endTime, "Resolution time must be after end time");
        require(bytes(_question).length > 0, "Question cannot be empty");

        uint256 marketId = nextMarketId++;
        
        markets[marketId] = Market({
            id: marketId,
            question: _question,
            description: _description,
            category: _category,
            endTime: _endTime,
            resolutionTime: _resolutionTime,
            resolved: false,
            outcome: 0,
            totalYesShares: 0,
            totalNoShares: 0,
            totalVolume: 0,
            creator: msg.sender,
            createdAt: block.timestamp,
            active: true,
            // Initialize Polymarket-style pricing
            lastTradedPrice: 5000, // 50% initial price
            yesBidPrice: 0, // No initial bids
            yesAskPrice: 10000, // No initial asks
            noBidPrice: 0, // No initial bids
            noAskPrice: 10000, // No initial asks
            // Pari-mutuel pool starts at 0
            totalPool: 0,
            yesPool: 0,
            noPool: 0
        });

        activeMarketIds.push(marketId);
        userMarkets[msg.sender].push(marketId);

        // Initialize pricing AMM for this market
        pricingAMM.createMarket(marketId, 1 ether); // Initial liquidity of 1 ETH

        emit MarketCreated(marketId, msg.sender, _question, _category, _endTime);
    }

    // Buy shares (YES or NO)
    function buyShares(uint256 _marketId, bool _isYes) external payable nonReentrant {
        require(msg.value > 0, "Must send ETH to buy shares");
        Market storage market = markets[_marketId];
        require(market.active, "Market not active");
        require(!market.resolved, "Market already resolved");
        require(block.timestamp < market.endTime, "Market has ended");

        // Ensure AMM market is properly initialized before proceeding
        // Check liquidity to verify market exists in AMM
        (,, uint256 ammLiquidity,) = pricingAMM.markets(_marketId);
        require(ammLiquidity > 0, "AMM market not initialized - please wait for market creation to complete");

        // Update AMM state to current market state BEFORE calculating shares
        pricingAMM.updateMarketState(_marketId, market.totalYesShares, market.totalNoShares);
        
        // Calculate platform fee
        uint256 platformFee;
        uint256 investmentAmount;
        unchecked {
            platformFee = (msg.value * platformFeePercent) / 10000;
            investmentAmount = msg.value - platformFee;
        }

        // Calculate shares based on current price
        // If price is 50¢, then 0.1 ETH should buy ~0.2 shares
        // Formula: shares = (investmentAmount * priceMultiplier) / currentPrice
        // where currentPrice is in basis points (5000 = 50¢)
        
        uint256 shares;
        unchecked {
            // Get current price from AMM
            (uint256 currentYesPrice, uint256 currentNoPrice) = pricingAMM.calculatePrice(_marketId);
            
            // Ensure AMM returned valid prices (should always return at least 5000 for initial state)
            require(currentYesPrice > 0 && currentNoPrice > 0, "AMM price calculation failed");
            uint256 currentPrice = _isYes ? currentYesPrice : currentNoPrice;
            
            // AMM clamps prices to 100-9900 basis points (1%-99%), allow trading at any valid price
            require(currentPrice > 0, "Invalid price");
            
            // Calculate shares: investmentAmount / (currentPrice / 10000)
            // Example: 0.1 ETH / (5000/10000) = 0.1 ETH / 0.5 = 0.2 shares
            // To avoid division loss: shares = (investmentAmount * 10000) / currentPrice
            // But we need to protect against overflow
            
            // Correct calculation: at 50¢ price, 0.1 ETH buys 0.2 shares
            // Formula: shares = investmentAmount * 10000 / currentPrice
            // Example: (0.1 * 10000) / 5000 = 1000 / 5000 = 0.2
            // Need to scale properly for wei amounts
            shares = (investmentAmount * 10000) / currentPrice;
            
            // Apply 98% to account for fees/slippage
            shares = (shares * 9800) / 10000;
            
            // Ensure minimum
            if (shares == 0) {
                shares = 1;
            }
        }
        require(shares > 0, "No shares calculated");

        // Update market state
        if (_isYes) {
            market.totalYesShares += shares;
        } else {
            market.totalNoShares += shares;
        }
        market.totalVolume += msg.value;
        // Track actual ETH deposited for pari-mutuel payouts (investment amount minus platform fee)
        market.totalPool += investmentAmount;
        // Track pool per side
        if (_isYes) {
            market.yesPool += investmentAmount;
        } else {
            market.noPool += investmentAmount;
        }

        // Update user position
        Position storage position = positions[_marketId][msg.sender];
        if (_isYes) {
            position.yesShares += shares;
            position.yesInvested += investmentAmount; // Track investment in YES side (after fee)
        } else {
            position.noShares += shares;
            position.noInvested += investmentAmount; // Track investment in NO side (after fee)
        }
        position.totalInvested += msg.value;

        // Update AMM state again with the new totals AFTER adding shares
        pricingAMM.updateMarketState(_marketId, market.totalYesShares, market.totalNoShares);
        
        // Get current prices from AMM
        (uint256 finalYesPrice, uint256 finalNoPrice) = pricingAMM.calculatePrice(_marketId);
        market.lastTradedPrice = _isYes ? finalYesPrice : finalNoPrice;

        // Record trade
        allTrades.push(Trade({
            marketId: _marketId,
            trader: msg.sender,
            isYes: _isYes,
            shares: shares,
            price: _isYes ? finalYesPrice : finalNoPrice,
            timestamp: block.timestamp
        }));

        emit SharesPurchased(_marketId, msg.sender, _isYes, shares, msg.value, _isYes ? finalYesPrice : finalNoPrice);
    }

    // ============ USER-TO-USER SELL ORDER SYSTEM ============
    // Selling shares creates an order that must be matched by a buyer
    // No instant selling - all trades are user-to-user
    
    /**
     * @dev Internal function to match a sell order with a limit order
     * @param _sellOrderId The sell order ID to match
     * @return matched Whether a match was found and executed
     * @return matchedOrderId The limit order ID that was matched (0 if no match)
     */
    function _tryMatchSellOrderWithLimitOrder(uint256 _sellOrderId) internal returns (bool matched, uint256 matchedOrderId) {
        SellOrder storage sellOrder = allSellOrders[_sellOrderId];
        if (sellOrder.filled || sellOrder.cancelled) {
            return (false, 0);
        }

        // Convert sell order price to basis points for comparison
        uint256 sellPriceBasisPoints = (sellOrder.pricePerShare * 10000) / 1 ether;
        
        // Find matching limit order (same market, same side, same price)
        uint256[] storage limitOrderIds = marketLimitOrders[sellOrder.marketId];
        
        for (uint256 i = 0; i < limitOrderIds.length; i++) {
            LimitOrder storage limitOrder = allLimitOrders[limitOrderIds[i]];
            
            // Check if limit order matches:
            // 1. Not filled or cancelled
            // 2. Same side (both YES or both NO)
            // 3. Same price (within 1 basis point tolerance for rounding)
            // 4. Limit order has enough ETH to buy the shares
            if (!limitOrder.filled && 
                !limitOrder.cancelled && 
                limitOrder.isYes == sellOrder.isYes &&
                (limitOrder.price >= sellPriceBasisPoints ? limitOrder.price - sellPriceBasisPoints : sellPriceBasisPoints - limitOrder.price) <= 1) {
                
                // Calculate how many shares the limit order can buy
                // Limit order amount is in ETH, we need to calculate shares at the price
                uint256 sharesLimitOrderCanBuy = (limitOrder.amount * 10000) / limitOrder.price;
                
                // Match the minimum of what seller wants to sell and what buyer wants to buy
                uint256 sharesToTrade = sellOrder.shares < sharesLimitOrderCanBuy ? sellOrder.shares : sharesLimitOrderCanBuy;
                
                if (sharesToTrade > 0) {
                    // Execute the match
                    uint256 totalCost = sharesToTrade * sellOrder.pricePerShare;
                    uint256 platformFee = (totalCost * platformFeePercent) / 10000;
                    uint256 sellerPayout = totalCost - platformFee;
                    
                    // Mark orders as filled (or partially filled)
                    if (sharesToTrade == sellOrder.shares) {
                        sellOrder.filled = true;
                    } else {
                        // Partial fill - reduce sell order shares
                        sellOrder.shares -= sharesToTrade;
                    }
                    
                    if (sharesToTrade == sharesLimitOrderCanBuy) {
                        limitOrder.filled = true;
                        limitOrder.amount = 0;
                    } else {
                        // Partial fill - reduce limit order amount
                        limitOrder.amount -= totalCost;
                    }
                    
                    // Transfer shares to limit order buyer
                    Position storage buyerPosition = positions[sellOrder.marketId][limitOrder.trader];
                    if (sellOrder.isYes) {
                        buyerPosition.yesShares += sharesToTrade;
                    } else {
                        buyerPosition.noShares += sharesToTrade;
                    }
                    buyerPosition.totalInvested += totalCost;
                    
                    // Pay seller
                    payable(sellOrder.seller).transfer(sellerPayout);
                    
                    // Refund excess ETH from limit order if any
                    if (limitOrder.amount > 0 && limitOrder.filled) {
                        payable(limitOrder.trader).transfer(limitOrder.amount);
                    }
                    
                    // Record trade
                    allTrades.push(Trade({
                        marketId: sellOrder.marketId,
                        trader: limitOrder.trader,
                        isYes: sellOrder.isYes,
                        shares: sharesToTrade,
                        price: sellPriceBasisPoints,
                        timestamp: block.timestamp
                    }));
                    
                    Market storage market = markets[sellOrder.marketId];
                    market.totalVolume += totalCost;
                    
                    emit SellOrderMatched(_sellOrderId, sellOrder.marketId, limitOrder.trader, sellOrder.seller, sharesToTrade, totalCost);
                    emit SharesSold(sellOrder.marketId, sellOrder.seller, sellOrder.isYes, sharesToTrade, sellerPayout, sellPriceBasisPoints);
                    emit SharesPurchased(sellOrder.marketId, limitOrder.trader, sellOrder.isYes, sharesToTrade, totalCost, sellPriceBasisPoints);
                    
                    return (true, limitOrderIds[i]);
                }
            }
        }
        
        return (false, 0);
    }

    /**
     * @dev Place a sell order for shares (user-to-user model)
     * Shares are locked until order is filled or cancelled
     * Automatically matches with existing limit orders at the same price
     * @param _marketId The market ID
     * @param _isYes True for YES shares, false for NO shares
     * @param _shares Number of shares to sell
     * @param _pricePerShare Price per share in wei (e.g., 0.5 ETH = 5e17 wei)
     */
    function placeSellOrder(uint256 _marketId, bool _isYes, uint256 _shares, uint256 _pricePerShare) external nonReentrant {
        Market storage market = markets[_marketId];
        require(market.active, "Market not active");
        require(!market.resolved, "Market already resolved");
        require(block.timestamp < market.endTime, "Market has ended");
        require(_shares > 0, "Must sell at least some shares");
        require(_pricePerShare > 0, "Price must be positive");

        Position storage position = positions[_marketId][msg.sender];
        
        // Check user has enough shares
        if (_isYes) {
            require(position.yesShares >= _shares, "Insufficient YES shares");
            // Lock shares by removing from position
            position.yesShares -= _shares;
        } else {
            require(position.noShares >= _shares, "Insufficient NO shares");
            // Lock shares by removing from position
            position.noShares -= _shares;
        }

        // Create sell order
        uint256 orderId = allSellOrders.length;
        allSellOrders.push(SellOrder({
            id: orderId,
            marketId: _marketId,
            seller: msg.sender,
            isYes: _isYes,
            shares: _shares,
            pricePerShare: _pricePerShare,
            timestamp: block.timestamp,
            filled: false,
            cancelled: false
        }));

        // Track order in mappings
        marketSellOrders[_marketId].push(orderId);
        userSellOrders[msg.sender].push(orderId);

        emit SellOrderPlaced(orderId, _marketId, msg.sender, _isYes, _shares, _pricePerShare);
        
        // Try to match with existing limit orders
        _tryMatchSellOrderWithLimitOrder(orderId);
        
        // If fully matched, the order is already filled
        // If partially matched or not matched, the order remains open
    }

    /**
     * @dev Buy shares from an existing sell order (user-to-user trade)
     * Buyer pays the seller directly
     * @param _orderId The sell order ID to buy from
     */
    function buyFromSellOrder(uint256 _orderId) external payable nonReentrant {
        require(_orderId < allSellOrders.length, "Order does not exist");
        SellOrder storage order = allSellOrders[_orderId];
        
        require(!order.filled, "Order already filled");
        require(!order.cancelled, "Order was cancelled");
        
        Market storage market = markets[order.marketId];
        require(market.active, "Market not active");
        require(!market.resolved, "Market already resolved");
        require(block.timestamp < market.endTime, "Market has ended");
        
        // Calculate total cost
        uint256 totalCost = order.shares * order.pricePerShare;
        require(msg.value >= totalCost, "Insufficient payment");
        
        // Calculate platform fee (2%)
        uint256 platformFee = (totalCost * platformFeePercent) / 10000;
        uint256 sellerPayout = totalCost - platformFee;
        
        // Mark order as filled
        order.filled = true;
        
        // Transfer shares to buyer
        Position storage buyerPosition = positions[order.marketId][msg.sender];
        if (order.isYes) {
            buyerPosition.yesShares += order.shares;
        } else {
            buyerPosition.noShares += order.shares;
        }
        buyerPosition.totalInvested += totalCost;
        
        // Note: We don't reduce market.totalYesShares/totalNoShares because
        // shares are just transferred between users, not created/destroyed
        // The total shares in circulation remain the same

        // Record trade
        allTrades.push(Trade({
            marketId: order.marketId,
            trader: msg.sender,
            isYes: order.isYes,
            shares: order.shares,
            price: (order.pricePerShare * 10000) / 1 ether, // Convert to basis points
            timestamp: block.timestamp
        }));
        
        // Pay seller
        payable(order.seller).transfer(sellerPayout);
        
        // Refund excess payment
        if (msg.value > totalCost) {
            payable(msg.sender).transfer(msg.value - totalCost);
        }
        
        // Update market volume
        market.totalVolume += totalCost;
        
        emit SellOrderMatched(_orderId, order.marketId, msg.sender, order.seller, order.shares, totalCost);
        emit SharesSold(order.marketId, order.seller, order.isYes, order.shares, sellerPayout, (order.pricePerShare * 10000) / 1 ether);
    }

    /**
     * @dev Cancel a sell order and return shares to seller
     * @param _orderId The sell order ID to cancel
     */
    function cancelSellOrder(uint256 _orderId) external nonReentrant {
        require(_orderId < allSellOrders.length, "Order does not exist");
        SellOrder storage order = allSellOrders[_orderId];
        
        require(order.seller == msg.sender, "Not your order");
        require(!order.filled, "Order already filled");
        require(!order.cancelled, "Order already cancelled");
        
        // Mark as cancelled
        order.cancelled = true;
        
        // Return shares to seller
        Position storage position = positions[order.marketId][msg.sender];
        if (order.isYes) {
            position.yesShares += order.shares;
        } else {
            position.noShares += order.shares;
        }
        
        emit SellOrderCancelled(_orderId, order.marketId, msg.sender);
    }

    /**
     * @dev Get all active sell orders for a market
     * @param _marketId The market ID
     * @return activeSellOrders Array of active sell orders
     */
    function getMarketSellOrders(uint256 _marketId) external view returns (SellOrder[] memory) {
        uint256[] storage orderIds = marketSellOrders[_marketId];
        
        // Count active orders
        uint256 activeCount = 0;
        for (uint256 i = 0; i < orderIds.length; i++) {
            SellOrder storage order = allSellOrders[orderIds[i]];
            if (!order.filled && !order.cancelled) {
                activeCount++;
            }
        }
        
        // Build result array
        SellOrder[] memory activeSellOrders = new SellOrder[](activeCount);
        uint256 index = 0;
        for (uint256 i = 0; i < orderIds.length; i++) {
            SellOrder storage order = allSellOrders[orderIds[i]];
            if (!order.filled && !order.cancelled) {
                activeSellOrders[index] = order;
                index++;
            }
        }
        
        return activeSellOrders;
    }

    /**
     * @dev Get all sell orders for a user
     * @param _user The user address
     * @return userOrders Array of user's sell orders
     */
    function getUserSellOrders(address _user) external view returns (SellOrder[] memory) {
        uint256[] storage orderIds = userSellOrders[_user];
        SellOrder[] memory userOrders = new SellOrder[](orderIds.length);
        
        for (uint256 i = 0; i < orderIds.length; i++) {
            userOrders[i] = allSellOrders[orderIds[i]];
        }
        
        return userOrders;
    }

    // Legacy sellShares function - redirects to placeSellOrder with current market price
    // This maintains backward compatibility with existing frontends
    function sellShares(uint256 _marketId, bool _isYes, uint256 _shares) external nonReentrant {
        Market storage market = markets[_marketId];
        require(market.active, "Market not active");
        require(!market.resolved, "Market already resolved");
        require(block.timestamp < market.endTime, "Market has ended");
        require(_shares > 0, "Must sell at least some shares");

        Position storage position = positions[_marketId][msg.sender];
        
        // Check user has enough shares
        if (_isYes) {
            require(position.yesShares >= _shares, "Insufficient YES shares");
            position.yesShares -= _shares;
        } else {
            require(position.noShares >= _shares, "Insufficient NO shares");
            position.noShares -= _shares;
        }

        // Get current price from AMM to set default sell price
        (uint256 currentYesPrice, uint256 currentNoPrice) = pricingAMM.calculatePrice(_marketId);
        uint256 currentPrice = _isYes ? currentYesPrice : currentNoPrice;
        
        // Convert basis points to wei price per share
        // If price is 5000 basis points (50%), price per share = 0.5 ETH
        uint256 pricePerShare = (currentPrice * 1 ether) / 10000;
        
        // Create sell order
        uint256 orderId = allSellOrders.length;
        allSellOrders.push(SellOrder({
            id: orderId,
            marketId: _marketId,
            seller: msg.sender,
            isYes: _isYes,
            shares: _shares,
            pricePerShare: pricePerShare,
            timestamp: block.timestamp,
            filled: false,
            cancelled: false
        }));

        // Track order in mappings
        marketSellOrders[_marketId].push(orderId);
        userSellOrders[msg.sender].push(orderId);

        emit SellOrderPlaced(orderId, _marketId, msg.sender, _isYes, _shares, pricePerShare);
        // Note: SharesSold event is emitted when order is matched, not when placed
    }

    // ============ Optimistic Oracle Resolution Functions ============
    
    /**
     * @dev Propose a resolution for a market (anyone can propose with bond)
     * @param _marketId The market to propose resolution for
     * @param _proposedOutcome The outcome being proposed (1=YES, 2=NO, 3=INVALID)
     */
    function proposeResolution(uint256 _marketId, uint8 _proposedOutcome) external payable nonReentrant {
        Market storage market = markets[_marketId];
        require(market.active, "Market not active");
        require(!market.resolved, "Market already resolved");
        require(_proposedOutcome >= 1 && _proposedOutcome <= 3, "Invalid outcome");
        require(block.timestamp >= market.resolutionTime, "Market not ready for resolution");
        require(msg.value >= proposerBondAmount, "Insufficient bond amount");
        
        ResolutionProposal storage proposal = resolutionProposals[_marketId];
        require(proposal.proposer == address(0) || proposal.finalized, "Proposal already exists or disputed");
        
        // If there was a previous proposal that was disputed, create new one
        if (proposal.disputed) {
            // Previous proposal was disputed, allow new proposal
            delete resolutionProposals[_marketId];
        }
        
        // Create new proposal
        proposal.proposedOutcome = _proposedOutcome;
        proposal.proposer = msg.sender;
        proposal.proposalTime = block.timestamp;
        proposal.proposerBond = msg.value;
        proposal.disputed = false;
        proposal.finalized = false;
        
        emit ResolutionProposed(_marketId, msg.sender, _proposedOutcome, block.timestamp, msg.value);
    }
    
    /**
     * @dev Dispute a proposed resolution (requires posting bond)
     * @param _marketId The market with the proposal to dispute
     */
    function disputeResolution(uint256 _marketId) external payable nonReentrant {
        ResolutionProposal storage proposal = resolutionProposals[_marketId];
        require(proposal.proposer != address(0), "No proposal exists");
        require(!proposal.disputed, "Already disputed");
        require(!proposal.finalized, "Already finalized");
        require(block.timestamp < proposal.proposalTime + disputePeriod, "Dispute period expired");
        
        uint256 requiredBond = proposal.proposerBond * disputerBondMultiplier;
        require(msg.value >= requiredBond, "Insufficient dispute bond");
        
        proposal.disputed = true;
        proposal.disputer = msg.sender;
        proposal.disputeTime = block.timestamp;
        proposal.disputerBond = msg.value;
        
        // Return proposer's bond to them (they lost)
        if (proposal.proposerBond > 0) {
            payable(proposal.proposer).transfer(proposal.proposerBond);
            proposal.proposerBond = 0;
        }
        
        emit ResolutionDisputed(_marketId, msg.sender, block.timestamp, msg.value);
        
        // Clear the proposal to allow new proposal
        delete resolutionProposals[_marketId];
    }
    
    /**
     * @dev Finalize a resolution if dispute period has passed
     * @param _marketId The market to finalize resolution for
     */
    function finalizeResolution(uint256 _marketId) external nonReentrant {
        Market storage market = markets[_marketId];
        ResolutionProposal storage proposal = resolutionProposals[_marketId];
        
        require(proposal.proposer != address(0), "No proposal exists");
        require(!proposal.disputed, "Proposal was disputed");
        require(!proposal.finalized, "Already finalized");
        require(block.timestamp >= proposal.proposalTime + disputePeriod, "Dispute period not expired");
        require(!market.resolved, "Market already resolved");
        
        // Finalize the resolution
        proposal.finalized = true;
        market.resolved = true;
        market.outcome = proposal.proposedOutcome;
        market.active = false;
        
        // Return proposer's bond as reward for correct resolution
        if (proposal.proposerBond > 0) {
            payable(proposal.proposer).transfer(proposal.proposerBond);
        }
        
        // Remove from active markets
        for (uint i = 0; i < activeMarketIds.length; i++) {
            if (activeMarketIds[i] == _marketId) {
                activeMarketIds[i] = activeMarketIds[activeMarketIds.length - 1];
                activeMarketIds.pop();
                break;
            }
        }
        
        emit ResolutionFinalized(_marketId, proposal.proposedOutcome, msg.sender);
        emit MarketResolved(_marketId, proposal.proposedOutcome, market.totalVolume);
    }
    
    /**
     * @dev Get resolution proposal details
     * @param _marketId The market ID
     */
    function getResolutionProposal(uint256 _marketId) external view returns (
        uint8 proposedOutcome,
        address proposer,
        uint256 proposalTime,
        uint256 proposerBond,
        bool disputed,
        address disputer,
        uint256 disputeTime,
        bool finalized,
        uint256 timeUntilFinalizable
    ) {
        ResolutionProposal memory proposal = resolutionProposals[_marketId];
        uint256 finalizableTime = proposal.proposalTime + disputePeriod;
        
        return (
            proposal.proposedOutcome,
            proposal.proposer,
            proposal.proposalTime,
            proposal.proposerBond,
            proposal.disputed,
            proposal.disputer,
            proposal.disputeTime,
            proposal.finalized,
            block.timestamp >= finalizableTime ? 0 : finalizableTime - block.timestamp
        );
    }
    
    // ============ Admin Functions for Optimistic Oracle ============
    
    /**
     * @dev Set the proposer bond amount (only owner)
     */
    function setProposerBondAmount(uint256 _amount) external onlyOwner {
        proposerBondAmount = _amount;
    }
    
    /**
     * @dev Set the dispute period (only owner)
     */
    function setDisputePeriod(uint256 _period) external onlyOwner {
        disputePeriod = _period;
    }
    
    /**
     * @dev Set the disputer bond multiplier (only owner)
     */
    function setDisputerBondMultiplier(uint256 _multiplier) external onlyOwner {
        disputerBondMultiplier = _multiplier;
    }
    
    // ============ Legacy Resolution Functions (for backward compatibility) ============
    
    /**
     * @dev Resolve market (anyone can resolve after resolution time - they pay gas fees)
     * This allows admins or anyone to resolve markets after the resolution window opens
     */
    function resolveMarket(uint256 _marketId, uint8 _outcome) external nonReentrant {
        Market storage market = markets[_marketId];
        require(market.active, "Market not active");
        require(!market.resolved, "Market already resolved");
        require(_outcome >= 1 && _outcome <= 3, "Invalid outcome"); // 1=YES, 2=NO, 3=INVALID
        require(
            msg.sender == owner() || 
            block.timestamp >= market.resolutionTime,
            "Resolution time not reached yet"
        );

        // Clear any existing proposals
        delete resolutionProposals[_marketId];

        market.resolved = true;
        market.outcome = _outcome;
        market.active = false;

        // Remove from active markets
        for (uint i = 0; i < activeMarketIds.length; i++) {
            if (activeMarketIds[i] == _marketId) {
                activeMarketIds[i] = activeMarketIds[activeMarketIds.length - 1];
                activeMarketIds.pop();
                break;
            }
        }

        emit MarketResolved(_marketId, _outcome, market.totalVolume);
    }

    // Auto-resolve market with random outcome (automated resolution every 1.5 minutes)
    function autoResolveMarket(uint256 _marketId) external nonReentrant {
        Market storage market = markets[_marketId];
        require(market.active, "Market not active");
        require(!market.resolved, "Market already resolved");
        require(msg.sender == owner(), "Only owner can auto-resolve");

        // Generate pseudo-random outcome (1=YES, 2=NO)
        // Using block data for randomness (not production-ready, but works for demo)
        uint256 randomNumber = uint256(keccak256(abi.encodePacked(
            block.timestamp,
            block.prevrandao,
            _marketId,
            market.totalVolume,
            market.totalYesShares,
            market.totalNoShares
        )));
        
        // 50/50 chance for YES or NO
        uint8 outcome = (randomNumber % 2 == 0) ? 1 : 2; // 1=YES, 2=NO

        market.resolved = true;
        market.outcome = outcome;
        market.active = false;

        // Remove from active markets
        for (uint i = 0; i < activeMarketIds.length; i++) {
            if (activeMarketIds[i] == _marketId) {
                activeMarketIds[i] = activeMarketIds[activeMarketIds.length - 1];
                activeMarketIds.pop();
                break;
            }
        }

        emit MarketResolved(_marketId, outcome, market.totalVolume);
    }

    // Claim winnings after market resolution - PARI-MUTUEL MODEL
    // Winners get: Their investment back + Share of losing side's pool - 2% platform fee
    function claimWinnings(uint256 _marketId) external nonReentrant {
        Market storage market = markets[_marketId];
        require(market.resolved, "Market not resolved");
        
        Position storage position = positions[_marketId][msg.sender];
        require(position.yesShares > 0 || position.noShares > 0, "No position in market");

        uint256 grossPayout = 0;
        uint256 userInvestment = 0;
        uint256 losingPoolShare = 0;
        
        if (market.outcome == 1 && position.yesShares > 0) {
            // YES won - user gets YES investment back + share of NO pool
            require(market.totalYesShares > 0, "No winning shares");
            userInvestment = position.yesInvested; // Refund their YES investment
            
            // Calculate share of NO pool (losing side)
            if (market.totalYesShares > 0 && market.noPool > 0) {
                losingPoolShare = (market.noPool * position.yesShares) / market.totalYesShares;
            }
            
            grossPayout = userInvestment + losingPoolShare;
            position.yesShares = 0;
            position.yesInvested = 0;
            // Also clear any NO shares (they lost)
            position.noShares = 0;
            position.noInvested = 0;
        } else if (market.outcome == 2 && position.noShares > 0) {
            // NO won - user gets NO investment back + share of YES pool
            require(market.totalNoShares > 0, "No winning shares");
            userInvestment = position.noInvested; // Refund their NO investment
            
            // Calculate share of YES pool (losing side)
            if (market.totalNoShares > 0 && market.yesPool > 0) {
                losingPoolShare = (market.yesPool * position.noShares) / market.totalNoShares;
            }
            
            grossPayout = userInvestment + losingPoolShare;
            position.noShares = 0;
            position.noInvested = 0;
            // Also clear any YES shares (they lost)
            position.yesShares = 0;
            position.yesInvested = 0;
        } else if (market.outcome == 3) {
            // INVALID - refund proportionally based on total invested
            uint256 totalShares = position.yesShares + position.noShares;
            uint256 totalMarketShares = market.totalYesShares + market.totalNoShares;
            if (totalShares > 0 && totalMarketShares > 0) {
                // Refund based on share proportion of total pool
                grossPayout = (market.totalPool * totalShares) / totalMarketShares;
            }
            position.yesShares = 0;
            position.noShares = 0;
            position.yesInvested = 0;
            position.noInvested = 0;
        } else {
            // User only has losing shares - no payout
            // Clear losing shares
            if (market.outcome == 1 && position.noShares > 0) {
                position.noShares = 0;
                position.noInvested = 0; // NO shares lost - forfeited
            } else if (market.outcome == 2 && position.yesShares > 0) {
                position.yesShares = 0;
                position.yesInvested = 0; // YES shares lost - forfeited
            }
            // Payout remains 0 for losers
        }

        // Calculate platform fee (2% of gross payout)
        uint256 platformFee = 0;
        uint256 netPayout = 0;
        
        if (grossPayout > 0) {
            // Platform fee = 2% of gross payout
            platformFee = (grossPayout * platformFeePercent) / 10000;
            netPayout = grossPayout - platformFee;
            
            // Send platform fee to fee recipient
            if (platformFee > 0 && feeRecipient != address(0)) {
                require(address(this).balance >= platformFee, "Insufficient balance for platform fee");
                payable(feeRecipient).transfer(platformFee);
            }
            
            // Pay user their net payout
            if (netPayout > 0) {
                require(address(this).balance >= netPayout, "Insufficient contract balance");
                payable(msg.sender).transfer(netPayout);
            }
        } else {
            // User lost - position is already cleared, but no payout
            // Allow this so users can "claim" to clear their losing position from the UI
        }
    }

    // Calculate shares for purchase using AMM formula
    function calculateSharesForPurchase(uint256 _marketId, bool _isYes, uint256 _amount) public view returns (uint256) {
        Market storage market = markets[_marketId];
        
        if (market.totalYesShares == 0 && market.totalNoShares == 0) {
            // First trade - return amount directly as shares (1:1 ratio)
            return _amount;
        }

        // For simplicity, use a 1:1 ratio for now
        // This means 1 ETH invested = 1 share received
        // This is more predictable and user-friendly
        return _amount;
    }

    // Calculate payout for selling shares
    function calculatePayoutForSale(uint256 _marketId, bool _isYes, uint256 _shares) public view returns (uint256) {
        // For simplicity, use 1:1 ratio for selling too
        // This means 1 share = 1 ETH payout
        return _shares;
    }

    // Get current price (probability) for YES or NO using LMSR
    function getCurrentPrice(uint256 _marketId, bool _isYes) public view returns (uint256) {
        (uint256 yesPrice, uint256 noPrice) = pricingAMM.calculatePrice(_marketId);
        return _isYes ? yesPrice : noPrice;
    }

    /**
     * @dev Internal function to match a limit order with a sell order
     * @param _limitOrderId The limit order ID to match
     * @return matched Whether a match was found and executed
     * @return matchedSellOrderId The sell order ID that was matched (0 if no match)
     */
    function _tryMatchLimitOrderWithSellOrder(uint256 _limitOrderId) internal returns (bool matched, uint256 matchedSellOrderId) {
        LimitOrder storage limitOrder = allLimitOrders[_limitOrderId];
        if (limitOrder.filled || limitOrder.cancelled || limitOrder.amount == 0) {
            return (false, 0);
        }

        // Convert limit order price to wei per share for comparison
        uint256 limitPricePerShare = (limitOrder.price * 1 ether) / 10000;
        
        // Find matching sell order (same market, same side, same price)
        uint256[] storage sellOrderIds = marketSellOrders[limitOrder.marketId];
        
        for (uint256 i = 0; i < sellOrderIds.length; i++) {
            SellOrder storage sellOrder = allSellOrders[sellOrderIds[i]];
            
            // Check if sell order matches:
            // 1. Not filled or cancelled
            // 2. Same side (both YES or both NO)
            // 3. Same price (within 1 wei tolerance for rounding)
            if (!sellOrder.filled && 
                !sellOrder.cancelled && 
                sellOrder.isYes == limitOrder.isYes &&
                (sellOrder.pricePerShare >= limitPricePerShare ? 
                    sellOrder.pricePerShare - limitPricePerShare : 
                    limitPricePerShare - sellOrder.pricePerShare) <= 1) {
                
                // Calculate how many shares the limit order can buy
                uint256 sharesLimitOrderCanBuy = (limitOrder.amount * 10000) / limitOrder.price;
                
                // Match the minimum of what seller wants to sell and what buyer wants to buy
                uint256 sharesToTrade = sellOrder.shares < sharesLimitOrderCanBuy ? sellOrder.shares : sharesLimitOrderCanBuy;
                
                if (sharesToTrade > 0) {
                    // Execute the match
                    uint256 totalCost = sharesToTrade * sellOrder.pricePerShare;
                    uint256 platformFee = (totalCost * platformFeePercent) / 10000;
                    uint256 sellerPayout = totalCost - platformFee;
                    
                    // Mark orders as filled (or partially filled)
                    if (sharesToTrade == sellOrder.shares) {
                        sellOrder.filled = true;
                    } else {
                        // Partial fill - reduce sell order shares
                        sellOrder.shares -= sharesToTrade;
                    }
                    
                    if (sharesToTrade == sharesLimitOrderCanBuy) {
                        limitOrder.filled = true;
                        limitOrder.amount = 0;
                    } else {
                        // Partial fill - reduce limit order amount
                        limitOrder.amount -= totalCost;
                    }
                    
                    // Transfer shares to limit order buyer
                    Position storage buyerPosition = positions[limitOrder.marketId][limitOrder.trader];
                    if (sellOrder.isYes) {
                        buyerPosition.yesShares += sharesToTrade;
                    } else {
                        buyerPosition.noShares += sharesToTrade;
                    }
                    buyerPosition.totalInvested += totalCost;
                    
                    // Pay seller
                    payable(sellOrder.seller).transfer(sellerPayout);
                    
                    // Refund excess ETH from limit order if any
                    if (limitOrder.amount > 0 && limitOrder.filled) {
                        payable(limitOrder.trader).transfer(limitOrder.amount);
                    }
                    
                    // Record trade
                    allTrades.push(Trade({
                        marketId: limitOrder.marketId,
                        trader: limitOrder.trader,
                        isYes: sellOrder.isYes,
                        shares: sharesToTrade,
                        price: limitOrder.price,
                        timestamp: block.timestamp
                    }));
                    
                    Market storage market = markets[limitOrder.marketId];
                    market.totalVolume += totalCost;
                    
                    emit SellOrderMatched(sellOrderIds[i], limitOrder.marketId, limitOrder.trader, sellOrder.seller, sharesToTrade, totalCost);
                    emit SharesSold(limitOrder.marketId, sellOrder.seller, sellOrder.isYes, sharesToTrade, sellerPayout, limitOrder.price);
                    emit SharesPurchased(limitOrder.marketId, limitOrder.trader, sellOrder.isYes, sharesToTrade, totalCost, limitOrder.price);
                    
                    return (true, sellOrderIds[i]);
                }
            }
        }
        
        return (false, 0);
    }

    // Place a limit order (Polymarket style)
    // Automatically matches with existing sell orders at the same price
    function placeLimitOrder(
        uint256 _marketId,
        bool _isYes,
        uint256 _price, // Price in basis points (0-10000)
        uint256 _amount // Amount in ETH
    ) external payable nonReentrant {
        Market storage market = markets[_marketId];
        require(market.active, "Market not active");
        require(!market.resolved, "Market already resolved");
        require(block.timestamp < market.endTime, "Market has ended");
        require(_price > 0 && _price <= 10000, "Invalid price");
        require(msg.value >= _amount, "Insufficient payment");
        require(_amount > 0, "Amount must be positive");

        // Create limit order
        uint256 orderId = allLimitOrders.length;
        allLimitOrders.push(LimitOrder({
            marketId: _marketId,
            trader: msg.sender,
            isYes: _isYes,
            price: _price,
            amount: _amount,
            timestamp: block.timestamp,
            filled: false,
            cancelled: false
        }));

        marketLimitOrders[_marketId].push(orderId);

        // Update orderbook (simplified - in real Polymarket this would be more complex)
        if (_isYes) {
            if (_price > market.yesBidPrice) {
                market.yesBidPrice = _price;
            }
            if (_price < market.yesAskPrice) {
                market.yesAskPrice = _price;
            }
        } else {
            if (_price > market.noBidPrice) {
                market.noBidPrice = _price;
            }
            if (_price < market.noAskPrice) {
                market.noAskPrice = _price;
            }
        }

        emit LimitOrderPlaced(_marketId, msg.sender, _isYes, _price, _amount);
        
        // Try to match with existing sell orders
        _tryMatchLimitOrderWithSellOrder(orderId);
        
        // If fully matched, the order is already filled
        // If partially matched or not matched, the order remains open
        // Refund any excess ETH sent (if user sent more than _amount)
        if (msg.value > _amount) {
            payable(msg.sender).transfer(msg.value - _amount);
        }
        
        // Refund remaining ETH if order was fully filled
        if (allLimitOrders[orderId].filled && allLimitOrders[orderId].amount > 0) {
            payable(msg.sender).transfer(allLimitOrders[orderId].amount);
            allLimitOrders[orderId].amount = 0;
        }
    }

    // View functions
    function getMarket(uint256 _marketId) external view returns (Market memory) {
        return markets[_marketId];
    }

    function getActiveMarkets() external view returns (uint256[] memory) {
        return activeMarketIds;
    }

    function getUserPosition(uint256 _marketId, address _user) external view returns (Position memory) {
        return positions[_marketId][_user];
    }

    function getUserMarkets(address _user) external view returns (uint256[] memory) {
        return userMarkets[_user];
    }

    function getRecentTrades(uint256 _marketId, uint256 _limit) external view returns (Trade[] memory) {
        uint256 count = 0;
        for (uint i = allTrades.length; i > 0 && count < _limit; i--) {
            if (allTrades[i-1].marketId == _marketId) {
                count++;
            }
        }

        Trade[] memory trades = new Trade[](count);
        uint256 index = 0;
        for (uint i = allTrades.length; i > 0 && index < count; i--) {
            if (allTrades[i-1].marketId == _marketId) {
                trades[index] = allTrades[i-1];
                index++;
            }
        }
        return trades;
    }

    /**
     * @dev Get sell order by ID
     * @param _orderId The sell order ID
     * @return The sell order
     */
    function getSellOrder(uint256 _orderId) external view returns (SellOrder memory) {
        require(_orderId < allSellOrders.length, "Order does not exist");
        return allSellOrders[_orderId];
    }

    /**
     * @dev Calculate potential payout for a user's position (PARI-MUTUEL)
     * Shows what user would receive if their side wins
     * @param _marketId The market ID
     * @param _user The user address
     * @param _isYes Calculate for YES win (true) or NO win (false)
     * @return potentialPayout The amount user would receive if that side wins
     */
    function calculatePotentialPayout(uint256 _marketId, address _user, bool _isYes) external view returns (uint256 potentialPayout) {
        Market storage market = markets[_marketId];
        Position storage position = positions[_marketId][_user];
        
        if (_isYes) {
            // If YES wins, YES holders split the pool
            if (market.totalYesShares > 0 && position.yesShares > 0) {
                potentialPayout = (market.totalPool * position.yesShares) / market.totalYesShares;
            }
        } else {
            // If NO wins, NO holders split the pool
            if (market.totalNoShares > 0 && position.noShares > 0) {
                potentialPayout = (market.totalPool * position.noShares) / market.totalNoShares;
            }
        }
    }

    /**
     * @dev Get current payout ratio per share (PARI-MUTUEL)
     * @param _marketId The market ID
     * @param _isYes Calculate for YES (true) or NO (false)
     * @return payoutPerShare The payout per share in wei if that side wins
     */
    function getPayoutPerShare(uint256 _marketId, bool _isYes) external view returns (uint256 payoutPerShare) {
        Market storage market = markets[_marketId];
        
        if (_isYes) {
            if (market.totalYesShares > 0) {
                payoutPerShare = market.totalPool / market.totalYesShares;
            }
        } else {
            if (market.totalNoShares > 0) {
                payoutPerShare = market.totalPool / market.totalNoShares;
            }
        }
    }

    /**
     * @dev Get total sell orders count
     */
    function getTotalSellOrdersCount() external view returns (uint256) {
        return allSellOrders.length;
    }

    // Admin functions
    function setMarketCreationFee(uint256 _fee) external onlyOwner {
        marketCreationFee = _fee;
    }

    function setPlatformFeePercent(uint256 _feePercent) external onlyOwner {
        require(_feePercent <= 1000, "Fee too high"); // Max 10%
        platformFeePercent = _feePercent;
    }

    function setFeeRecipient(address _feeRecipient) external onlyOwner {
        require(_feeRecipient != address(0), "Fee recipient cannot be zero address");
        feeRecipient = _feeRecipient;
    }

    function withdrawFees() external onlyOwner {
        payable(owner()).transfer(address(this).balance);
    }

    /**
     * @dev Receive function to accept ETH/TCENT deposits
     * Note: In pari-mutuel model, payouts come from user investments
     * This receive function is mainly for:
     * 1. Platform fee collection
     * 2. Emergency liquidity if needed
     * 3. Market creation fees
     */
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    event Deposited(address indexed depositor, uint256 amount);

    // Emergency functions
    function emergencyPause(uint256 _marketId) external onlyOwner {
        markets[_marketId].active = false;
    }

    function emergencyUnpause(uint256 _marketId) external onlyOwner {
        markets[_marketId].active = true;
    }
}
