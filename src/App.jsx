import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { 
  Wallet, Activity, TrendingUp, TrendingDown, Settings, Play, Pause, 
  RefreshCw, Zap, Trophy, Target, Clock, DollarSign, BarChart3,
  CheckCircle2, XCircle, AlertTriangle, ChevronDown, ExternalLink,
  Sparkles, Shield, Layers, ArrowUpRight, ArrowDownRight, Eye,
  Moon, Sun, Loader2, Copy, Check, Gift
} from 'lucide-react';

// ============= CONSTANTS =============
const BASE_CHAIN_ID = 8453;
const BASE_RPC = 'https://mainnet.base.org';
const LIMITLESS_API = 'https://api.limitless.exchange/api-v1';
const LIMITLESS_AUTH_API = 'https://api.limitless.exchange';
const USDC_CONTRACT = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

const SUPPORTED_ASSETS = [
  { id: 'BTC', name: 'Bitcoin', icon: '₿', color: '#F7931A' },
  { id: 'ETH', name: 'Ethereum', icon: 'Ξ', color: '#627EEA' },
  { id: 'SOL', name: 'Solana', icon: '◎', color: '#14F195' },
  { id: 'DOGE', name: 'Dogecoin', icon: 'Ð', color: '#C2A633' },
  { id: 'ADA', name: 'Cardano', icon: '₳', color: '#0033AD' },
  { id: 'MATIC', name: 'Polygon', icon: '⬡', color: '#8247E5' },
  { id: 'AVAX', name: 'Avalanche', icon: '🔺', color: '#E84142' },
  { id: 'LINK', name: 'Chainlink', icon: '⬡', color: '#375BD2' },
  { id: 'UNI', name: 'Uniswap', icon: '🦄', color: '#FF007A' },
  { id: 'AAVE', name: 'Aave', icon: '👻', color: '#B6509E' },
];

const DEFAULT_SETTINGS = {
  maxPairCost: 0.98,
  profitTarget: 50,
  sharesPerTrade: 10,
  checkInterval: 3,
  autoSwitch: true,
  maxYesPrice: 0.52,
  maxNoPrice: 0.52,
};

// ============= EIP-712 TYPES FOR LIMITLESS =============
const EIP712_DOMAIN = {
  name: 'Limitless Exchange',
  version: '1',
  chainId: BASE_CHAIN_ID,
};

const AUTH_TYPES = {
  Authentication: [
    { name: 'message', type: 'string' },
    { name: 'timestamp', type: 'uint256' },
  ],
};

const ORDER_TYPES = {
  Order: [
    { name: 'marketId', type: 'string' },
    { name: 'outcome', type: 'string' },
    { name: 'side', type: 'string' },
    { name: 'amount', type: 'uint256' },
    { name: 'price', type: 'uint256' },
    { name: 'nonce', type: 'uint256' },
    { name: 'expiry', type: 'uint256' },
  ],
};

// ============= UTILITY FUNCTIONS =============
const formatAddress = (addr) => addr ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : '';
const formatNumber = (num, decimals = 2) => Number(num).toFixed(decimals);
const formatUSD = (num) => `$${formatNumber(num, 2)}`;
const formatPercent = (num) => `${formatNumber(num * 100, 1)}%`;
const normalizePrice = (value) => {
  if (typeof value !== 'number') return 0;
  return value > 1 ? value / 100 : value;
};

const extractAccount = (payload) => {
  if (!payload || typeof payload === 'string') return '';
  return (
    payload.account ||
    payload.address ||
    payload.wallet ||
    payload.data?.account ||
    ''
  );
};

const extractSmartWallet = (payload) => {
  if (!payload || typeof payload === 'string') return '';
  return (
    payload.smartWallet ||
    payload.smart_wallet ||
    payload.smartwallet ||
    payload.data?.smartWallet ||
    payload.data?.smart_wallet ||
    ''
  );
};

const buildBalanceOfData = (address) => {
  const sanitized = address.replace('0x', '').padStart(64, '0');
  return `0x70a08231000000000000000000000000${sanitized}`;
};

const fetchUSDCBalanceOnBase = async (address) => {
  const body = {
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_call',
    params: [
      { to: USDC_CONTRACT, data: buildBalanceOfData(address) },
      'latest',
    ],
  };

  const response = await fetch(BASE_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error('Unable to load USDC balance');
  }

  const { result } = await response.json();
  if (!result) {
    throw new Error('Empty balance response');
  }

  const balanceBigInt = BigInt(result);
  return Number(balanceBigInt) / 1e6;
};

// Generate mock market data for demo
const generateMockMarkets = (assets, marketType) => {
  return assets.map(asset => {
    const yesPrice = 0.35 + Math.random() * 0.30;
    const noPrice = 1 - yesPrice - (Math.random() * 0.05);
    const hourOffset = marketType === 'hourly' ? 1 : 24;
    const expiryTime = new Date(Date.now() + hourOffset * 60 * 60 * 1000);
    
    return {
      id: `${asset.id}-${marketType}-${Date.now()}`,
      asset: asset.id,
      assetName: asset.name,
      assetIcon: asset.icon,
      assetColor: asset.color,
      type: marketType,
      question: `Will ${asset.id} be higher in ${hourOffset}h?`,
      yesPrice: Number(yesPrice.toFixed(4)),
      noPrice: Number(noPrice.toFixed(4)),
      pairCost: Number((yesPrice + noPrice).toFixed(4)),
      volume24h: Math.floor(Math.random() * 500000) + 50000,
      liquidity: Math.floor(Math.random() * 200000) + 20000,
      expiryTime: expiryTime.toISOString(),
      timeRemaining: hourOffset * 60 * 60 * 1000,
      yesVolatility: (Math.random() * 0.1).toFixed(4),
      noVolatility: (Math.random() * 0.1).toFixed(4),
    };
  });
};

