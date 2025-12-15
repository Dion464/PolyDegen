import React, { Suspense, lazy } from 'react';
import { Route, Switch, Redirect } from 'react-router-dom';
import { useWeb3 } from '../hooks/useWeb3';

// Lazy load all page components for code splitting
const HomeWormStyle = lazy(() => import('../pages/home/HomeWormStyle'));
const Markets = lazy(() => import('../pages/markets/Markets'));
const About = lazy(() => import('../pages/about/About'));
const Stats = lazy(() => import('../pages/stats/Stats'));
const Activity = lazy(() => import('../pages/activity/Activity'));
const PolymarketStyleTrading = lazy(() => import('../pages/market/PolymarketStyleTrading'));
const User = lazy(() => import('../pages/user/User'));
const CreateMarket = lazy(() => import('../pages/create/CreateMarket'));
const MarketCreation = lazy(() => import('../pages/admin/MarketCreation'));
const PendingMarkets = lazy(() => import('../pages/admin/PendingMarkets'));
const AdminResolution = lazy(() => import('../pages/admin/AdminResolution'));
const AdminLogin = lazy(() => import('../pages/admin/AdminLogin'));
const RevenueDashboard = lazy(() => import('../components/admin/RevenueDashboard'));
const NotFound = lazy(() => import('../pages/notfound/NotFound'));

// Loading fallback component - minimal for fast display
const PageLoader = () => (
  <div className="min-h-screen bg-[#0E0E0E] flex items-center justify-center">
    <div className="flex flex-col items-center gap-4">
      <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      <span className="text-white/60 text-sm font-medium">Loading...</span>
    </div>
  </div>
);

// Admin addresses (lowercase)
const ADMIN_ADDRESSES = [
  '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266', // Hardhat account #0
  '0xed27c34a8434adc188a2d7503152024f64967b61', // User's admin wallet
].map(addr => addr.toLowerCase());

// Protected Admin Route Component
const AdminRoute = ({ component: Component, ...rest }) => {
  const { account, isConnected } = useWeb3();
  const isWalletAdmin = isConnected && account && ADMIN_ADDRESSES.includes(account.toLowerCase());
  const isLocalStorageAdmin = localStorage.getItem('isAdminLoggedIn') === 'true' && localStorage.getItem('usertype') === 'admin';
  const isAdmin = isWalletAdmin || isLocalStorageAdmin;

  return (
    <Route
      {...rest}
      render={(props) =>
        isAdmin ? (
          <Suspense fallback={<PageLoader />}>
            <Component {...props} />
          </Suspense>
        ) : (
          <Redirect to='/admin' />
        )
      }
    />
  );
};

const AppRoutes = () => {
  return (
    <Suspense fallback={<PageLoader />}>
      <Switch>
        {/* Public Routes */}
        <Route exact path='/about' component={About} />
        
        <Route exact path='/markets/:marketId'>
          <PolymarketStyleTrading />
        </Route>
        
        <Route exact path='/market/:marketId'>
          <PolymarketStyleTrading />
        </Route>
        
        <Route exact path='/markets' component={Markets} />
        
        <Route exact path='/user/:address' component={User} />
        
        <Route exact path='/stats' component={Stats} />
        <Route exact path='/activity' component={Activity} />

        {/* Public Market Creation */}
        <Route exact path='/create' component={CreateMarket} />

        {/* Admin Routes - Protected */}
        <Route exact path='/admin' component={AdminLogin} />
        <AdminRoute exact path='/admin/create-market' component={MarketCreation} />
        <AdminRoute exact path='/admin/pending' component={PendingMarkets} />
        <AdminRoute exact path='/admin/resolve' component={AdminResolution} />
        <AdminRoute exact path='/admin/revenue' component={RevenueDashboard} />

        {/* Home Route */}
        <Route exact path='/' component={HomeWormStyle} />

        {/* 404 Route */}
        <Route path='*' component={NotFound} />
      </Switch>
    </Suspense>
  );
};

export default AppRoutes;