// ============= MAIN COMPONENT =============
export default function LimitlessTradingBot() {
  // Wallet State
  const [walletConnected, setWalletConnected] = useState(false);
  const [walletAddress, setWalletAddress] = useState('');
  const [limitlessWallet, setLimitlessWallet] = useState('');
  const [balance, setBalance] = useState(0);
  const [isBalanceLoading, setIsBalanceLoading] = useState(false);
  const [balanceError, setBalanceError] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);
  const [authToken, setAuthToken] = useState(null);
  const [authStatus, setAuthStatus] = useState('idle');
  const [authError, setAuthError] = useState('');
  
  // Market State
  const [selectedAssets, setSelectedAssets] = useState(['BTC', 'ETH', 'SOL']);
  const [marketType, setMarketType] = useState('hourly');
  const [markets, setMarkets] = useState([]);
  const [activeMarket, setActiveMarket] = useState(null);
  const [isLoadingMarkets, setIsLoadingMarkets] = useState(false);
  
  // Trading State
  const [botRunning, setBotRunning] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [showSettings, setShowSettings] = useState(false);
  
  // Stats State
  const [stats, setStats] = useState({
    totalTrades: 0,
    lockedProfit: 0,
    totalVolume: 0,
    winRate: 0,
    avgPairCost: 0,
    roi: 0,
  });
  
  // Airdrop State
  const [airdropStats, setAirdropStats] = useState({
    totalPoints: 12847,
    weeklyPoints: 2341,
    rank: 1247,
    seasonProgress: 68,
    qualityBonus: 1.2,
    nextMilestone: 15000,
  });
  
  // Positions & History
  const [positions, setPositions] = useState([]);
  const [tradeHistory, setTradeHistory] = useState([]);
  const [activityLog, setActivityLog] = useState([]);
  
  // UI State
  const [copiedAddress, setCopiedAddress] = useState(null);
  const [demoMode, setDemoMode] = useState(true);
  
  // Refs
  const botIntervalRef = useRef(null);
  const priceUpdateRef = useRef(null);

  // Derived strategy math (gabagool hedge)
  const gabagoolMath = useMemo(() => {
    const totals = positions.reduce(
      (acc, pos) => {
        acc.qtyYes += pos.yesShares;
        acc.qtyNo += pos.noShares;
        acc.costYes += pos.yesCost;
        acc.costNo += pos.noCost;
        return acc;
      },
      { qtyYes: 0, qtyNo: 0, costYes: 0, costNo: 0 }
    );

    const avgYes = totals.qtyYes ? totals.costYes / totals.qtyYes : 0;
    const avgNo = totals.qtyNo ? totals.costNo / totals.qtyNo : 0;
    const pairCost = avgYes + avgNo;
    const lockedProfit = Math.max(0, Math.min(totals.qtyYes, totals.qtyNo) - (totals.costYes + totals.costNo));

    return {
      ...totals,
      avgYes,
      avgNo,
      pairCost: Number(pairCost.toFixed(4)),
      lockedProfit,
      safetyBuffer: 1 - pairCost,
    };
  }, [positions]);

  const updateSmartWalletBalance = useCallback(async (smartWalletAddr) => {
    if (!smartWalletAddr) return;
    setIsBalanceLoading(true);
    setBalanceError('');
    try {
      const usdcBalance = await fetchUSDCBalanceOnBase(smartWalletAddr);
      setBalance(usdcBalance);
    } catch (error) {
      setBalanceError(error.message);
      addActivity('warning', `Balance refresh failed: ${error.message}`);
    } finally {
      setIsBalanceLoading(false);
    }
  }, []);

  // ============= WALLET CONNECTION =============
  const connectWallet = async () => {
    setIsConnecting(true);
    try {
      if (typeof window.ethereum === 'undefined') {
        throw new Error('No wallet detected. Please install Rabby or MetaMask.');
      }

      // Request accounts
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });

      if (!accounts.length) throw new Error('No accounts found');

      // Check/switch to Base network
      const chainId = await window.ethereum.request({ method: 'eth_chainId' });
      if (parseInt(chainId, 16) !== BASE_CHAIN_ID) {
        try {
          await window.ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${BASE_CHAIN_ID.toString(16)}` }],
          });
        } catch (switchError) {
          // Chain not added, add it
          if (switchError.code === 4902) {
            await window.ethereum.request({
              method: 'wallet_addEthereumChain',
              params: [{
                chainId: `0x${BASE_CHAIN_ID.toString(16)}`,
                chainName: 'Base',
                nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
                rpcUrls: [BASE_RPC],
                blockExplorerUrls: ['https://basescan.org'],
              }],
            });
          }
        }
      }

      setWalletAddress(accounts[0]);
      setWalletConnected(true);
      setLimitlessWallet('');
      setBalance(0);
      setBalanceError('');

      addActivity('success', 'Wallet connected successfully');
      addActivity('info', 'Connected to Base network');

      // Authenticate with Limitless
      const authOk = await authenticateWithLimitless(accounts[0]);
      if (!authOk) {
        addActivity('warning', 'Limitless authentication incomplete; trading may be limited');
      }

    } catch (error) {
      addActivity('error', `Connection failed: ${error.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const authenticateWithLimitless = async (address) => {
    try {
      setAuthStatus('pending');
      setAuthError('');
      addActivity('info', 'Authenticating with Limitless...');

      const signingRes = await fetch(`${LIMITLESS_AUTH_API}/auth/signing-message`);
      if (!signingRes.ok) {
        throw new Error('Unable to fetch signing message');
      }

      const signingMessage = await signingRes.text();

      let signature = 'demo-signature';
      if (!demoMode && window.ethereum) {
        signature = await window.ethereum.request({
          method: 'personal_sign',
          params: [signingMessage, address],
        });
      }

      const loginRes = await fetch(`${LIMITLESS_AUTH_API}/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'x-account': address,
          'x-signing-message': signingMessage,
          'x-signature': signature,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client: 'base',
          smartWallet: limitlessWallet || undefined,
          r: '',
        }),
      });

      if (!loginRes.ok) {
        throw new Error('Limitless login failed');
      }

      let loginData;
      try {
        loginData = await loginRes.json();
      } catch (_) {
        loginData = null;
      }

      let verifiedPayload = null;
      try {
        const verifyRes = await fetch(`${LIMITLESS_AUTH_API}/auth/verify-auth`, { credentials: 'include' });
        if (verifyRes.ok) {
          try {
            verifiedPayload = await verifyRes.json();
          } catch (_) {
            const text = await verifyRes.text();
            verifiedPayload = text ? { account: text.trim() } : null;
          }
        }
      } catch (verifyError) {
        addActivity('warning', `Session verify warning: ${verifyError.message}`);
      }

      const smartWalletAddr =
        extractSmartWallet(loginData) ||
        extractSmartWallet(verifiedPayload) ||
        extractAccount(verifiedPayload) ||
        extractAccount(loginData) ||
        address;
      setLimitlessWallet(smartWalletAddr);
      setAuthToken(signature);
      setAuthStatus('authenticated');
      addActivity('success', 'Authenticated with Limitless');
      updateSmartWalletBalance(smartWalletAddr);

      return true;
    } catch (error) {
      setAuthStatus('error');
      setAuthError(error.message);
      addActivity('error', `Authentication failed: ${error.message}`);
      return false;
    }
  };

  const logoutFromLimitless = async () => {
    try {
      await fetch(`${LIMITLESS_AUTH_API}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch (err) {
      addActivity('warning', `Logout warning: ${err.message}`);
    }
  };

  const disconnectWallet = () => {
    setWalletConnected(false);
    setWalletAddress('');
    setLimitlessWallet('');
    setBalance(0);
    setIsBalanceLoading(false);
    setBalanceError('');
    setAuthToken(null);
    setAuthStatus('idle');
    setAuthError('');
    setBotRunning(false);
    logoutFromLimitless();
    addActivity('info', 'Wallet disconnected');
  };

  // ============= MARKET DATA =============
  const fetchMarkets = useCallback(async () => {
    setIsLoadingMarkets(true);
    try {
      const response = await fetch(`${LIMITLESS_API}/markets/active?page=1&limit=24&sortBy=newest`);
      if (!response.ok) {
        throw new Error('Failed to load markets from Limitless');
      }

      const data = await response.json();
      const apiMarkets = (data.data || []).filter((m) => {
        const categories = (m.categories || []).map((c) => c.toLowerCase());
        return categories.includes(marketType);
      });

      const mappedMarkets = apiMarkets.map((m) => {
        const yes = Number(normalizePrice(m.prices?.[0]).toFixed(4));
        const no = Number(normalizePrice(m.prices?.[1]).toFixed(4));
        const pairCost = Number((yes + no).toFixed(4));
        const assetInfo = SUPPORTED_ASSETS.find((asset) =>
          m.title?.toUpperCase().includes(`$${asset.id}`) || m.title?.toUpperCase().includes(asset.id)
        );
        const expiry = m.expirationTimestamp || m.expirationDate;

        return {
          id: m.slug || m.address || m.id,
          asset: assetInfo?.id || m.asset || 'MARKET',
          assetName: assetInfo?.name || m.title || 'Limitless Market',
          assetIcon: assetInfo?.icon || '⧫',
          assetColor: assetInfo?.color || '#7c3aed',
          type: marketType,
          question: m.title,
          yesPrice: yes,
          noPrice: no,
          pairCost,
          volume24h: Number(m.volumeFormatted || m.volume || 0),
          liquidity: Number(m.liquidityFormatted || m.liquidity || 0),
          expiryTime: expiry ? new Date(expiry).toISOString() : null,
          timeRemaining: expiry ? Math.max(0, new Date(expiry).getTime() - Date.now()) : null,
          yesVolatility: (Math.random() * 0.1).toFixed(4),
          noVolatility: (Math.random() * 0.1).toFixed(4),
        };
      }).filter((m) => m.yesPrice > 0 && m.noPrice > 0);

      if (!mappedMarkets.length) {
        throw new Error('No active markets returned');
      }

      setDemoMode(false);
      setMarkets(mappedMarkets);
      if (!activeMarket || !mappedMarkets.find((m) => m.id === activeMarket.id)) {
        setActiveMarket(mappedMarkets[0]);
      }
    } catch (error) {
      setDemoMode(true);
      addActivity('error', `Failed to fetch markets: ${error.message}`);
      const filteredAssets = SUPPORTED_ASSETS.filter(a => selectedAssets.includes(a.id));
      const mockMarkets = generateMockMarkets(filteredAssets, marketType);
      setMarkets(mockMarkets);
      if (!activeMarket && mockMarkets.length > 0) {
        setActiveMarket(mockMarkets[0]);
      }
    } finally {
      setIsLoadingMarkets(false);
    }
  }, [selectedAssets, marketType, activeMarket]);

  // ============= TRADING LOGIC =============
  const checkArbitrageOpportunity = (market) => {
    const { yesPrice, noPrice, pairCost } = market;
    const { maxPairCost, maxYesPrice, maxNoPrice } = settings;
    
    // Check if we can buy YES cheap
    const canBuyYes = yesPrice < maxYesPrice;
    // Check if we can buy NO cheap
    const canBuyNo = noPrice < maxNoPrice;
    // Check if total pair cost is below threshold
    const pairCostGood = pairCost < maxPairCost;
    
    if (canBuyYes && canBuyNo && pairCostGood) {
      return {
        type: 'ARBITRAGE',
        yesPrice,
        noPrice,
        pairCost,
        profit: 1 - pairCost,
        profitPercent: ((1 - pairCost) / pairCost) * 100,
      };
    }
    
    if (canBuyYes) {
      return { type: 'YES_ONLY', yesPrice, potentialProfit: 1 - yesPrice };
    }
    
    if (canBuyNo) {
      return { type: 'NO_ONLY', noPrice, potentialProfit: 1 - noPrice };
    }
    
    return null;
  };

  const executeTrade = async (market, side, shares) => {
    try {
      const price = side === 'YES' ? market.yesPrice : market.noPrice;
      const cost = price * shares;
      
      // In production: Sign and submit EIP-712 order
      /*
      const order = {
        marketId: market.id,
        outcome: side,
        side: 'BUY',
        amount: shares * 1e18,
        price: price * 1e18,
        nonce: Date.now(),
        expiry: Math.floor(Date.now() / 1000) + 300,
      };
      
      const signature = await window.ethereum.request({
        method: 'eth_signTypedData_v4',
        params: [walletAddress, JSON.stringify({
          types: ORDER_TYPES,
          primaryType: 'Order',
          domain: EIP712_DOMAIN,
          message: order,
        })],
      });
      
      await fetch(`${LIMITLESS_API}/orders`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ order, signature }),
      });
      */
      
      // Demo: Simulate trade
      const trade = {
        id: `trade-${Date.now()}`,
        timestamp: new Date().toISOString(),
        market: market.id,
        asset: market.asset,
        side,
        shares,
        price,
        cost,
        status: 'FILLED',
      };
      
      setTradeHistory(prev => [trade, ...prev].slice(0, 50));
      setBalance(prev => prev - cost);
      
      // Update positions
      setPositions(prev => {
        const existingIdx = prev.findIndex(p => p.marketId === market.id);
        if (existingIdx >= 0) {
          const updated = [...prev];
          if (side === 'YES') {
            updated[existingIdx].yesShares += shares;
            updated[existingIdx].yesCost += cost;
            updated[existingIdx].yesAvg = updated[existingIdx].yesCost / updated[existingIdx].yesShares;
          } else {
            updated[existingIdx].noShares += shares;
            updated[existingIdx].noCost += cost;
            updated[existingIdx].noAvg = updated[existingIdx].noCost / updated[existingIdx].noShares;
          }
          updated[existingIdx].totalCost = updated[existingIdx].yesCost + updated[existingIdx].noCost;
          updated[existingIdx].pairCost = (updated[existingIdx].yesAvg || 0) + (updated[existingIdx].noAvg || 0);
          return updated;
        }
        
        return [{
          marketId: market.id,
          asset: market.asset,
          assetIcon: market.assetIcon,
          assetColor: market.assetColor,
          yesShares: side === 'YES' ? shares : 0,
          noShares: side === 'NO' ? shares : 0,
          yesCost: side === 'YES' ? cost : 0,
          noCost: side === 'NO' ? cost : 0,
          yesAvg: side === 'YES' ? price : 0,
          noAvg: side === 'NO' ? price : 0,
          totalCost: cost,
          pairCost: price,
          expiryTime: market.expiryTime,
        }, ...prev];
      });
      
      // Update stats
      setStats(prev => ({
        ...prev,
        totalTrades: prev.totalTrades + 1,
        totalVolume: prev.totalVolume + cost,
      }));
      
      // Update airdrop points (rough estimate: ~1 point per $1 volume)
      setAirdropStats(prev => ({
        ...prev,
        totalPoints: prev.totalPoints + Math.floor(cost),
        weeklyPoints: prev.weeklyPoints + Math.floor(cost),
      }));
      
      addActivity('success', `Bought ${shares} ${side} @ ${formatUSD(price)} (${market.asset})`);
      
      return trade;
      
    } catch (error) {
      addActivity('error', `Trade failed: ${error.message}`);
      throw error;
    }
  };

  const runBotCycle = useCallback(async () => {
    if (!walletConnected || !botRunning) return;
    
    // Check profit target
    if (stats.lockedProfit >= settings.profitTarget) {
      setBotRunning(false);
      addActivity('success', `🎉 Profit target of ${formatUSD(settings.profitTarget)} reached!`);
      return;
    }
    
    for (const market of markets) {
      if (!botRunning) break;
      
      const opportunity = checkArbitrageOpportunity(market);
      
      if (opportunity?.type === 'ARBITRAGE') {
        addActivity('info', `🎯 Arbitrage found: ${market.asset} (Pair: ${formatUSD(opportunity.pairCost)})`);
        
        try {
          // Buy both YES and NO
          await executeTrade(market, 'YES', settings.sharesPerTrade);
          await executeTrade(market, 'NO', settings.sharesPerTrade);
          
          // Calculate locked profit
          const profit = (1 - opportunity.pairCost) * settings.sharesPerTrade;
          setStats(prev => ({
            ...prev,
            lockedProfit: prev.lockedProfit + profit,
            avgPairCost: opportunity.pairCost,
            roi: ((prev.lockedProfit + profit) / prev.totalVolume) * 100 || 0,
          }));
          
          addActivity('success', `✨ Locked profit: ${formatUSD(profit)} on ${market.asset}`);
          
        } catch (error) {
          // Continue to next market
        }
      } else if (opportunity?.type === 'YES_ONLY' && market.yesPrice < 0.45) {
        addActivity('info', `📉 Low YES price: ${market.asset} @ ${formatUSD(market.yesPrice)}`);
        await executeTrade(market, 'YES', settings.sharesPerTrade);
      } else if (opportunity?.type === 'NO_ONLY' && market.noPrice < 0.45) {
        addActivity('info', `📉 Low NO price: ${market.asset} @ ${formatUSD(market.noPrice)}`);
        await executeTrade(market, 'NO', settings.sharesPerTrade);
      }
    }
    
    // Auto-switch to best market if enabled
    if (settings.autoSwitch && markets.length > 0) {
      const bestMarket = markets.reduce((best, m) => 
        (m.pairCost < best.pairCost) ? m : best
      , markets[0]);
      
      if (bestMarket.id !== activeMarket?.id) {
        setActiveMarket(bestMarket);
        addActivity('info', `Switched to ${bestMarket.asset} (best opportunity)`);
      }
    }
  }, [markets, botRunning, walletConnected, settings, stats, activeMarket]);

  // ============= ACTIVITY LOG =============
  const addActivity = (type, message) => {
    const entry = {
      id: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      type,
      message,
    };
    setActivityLog(prev => [entry, ...prev].slice(0, 100));
  };

  // ============= EFFECTS =============
  useEffect(() => {
    if (walletConnected) {
      fetchMarkets();
    }
  }, [walletConnected, selectedAssets, marketType, fetchMarkets]);

  useEffect(() => {
    if (authStatus === 'authenticated' && limitlessWallet) {
      updateSmartWalletBalance(limitlessWallet);
    }
  }, [authStatus, limitlessWallet, updateSmartWalletBalance]);

  // Price updates simulation
  useEffect(() => {
    if (!walletConnected || !demoMode) return;
    
    priceUpdateRef.current = setInterval(() => {
      setMarkets(prev => prev.map(market => {
        const yesChange = (Math.random() - 0.5) * 0.02;
        const noChange = (Math.random() - 0.5) * 0.02;
        const newYes = Math.max(0.01, Math.min(0.99, market.yesPrice + yesChange));
        const newNo = Math.max(0.01, Math.min(0.99, market.noPrice + noChange));
        
        return {
          ...market,
          yesPrice: Number(newYes.toFixed(4)),
          noPrice: Number(newNo.toFixed(4)),
          pairCost: Number((newYes + newNo).toFixed(4)),
        };
      }));
    }, 2000);
    
    return () => clearInterval(priceUpdateRef.current);
  }, [walletConnected]);

  // Bot cycle
  useEffect(() => {
    if (botRunning) {
      botIntervalRef.current = setInterval(runBotCycle, settings.checkInterval * 1000);
      addActivity('info', `Bot started (${settings.checkInterval}s interval)`);
    } else {
      if (botIntervalRef.current) {
        clearInterval(botIntervalRef.current);
        addActivity('info', 'Bot stopped');
      }
    }
    
    return () => {
      if (botIntervalRef.current) clearInterval(botIntervalRef.current);
    };
  }, [botRunning, settings.checkInterval, runBotCycle]);

  // Copy address
  const copyToClipboard = async (text, type) => {
    await navigator.clipboard.writeText(text);
    setCopiedAddress(type);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  // Toggle asset selection
  const toggleAsset = (assetId) => {
    setSelectedAssets(prev => 
      prev.includes(assetId)
        ? prev.filter(a => a !== assetId)
        : [...prev, assetId]
    );
  };

  // ============= RENDER =============
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-purple-950 text-white">
      {/* Background Effects */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative border-b border-white/5 backdrop-blur-xl bg-slate-900/50">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/25">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900 animate-pulse" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-white to-purple-200 bg-clip-text text-transparent">
                  Limitless Arbitrage Bot
                </h1>
                <p className="text-xs text-slate-400">Season 2 Airdrop Farming</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              {/* Demo Mode Toggle */}
              <button
                onClick={() => setDemoMode(!demoMode)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  demoMode 
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' 
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                }`}
              >
                {demoMode ? '🎮 Demo Mode' : '🔴 Live Mode'}
              </button>

              {/* Wallet Connection */}
              {walletConnected ? (
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                      <span className="text-sm font-medium text-emerald-400">Base Network</span>
                    </div>
                    <span className="text-xs text-slate-400">{formatAddress(walletAddress)}</span>
                  </div>
                  <button
                    onClick={disconnectWallet}
                    className="px-4 py-2 rounded-xl bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20 transition-all text-sm font-medium"
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <button
                  onClick={connectWallet}
                  disabled={isConnecting}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all font-semibold shadow-lg shadow-purple-500/25 disabled:opacity-50"
                >
                  {isConnecting ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Wallet className="w-4 h-4" />
                  )}
                  Connect Wallet
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Airdrop Banner */}
      <div className="relative border-b border-white/5 bg-gradient-to-r from-purple-900/30 via-indigo-900/30 to-purple-900/30">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Gift className="w-5 h-5 text-purple-400" />
                <span className="font-semibold text-purple-300">Season 2 Airdrop</span>
              </div>
              <div className="h-6 w-px bg-white/10" />
              <div className="flex items-center gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-400" />
                  <span className="text-slate-400">Total Points:</span>
                  <span className="font-bold text-white">{airdropStats.totalPoints.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-400" />
                  <span className="text-slate-400">This Week:</span>
                  <span className="font-bold text-emerald-400">+{airdropStats.weeklyPoints.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-cyan-400" />
                  <span className="text-slate-400">Rank:</span>
                  <span className="font-bold text-cyan-400">#{airdropStats.rank.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-400" />
                  <span className="text-slate-400">Quality Bonus:</span>
                  <span className="font-bold text-amber-400">{airdropStats.qualityBonus}x</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-xs text-slate-400">Progress to {airdropStats.nextMilestone.toLocaleString()}</div>
              <div className="w-32 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-purple-500 to-indigo-500 rounded-full transition-all"
                  style={{ width: `${airdropStats.seasonProgress}%` }}
                />
              </div>
              <span className="text-xs font-medium text-purple-400">{airdropStats.seasonProgress}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="relative max-w-7xl mx-auto px-4 py-6">
        {!walletConnected ? (
          /* Not Connected State */
          <div className="flex flex-col items-center justify-center py-24">
            <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-purple-500/20 to-indigo-500/20 border border-purple-500/20 flex items-center justify-center mb-6">
              <Wallet className="w-12 h-12 text-purple-400" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Connect Your Wallet</h2>
            <p className="text-slate-400 mb-6 text-center max-w-md">
              Connect your Rabby or MetaMask wallet to start farming the Limitless Season 2 airdrop with automated arbitrage trading.
            </p>
            <button
              onClick={connectWallet}
              disabled={isConnecting}
              className="flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 transition-all font-bold text-lg shadow-xl shadow-purple-500/25 disabled:opacity-50"
            >
              {isConnecting ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Wallet className="w-5 h-5" />
              )}
              Connect Wallet
            </button>
            <p className="text-xs text-slate-500 mt-4">Supports Rabby, MetaMask, and other EIP-1193 wallets</p>
          </div>
        ) : (
          /* Connected Dashboard */
          <div className="grid grid-cols-12 gap-6">
            
            {/* Left Column - Controls & Markets */}
            <div className="col-span-8 space-y-6">
              
              {/* Wallet Info Cards */}
              <div className="grid grid-cols-3 gap-4">
                {/* External Wallet */}
                <div className="rounded-2xl bg-slate-900/50 border border-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-slate-400 uppercase tracking-wider">External Wallet</span>
                    <Wallet className="w-4 h-4 text-slate-500" />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-sm">{formatAddress(walletAddress)}</span>
                    <button 
                      onClick={() => copyToClipboard(walletAddress, 'external')}
                      className="p-1 hover:bg-white/5 rounded"
                    >
                      {copiedAddress === 'external' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-500" />}
                    </button>
                  </div>
                  <div className="text-xs text-slate-500">Rabby/MetaMask</div>
                </div>

                {/* Limitless Wallet */}
                <div className="rounded-2xl bg-slate-900/50 border border-white/5 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-slate-400 uppercase tracking-wider">Limitless Wallet</span>
                    <Shield className="w-4 h-4 text-purple-400" />
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="font-mono text-sm">{formatAddress(limitlessWallet)}</span>
                    <button
                      onClick={() => copyToClipboard(limitlessWallet, 'limitless')}
                      className="p-1 hover:bg-white/5 rounded"
                    >
                      {copiedAddress === 'limitless' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-slate-500" />}
                    </button>
                  </div>
                  <div className="text-xs flex items-center gap-2">
                    <span className="text-purple-400">Trading Wallet</span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${
                        authStatus === 'authenticated'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : authStatus === 'pending'
                          ? 'bg-amber-500/10 text-amber-400'
                          : authStatus === 'error'
                          ? 'bg-rose-500/10 text-rose-400'
                          : 'bg-slate-700 text-slate-300'
                      }`}
                    >
                      {authStatus === 'authenticated'
                        ? 'Authed'
                        : authStatus === 'pending'
                        ? 'Authenticating'
                        : authStatus === 'error'
                        ? 'Auth Error'
                        : 'Idle'}
                    </span>
                  </div>
                  {authError && (
                    <div className="text-xs text-rose-400 mt-1">{authError}</div>
                  )}
                </div>

                {/* Balance */}
                <div className="rounded-2xl bg-gradient-to-br from-emerald-900/30 to-emerald-900/10 border border-emerald-500/20 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs text-emerald-400 uppercase tracking-wider">Balance</span>
                    <button
                      onClick={() => updateSmartWalletBalance(limitlessWallet)}
                      className="flex items-center gap-1 text-emerald-400 text-xs"
                    >
                      <RefreshCw className="w-3 h-3" />
                      Refresh
                    </button>
                  </div>
                  <div className="text-2xl font-bold text-emerald-400 flex items-center gap-2">
                    {isBalanceLoading ? <Loader2 className="w-5 h-5 animate-spin" /> : formatUSD(balance)}
                  </div>
                  <div className="text-xs text-emerald-400/60">USDC on Base</div>
                  {balanceError && <div className="text-xs text-rose-400 mt-1">{balanceError}</div>}
                </div>
              </div>

              {/* Bot Controls */}
              <div className="rounded-2xl bg-slate-900/50 border border-white/5 p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                      botRunning 
                        ? 'bg-emerald-500/20 border border-emerald-500/30' 
                        : 'bg-slate-800 border border-white/10'
                    }`}>
                      {botRunning ? (
                        <Activity className="w-5 h-5 text-emerald-400 animate-pulse" />
                      ) : (
                        <Pause className="w-5 h-5 text-slate-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold">Arbitrage Bot</h3>
                      <p className="text-xs text-slate-400">
                        {botRunning ? 'Scanning for opportunities...' : 'Ready to start'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowSettings(!showSettings)}
                      className={`p-2.5 rounded-xl transition-all ${
                        showSettings 
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30' 
                          : 'bg-slate-800 text-slate-400 border border-white/10 hover:border-white/20'
                      }`}
                    >
                      <Settings className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setBotRunning(!botRunning)}
                      className={`flex items-center gap-2 px-6 py-2.5 rounded-xl font-semibold transition-all ${
                        botRunning
                          ? 'bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30'
                          : 'bg-gradient-to-r from-emerald-600 to-cyan-600 text-white shadow-lg shadow-emerald-500/25 hover:from-emerald-500 hover:to-cyan-500'
                      }`}
                    >
                      {botRunning ? (
                        <>
                          <Pause className="w-4 h-4" />
                          Stop Bot
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4" />
                          Start Bot
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Settings Panel */}
                {showSettings && (
                  <div className="mb-6 p-4 rounded-xl bg-slate-800/50 border border-white/5 space-y-4">
                    <h4 className="text-sm font-medium text-slate-300 flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Bot Settings
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Max Pair Cost ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={settings.maxPairCost}
                          onChange={(e) => setSettings(s => ({ ...s, maxPairCost: parseFloat(e.target.value) }))}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Profit Target ($)</label>
                        <input
                          type="number"
                          value={settings.profitTarget}
                          onChange={(e) => setSettings(s => ({ ...s, profitTarget: parseFloat(e.target.value) }))}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Shares per Trade</label>
                        <input
                          type="number"
                          value={settings.sharesPerTrade}
                          onChange={(e) => setSettings(s => ({ ...s, sharesPerTrade: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Check Interval (sec)</label>
                        <input
                          type="number"
                          value={settings.checkInterval}
                          onChange={(e) => setSettings(s => ({ ...s, checkInterval: parseInt(e.target.value) }))}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Max YES Price ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={settings.maxYesPrice}
                          onChange={(e) => setSettings(s => ({ ...s, maxYesPrice: parseFloat(e.target.value) }))}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-400 mb-1">Max NO Price ($)</label>
                        <input
                          type="number"
                          step="0.01"
                          value={settings.maxNoPrice}
                          onChange={(e) => setSettings(s => ({ ...s, maxNoPrice: parseFloat(e.target.value) }))}
                          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-white text-sm focus:outline-none focus:border-purple-500"
                        />
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-white/5">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={settings.autoSwitch}
                          onChange={(e) => setSettings(s => ({ ...s, autoSwitch: e.target.checked }))}
                          className="rounded border-slate-600"
                        />
                        <span className="text-slate-300">Auto-switch to best market</span>
                      </label>
                    </div>
                  </div>
                )}

                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
                    <div className="text-xs text-slate-400 mb-1">Locked Profit</div>
                    <div className="text-xl font-bold text-emerald-400">{formatUSD(gabagoolMath.lockedProfit || stats.lockedProfit)}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
                    <div className="text-xs text-slate-400 mb-1">Avg Pair Cost</div>
                    <div className="text-xl font-bold text-white">{formatUSD(gabagoolMath.pairCost || stats.avgPairCost || 0)}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
                    <div className="text-xs text-slate-400 mb-1">Total Trades</div>
                    <div className="text-xl font-bold text-purple-400">{stats.totalTrades}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
                    <div className="text-xs text-slate-400 mb-1">ROI</div>
                    <div className="text-xl font-bold text-cyan-400">{formatNumber(stats.roi, 1)}%</div>
                  </div>
                </div>
              </div>

              {/* Gabagool Strategy Math */}
              <div className="rounded-2xl bg-slate-900/50 border border-white/5 p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <Sparkles className="w-5 h-5 text-emerald-400" />
                    <div>
                      <h3 className="font-semibold">Gabagool Hedge Math</h3>
                      <p className="text-xs text-slate-400">Live totals for YES/NO legs and guaranteed payout math.</p>
                    </div>
                  </div>
                  <div
                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${
                      gabagoolMath.pairCost > 0 && gabagoolMath.pairCost < settings.maxPairCost
                        ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                        : 'bg-amber-500/10 text-amber-200 border-amber-500/30'
                    }`}
                  >
                    Pair Cost: {formatUSD(gabagoolMath.pairCost || 0)}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-xs text-emerald-300 mb-1">Qty YES</div>
                    <div className="text-xl font-bold">{formatNumber(gabagoolMath.qtyYes, 2)}</div>
                    <div className="text-xs text-emerald-400/70">Cost: {formatUSD(gabagoolMath.costYes)}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                    <div className="text-xs text-red-300 mb-1">Qty NO</div>
                    <div className="text-xl font-bold text-red-200">{formatNumber(gabagoolMath.qtyNo, 2)}</div>
                    <div className="text-xs text-red-400/70">Cost: {formatUSD(gabagoolMath.costNo)}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/70 border border-white/5">
                    <div className="text-xs text-slate-400 mb-1">Average Prices</div>
                    <div className="text-sm text-slate-200">YES avg: {formatUSD(gabagoolMath.avgYes || 0)}</div>
                    <div className="text-sm text-slate-200">NO avg: {formatUSD(gabagoolMath.avgNo || 0)}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                    <div className="text-xs text-cyan-200 mb-1">Safety Buffer</div>
                    <div className="text-xl font-bold text-cyan-200">{formatPercent(gabagoolMath.safetyBuffer || 0)}</div>
                    <div className="text-xs text-cyan-100/70">Target &lt; {formatUSD(settings.maxPairCost)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl bg-purple-500/10 border border-purple-500/20">
                    <div className="text-xs text-purple-200 mb-1">Guaranteed Profit (min side)</div>
                    <div className="text-2xl font-bold text-purple-100">{formatUSD(gabagoolMath.lockedProfit)}</div>
                    <p className="text-xs text-purple-100/70 mt-1">Min(Qty YES, Qty NO) - (Cost YES + Cost NO)</p>
                  </div>
                  <div className="p-4 rounded-xl bg-slate-800/70 border border-white/5">
                    <div className="text-xs text-slate-400 mb-1">Coverage</div>
                    <div className="text-lg font-semibold">{formatNumber(Math.min(gabagoolMath.qtyYes, gabagoolMath.qtyNo), 2)} shares hedged</div>
                    <p className="text-xs text-slate-500 mt-1">Balanced legs increase guaranteed payout.</p>
                  </div>
                  <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="text-xs text-emerald-300 mb-1">Next Action Cue</div>
                    <p className="text-sm text-emerald-100">
                      Keep pair cost below {formatUSD(settings.maxPairCost)} while buying dips (YES &lt; {formatUSD(settings.maxYesPrice)}, NO &lt; {formatUSD(settings.maxNoPrice)}).
                    </p>
                  </div>
                </div>
              </div>

              {/* Market Selection */}
              <div className="rounded-2xl bg-slate-900/50 border border-white/5 p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold flex items-center gap-2">
                    <Layers className="w-5 h-5 text-purple-400" />
                    Market Selection
                  </h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setMarketType('hourly')}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        marketType === 'hourly'
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          : 'bg-slate-800 text-slate-400 border border-white/10 hover:border-white/20'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 inline mr-1" />
                      Hourly
                    </button>
                    <button
                      onClick={() => setMarketType('daily')}
                      className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        marketType === 'daily'
                          ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                          : 'bg-slate-800 text-slate-400 border border-white/10 hover:border-white/20'
                      }`}
                    >
                      <BarChart3 className="w-3.5 h-3.5 inline mr-1" />
                      Daily
                    </button>
                    <button
                      onClick={fetchMarkets}
                      disabled={isLoadingMarkets}
                      className="p-1.5 rounded-lg bg-slate-800 text-slate-400 border border-white/10 hover:border-white/20 transition-all"
                    >
                      <RefreshCw className={`w-4 h-4 ${isLoadingMarkets ? 'animate-spin' : ''}`} />
                    </button>
                  </div>
                </div>

                {/* Asset Chips */}
                <div className="flex flex-wrap gap-2 mb-4">
                  {SUPPORTED_ASSETS.map(asset => (
                    <button
                      key={asset.id}
                      onClick={() => toggleAsset(asset.id)}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                        selectedAssets.includes(asset.id)
                          ? 'bg-slate-700 text-white border border-white/20'
                          : 'bg-slate-800/50 text-slate-500 border border-white/5 hover:border-white/10'
                      }`}
                    >
                      <span style={{ color: selectedAssets.includes(asset.id) ? asset.color : undefined }}>
                        {asset.icon}
                      </span>
                      {asset.id}
                    </button>
                  ))}
                </div>

                {/* Markets Table */}
                <div className="rounded-xl border border-white/5 overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-slate-800/50">
                      <tr className="text-xs text-slate-400 uppercase tracking-wider">
                        <th className="px-4 py-3 text-left">Asset</th>
                        <th className="px-4 py-3 text-right">YES Price</th>
                        <th className="px-4 py-3 text-right">NO Price</th>
                        <th className="px-4 py-3 text-right">Pair Cost</th>
                        <th className="px-4 py-3 text-right">Profit</th>
                        <th className="px-4 py-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {markets.map(market => {
                        const profit = 1 - market.pairCost;
                        const isArbitrage = market.pairCost < settings.maxPairCost;
                        const isActive = activeMarket?.id === market.id;
                        
                        return (
                          <tr 
                            key={market.id}
                            onClick={() => setActiveMarket(market)}
                            className={`cursor-pointer transition-all ${
                              isActive 
                                ? 'bg-purple-500/10' 
                                : 'hover:bg-slate-800/50'
                            }`}
                          >
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-3">
                                <div 
                                  className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
                                  style={{ backgroundColor: `${market.assetColor}20` }}
                                >
                                  {market.assetIcon}
                                </div>
                                <div>
                                  <div className="font-medium">{market.asset}</div>
                                  <div className="text-xs text-slate-500">{market.type}</div>
                                </div>
                              </div>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={market.yesPrice < settings.maxYesPrice ? 'text-emerald-400' : 'text-white'}>
                                {formatUSD(market.yesPrice)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={market.noPrice < settings.maxNoPrice ? 'text-emerald-400' : 'text-white'}>
                                {formatUSD(market.noPrice)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={isArbitrage ? 'text-emerald-400 font-semibold' : 'text-white'}>
                                {formatUSD(market.pairCost)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              <span className={profit > 0 ? 'text-emerald-400' : 'text-red-400'}>
                                {profit > 0 ? '+' : ''}{formatPercent(profit)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right">
                              {isArbitrage ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-emerald-500/20 text-emerald-400">
                                  <Zap className="w-3 h-3" />
                                  Arbitrage
                                </span>
                              ) : (
                                <span className="text-xs text-slate-500">Monitoring</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Positions */}
              <div className="rounded-2xl bg-slate-900/50 border border-white/5 p-6">
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <Eye className="w-5 h-5 text-cyan-400" />
                  Active Positions ({positions.length})
                </h3>
                
                {positions.length === 0 ? (
                  <div className="text-center py-8 text-slate-500">
                    No active positions. Start the bot to begin trading.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {positions.map(pos => (
                      <div 
                        key={pos.marketId}
                        className="p-4 rounded-xl bg-slate-800/50 border border-white/5"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg"
                              style={{ backgroundColor: `${pos.assetColor}20` }}
                            >
                              {pos.assetIcon}
                            </div>
                            <div>
                              <div className="font-medium">{pos.asset}</div>
                              <div className="text-xs text-slate-500">
                                Pair Cost: {formatUSD(pos.pairCost)}
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm text-slate-400">Total Cost</div>
                            <div className="font-semibold">{formatUSD(pos.totalCost)}</div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-emerald-400">YES Shares</span>
                              <span className="text-xs text-slate-400">Avg: {formatUSD(pos.yesAvg)}</span>
                            </div>
                            <div className="text-lg font-bold text-emerald-400">{pos.yesShares}</div>
                          </div>
                          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-red-400">NO Shares</span>
                              <span className="text-xs text-slate-400">Avg: {formatUSD(pos.noAvg)}</span>
                            </div>
                            <div className="text-lg font-bold text-red-400">{pos.noShares}</div>
                          </div>
                        </div>
                        {pos.yesShares > 0 && pos.noShares > 0 && (
                          <div className="mt-3 p-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-center">
                            <span className="text-xs text-purple-400">
                              🔒 Locked Profit: {formatUSD((1 - pos.pairCost) * Math.min(pos.yesShares, pos.noShares))}
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right Column - Activity & History */}
            <div className="col-span-4 space-y-6">
              
              {/* Active Market Card */}
              {activeMarket && (
                <div className="rounded-2xl bg-gradient-to-br from-purple-900/30 to-indigo-900/30 border border-purple-500/20 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div 
                        className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl"
                        style={{ backgroundColor: `${activeMarket.assetColor}30` }}
                      >
                        {activeMarket.assetIcon}
                      </div>
                      <div>
                        <h3 className="font-bold text-lg">{activeMarket.asset}</h3>
                        <p className="text-sm text-slate-400">{activeMarket.question}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Expires</div>
                      <div className="text-sm font-medium">
                        {new Date(activeMarket.expiryTime).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                      <div className="text-xs text-emerald-400 mb-1">YES Price</div>
                      <div className="text-2xl font-bold text-emerald-400">
                        {formatUSD(activeMarket.yesPrice)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {activeMarket.yesPrice < settings.maxYesPrice ? '✓ Under threshold' : 'Above threshold'}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20">
                      <div className="text-xs text-red-400 mb-1">NO Price</div>
                      <div className="text-2xl font-bold text-red-400">
                        {formatUSD(activeMarket.noPrice)}
                      </div>
                      <div className="text-xs text-slate-500">
                        {activeMarket.noPrice < settings.maxNoPrice ? '✓ Under threshold' : 'Above threshold'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="p-4 rounded-xl bg-slate-800/50 border border-white/5">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-400">Combined Pair Cost</span>
                      <span className={`text-xl font-bold ${
                        activeMarket.pairCost < settings.maxPairCost ? 'text-emerald-400' : 'text-white'
                      }`}>
                        {formatUSD(activeMarket.pairCost)}
                      </span>
                    </div>
                    {activeMarket.pairCost < settings.maxPairCost && (
                      <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        Arbitrage opportunity! Profit: {formatPercent(1 - activeMarket.pairCost)}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Activity Log */}
              <div className="rounded-2xl bg-slate-900/50 border border-white/5 p-6">
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <Activity className="w-5 h-5 text-purple-400" />
                  Activity Log
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                  {activityLog.length === 0 ? (
                    <div className="text-center py-4 text-slate-500 text-sm">
                      No activity yet
                    </div>
                  ) : (
                    activityLog.map(entry => (
                      <div 
                        key={entry.id}
                        className="flex items-start gap-2 p-2 rounded-lg bg-slate-800/30"
                      >
                        {entry.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />}
                        {entry.type === 'error' && <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />}
                        {entry.type === 'info' && <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-300 break-words">{entry.message}</p>
                          <p className="text-xs text-slate-500">{entry.timestamp}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Trade History */}
              <div className="rounded-2xl bg-slate-900/50 border border-white/5 p-6">
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <BarChart3 className="w-5 h-5 text-cyan-400" />
                  Recent Trades ({tradeHistory.length})
                </h3>
                <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
                  {tradeHistory.length === 0 ? (
                    <div className="text-center py-4 text-slate-500 text-sm">
                      No trades yet
                    </div>
                  ) : (
                    tradeHistory.map(trade => (
                      <div 
                        key={trade.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-slate-800/30"
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                            trade.side === 'YES' 
                              ? 'bg-emerald-500/20 text-emerald-400' 
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {trade.side}
                          </div>
                          <div>
                            <div className="text-sm font-medium">{trade.asset}</div>
                            <div className="text-xs text-slate-500">
                              {trade.shares} shares @ {formatUSD(trade.price)}
                            </div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-medium">{formatUSD(trade.cost)}</div>
                          <div className="text-xs text-emerald-400">{trade.status}</div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* API Integration Guide */}
              <div className="rounded-2xl bg-slate-900/50 border border-white/5 p-6">
                <h3 className="font-semibold flex items-center gap-2 mb-4">
                  <ExternalLink className="w-5 h-5 text-indigo-400" />
                  Real API Integration
                </h3>
                <div className="space-y-3 text-sm">
                  <p className="text-slate-400">
                    To switch from demo to live trading:
                  </p>
                  <ol className="list-decimal list-inside space-y-2 text-slate-300">
                    <li>Set <code className="px-1.5 py-0.5 rounded bg-slate-800 text-purple-400">demoMode = false</code></li>
                    <li>The app will use real EIP-712 signing</li>
                    <li>API endpoint: <code className="px-1.5 py-0.5 rounded bg-slate-800 text-cyan-400">api.limitless.exchange/api-v1</code></li>
                  </ol>
                  <div className="mt-4 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                    <p className="text-xs text-amber-300">
                      ⚠️ Real trading involves risk. Test thoroughly before using real funds.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative border-t border-white/5 mt-12">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between text-sm text-slate-500">
            <div className="flex items-center gap-4">
              <span>Limitless Arbitrage Bot v1.0</span>
              <span className="text-slate-700">•</span>
              <span>Season 2 ends Jan 26, 2026</span>
            </div>
            <div className="flex items-center gap-4">
              <a 
                href="https://limitless.exchange" 
                target="_blank" 
                rel="noopener noreferrer"
                className="hover:text-purple-400 transition-colors flex items-center gap-1"
              >
                Limitless Exchange
                <ExternalLink className="w-3 h-3" />
              </a>
              <span className="text-slate-700">•</span>
              <span>Base Network</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
