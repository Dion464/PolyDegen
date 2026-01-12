import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import { useWeb3 } from '../../hooks/useWeb3';
import { useAuth } from '../../helpers/AuthContent';
import { getCurrencySymbol } from '../../utils/currency';
import toast from 'react-hot-toast';
import { showTransactionToast, showGlassToast } from '../../utils/toastUtils.jsx';

const MarketCreation = () => {
  const history = useHistory();
  const { createMarket, isConnected, connectWallet, provider, chainId } = useWeb3();
  const { isLoggedIn } = useAuth();
  const currencySymbol = getCurrencySymbol(chainId);
  
  const [formData, setFormData] = useState({
    question: '',
    description: '',
    category: 'general',
    endDate: '',
    endTime: '',
    resolutionDate: '',
    resolutionTime: '',
    imageUrl: ''
  });

  const [isLoading, setIsLoading] = useState(false);
  const [estimatedFee, setEstimatedFee] = useState('0.001');
  const [imagePreview, setImagePreview] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [ruleInput, setRuleInput] = useState('');
  const [rules, setRules] = useState([]);

  const resolveApiBase = () => {
    const envBase = import.meta.env.VITE_API_BASE_URL;
    const isLocal8080 = envBase && /localhost:8080|127\.0\.0\.1:8080/i.test(envBase);
    if (envBase && !isLocal8080) {
      return envBase;
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
      return window.location.origin;
    }
    return '';
  };
  const API_BASE = resolveApiBase();

  const handleLogout = () => {
    localStorage.removeItem('isAdminLoggedIn');
    localStorage.removeItem('usertype');
    localStorage.removeItem('username');
    toast.success('Logged out successfully');
    history.push('/admin');
  };

  const categories = [
    { value: 'general', label: 'General' },
    { value: 'sports', label: 'Sports' },
    { value: 'technology', label: 'Technology' },
    { value: 'crypto', label: 'Crypto' },
    { value: 'entertainment', label: 'Entertainment' },
    { value: 'politics', label: 'Politics' },
    { value: 'economics', label: 'Economics' },
    { value: 'science', label: 'Science' },
    { value: 'medical', label: 'Medical' },
    { value: 'ai', label: 'AI' },
    { value: 'startups', label: 'Startups' }
  ];

  // Check admin access
  const isAdminLoggedIn = localStorage.getItem('isAdminLoggedIn') === 'true';
  const usertype = localStorage.getItem('usertype');
  
  // Check admin access - redirect to admin login if not authenticated
  React.useEffect(() => {
    if (!isAdminLoggedIn || usertype !== 'admin') {
      history.push('/admin');
    }
  }, [history, isAdminLoggedIn, usertype]);
  
  if (!isAdminLoggedIn || usertype !== 'admin') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-xl shadow-lg p-8 text-center">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h2 className="text-2xl font-semibold text-gray-900 mb-2">Redirecting...</h2>
          <p className="text-gray-600 mb-6">Please wait while we redirect you to the admin login.</p>
        </div>
      </div>
    );
  }

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleImageChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size must be less than 5MB');
      return;
    }

    setImageFile(file);
    setUploadingImage(true);

    try {
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result);
      };
      reader.readAsDataURL(file);

      // Upload to a free image hosting service (using base64 for now, can be replaced with imgbb/cloudinary)
      // For production, you'd want to upload to IPFS, Cloudinary, or similar
      const reader2 = new FileReader();
      reader2.onloadend = async () => {
        const base64Image = reader2.result;
        
        // Option 1: Use base64 directly (stored in description)
        // Option 2: Upload to imgbb.com (free service)
        try {
          // Using imgbb API (you'll need to get a free API key from imgbb.com)
          // For now, we'll use base64 and store it
          setFormData(prev => ({
            ...prev,
            imageUrl: base64Image
          }));
          toast.success('Image loaded successfully');
        } catch (error) {
          console.error('Error uploading image:', error);
          // Fallback to base64
          setFormData(prev => ({
            ...prev,
            imageUrl: base64Image
          }));
          toast.success('Image loaded (using local storage)');
        }
        setUploadingImage(false);
      };
      reader2.readAsDataURL(file);
    } catch (error) {
      console.error('Error processing image:', error);
      toast.error('Failed to process image');
      setUploadingImage(false);
    }
  };

  const removeImage = () => {
    setImageFile(null);
    setImagePreview(null);
    setFormData(prev => ({
      ...prev,
      imageUrl: ''
    }));
  };

  const handleAddRule = () => {
    const trimmed = ruleInput.trim();
    if (!trimmed) {
      toast.error('Rule cannot be empty');
      return;
    }
    setRules(prev => [...prev, trimmed]);
    setRuleInput('');
  };

  const handleRemoveRule = (index) => {
    setRules(prev => prev.filter((_, idx) => idx !== index));
  };

  const calculateTimestamps = () => {
    // Use UTC to avoid timezone issues
    const endDateTime = new Date(`${formData.endDate}T${formData.endTime}:00`);
    const resolutionDateTime = new Date(`${formData.resolutionDate}T${formData.resolutionTime}:00`);
    
    // Validate dates are valid
    if (isNaN(endDateTime.getTime())) {
      throw new Error('Invalid end date/time format');
    }
    if (isNaN(resolutionDateTime.getTime())) {
      throw new Error('Invalid resolution date/time format');
    }
    
    return {
      endTime: Math.floor(endDateTime.getTime() / 1000),
      resolutionTime: Math.floor(resolutionDateTime.getTime() / 1000)
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!isConnected) {
      toast.error('Please connect your wallet first');
      return;
    }

    // Validation
    if (!formData.question.trim()) {
      toast.error('Question is required');
      return;
    }

    if (!formData.endDate || !formData.endTime || !formData.resolutionDate || !formData.resolutionTime) {
      toast.error('Please fill in all date and time fields');
      return;
    }

    let endTime, resolutionTime;
    try {
      const timestamps = calculateTimestamps();
      endTime = timestamps.endTime;
      resolutionTime = timestamps.resolutionTime;
    } catch (error) {
      toast.error(error.message || 'Invalid date/time format');
      return;
    }

    // Get current blockchain time instead of browser time
    let blockchainTime;
    try {
      if (provider) {
        const block = await provider.getBlock('latest');
        blockchainTime = block.timestamp;
      } else {
        // Fallback to browser time if no provider
        blockchainTime = Math.floor(Date.now() / 1000);
      }
    } catch (error) {
      console.warn('Could not get blockchain time, using browser time:', error);
      blockchainTime = Math.floor(Date.now() / 1000);
    }

    // Add 2 minute buffer to account for transaction processing time
    const minEndTime = blockchainTime + 120; // 2 minutes buffer
    const minResolutionTime = blockchainTime + 180; // 3 minutes minimum

    // Additional validation with detailed logging
    console.log('📅 Date Validation:');
    console.log('  End date/time:', formData.endDate, formData.endTime);
    console.log('  Resolution date/time:', formData.resolutionDate, formData.resolutionTime);
    console.log('  End timestamp:', endTime, new Date(endTime * 1000).toLocaleString());
    console.log('  Resolution timestamp:', resolutionTime, new Date(resolutionTime * 1000).toLocaleString());
    console.log('  Blockchain timestamp:', blockchainTime, new Date(blockchainTime * 1000).toLocaleString());
    console.log('  Minimum end time (with buffer):', minEndTime, new Date(minEndTime * 1000).toLocaleString());
    console.log('  End time is future:', endTime > minEndTime);
    console.log('  Resolution after end:', resolutionTime > endTime);

    if (endTime <= minEndTime) {
      const secondsUntilEnd = endTime - minEndTime;
      toast.error(`End time must be at least 2 minutes in the future. Please select a later date/time.`);
      console.error(`End time ${endTime} is not at least 2 minutes after blockchain time ${minEndTime}`);
      return;
    }

    if (resolutionTime <= endTime) {
      const secondsBetween = endTime - resolutionTime;
      toast.error(`Resolution time must be after end time. (Currently ${-secondsBetween} seconds before end)`);
      return;
    }

    // Validate timestamps are valid numbers
    if (isNaN(endTime) || isNaN(resolutionTime)) {
      toast.error('Invalid date/time format. Please check your input.');
      return;
    }

    setIsLoading(true);

    try {
      toast.loading('Creating market...');
      
      console.log('🚀 Attempting to create market with:');
      console.log('  Question:', formData.question);
      console.log('  Category:', formData.category);
      console.log('  End time:', endTime, new Date(endTime * 1000).toLocaleString());
      console.log('  Resolution time:', resolutionTime, new Date(resolutionTime * 1000).toLocaleString());
      
      const receipt = await createMarket(
        formData.question,
        formData.description || '',
        formData.category,
        endTime,
        resolutionTime
      );

      // Extract market ID from events (same pattern as scripts)
      let marketId = null;
      if (receipt.events) {
        const marketCreatedEvent = receipt.events.find(e => e.event === 'MarketCreated');
        if (marketCreatedEvent && marketCreatedEvent.args) {
          marketId = marketCreatedEvent.args.marketId?.toString() || marketCreatedEvent.args[0]?.toString();
        }
      }

      const txHash = receipt?.transactionHash;

      // Create activity event for market creation
      if (marketId) {
        try {
          await fetch(`${API_BASE}/api/activity/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'MARKET_CREATED',
              marketId: marketId,
              creator: account,
              question: formData.question,
              category: formData.category,
              txHash: txHash,
              blockNumber: receipt.blockNumber?.toString() || null,
              blockTime: new Date().toISOString()
            })
          });
          console.log('✅ Market created activity event recorded');
        } catch (activityErr) {
          console.error('⚠️ Failed to create activity event:', activityErr);
        }

        if (formData.imageUrl) {
          try {
            const response = await fetch(`${API_BASE}/api/market-images`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                marketId,
                imageUrl: formData.imageUrl,
                question: formData.question,
                description: formData.description,
                category: formData.category,
              }),
            });

            if (!response.ok) {
              const errorText = await response.text();
              throw new Error(errorText || 'Failed to save market image');
            }

            toast.success(`Image saved for market #${marketId}`);
          } catch (imgError) {
            console.error('Error saving market image:', imgError);
            toast.error('Image saved locally but failed to sync to database');
          }
        }

        if (rules.length > 0) {
          const storedRules = JSON.parse(localStorage.getItem('marketRules') || '{}');
          storedRules[marketId] = rules;
          localStorage.setItem('marketRules', JSON.stringify(storedRules));
          console.log('✅ Stored rules for market:', marketId, rules);
        }
      } else if (formData.imageUrl || rules.length > 0) {
        console.warn('⚠️ Could not extract market ID from transaction receipt');
        console.log('Receipt events:', receipt.events);
        toast('Metadata saved locally but market ID not found. Data will fallback to defaults.');
      }

      showTransactionToast({
        icon: '✅',
        title: 'Market created on-chain',
        description: marketId
          ? `Market #${marketId} is live on Incentiv Testnet.`
          : 'Your market is live—final details will populate shortly.',
        txHash
      });

      showGlassToast({
        icon: '🚀',
        title: 'Market creation complete',
        description: 'The new market has been published and added to the marketplace.',
        duration: 5200
      });
      
      // Reset form
      setFormData({
        question: '',
        description: '',
        category: 'general',
        endDate: '',
        endTime: '',
        resolutionDate: '',
        resolutionTime: '',
        imageUrl: ''
      });
      setImagePreview(null);
      setImageFile(null);
      setRules([]);
      setRuleInput('');

      // Redirect to markets or new market
      // The new market ID would be in the events
      history.push('/markets');
    } catch (error) {
      console.error('❌ Error creating market:', error);
      console.error('Error details:', {
        message: error.message,
        code: error.code,
        data: error.data,
        reason: error.reason
      });
      
      // Show user-friendly error message
      const errorMessage = error.message || 'Failed to create market';
      toast.error(errorMessage);
    } finally {
      setIsLoading(false);
      toast.dismiss();
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white py-16 px-4 sm:px-8" style={{ fontFamily: 'gilroy, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <div className="max-w-5xl mx-auto space-y-10">
        <div className="glass-card border border-white/15 rounded-[28px] px-10 py-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6 bg-transparent">
          <div>
            <p className="uppercase tracking-[0.32em] text-white/45 text-xs mb-3">Admin Console</p>
            <h1 className="text-[32px] font-semibold leading-tight">Create New Market</h1>
            <p className="text-white/60 text-sm max-w-xl mt-3">
              Launch a new prediction market with the same glass aesthetic used across the app.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="text-white/70 hover:text-white text-sm font-medium flex items-center gap-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Logout
          </button>
        </div>

        {!isConnected && (
          <div className="glass-card border border-[#FFE600]/40 rounded-[24px] px-8 py-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-[#161616]">
            <div className="flex items-center gap-3 text-[#FFE600]">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="font-medium tracking-wide text-sm">Connect your wallet to create markets</p>
            </div>
            <button
              onClick={connectWallet}
              className="px-6 py-2 rounded-full border border-[#FFE600] text-white hover:bg-[#FFE600]/10 transition-colors text-sm"
            >
              Connect Wallet
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="glass-card border border-white/15 rounded-[28px] px-10 py-10 space-y-8 bg-[#111111]/60">
            <div className="space-y-3">
              <label htmlFor="question" className="text-xs uppercase tracking-[0.32em] text-white/45">Market Question*</label>
              <input
                type="text"
                id="question"
                name="question"
                value={formData.question}
                onChange={handleInputChange}
                placeholder="Will ETH reach $10,000 by Dec 31, 2025?"
                className="w-full px-5 py-4 bg-transparent border border-white/15 rounded-[18px] text-white placeholder:text-white/35 focus:outline-none focus:border-[#FFE600] transition-all"
                required
              />
            </div>

            <div className="space-y-3">
              <label htmlFor="description" className="text-xs uppercase tracking-[0.32em] text-white/45">Description</label>
              <textarea
                id="description"
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                rows="4"
                placeholder="Provide context or clarification. Markdown supported."
                className="w-full px-5 py-4 bg-transparent border border-white/15 rounded-[18px] text-white placeholder:text-white/35 focus:outline-none focus:border-[#FFE600] transition-all resize-none"
              />
            </div>

            <div className="space-y-3">
              <label className="text-xs uppercase tracking-[0.32em] text-white/45">Market Image</label>
              <div className="space-y-4">
                {imagePreview ? (
                  <div className="relative glass-card border border-white/15 rounded-[20px] overflow-hidden">
                    <img src={imagePreview} alt="Market preview" className="w-full h-52 object-cover" />
                    <button
                      type="button"
                      onClick={removeImage}
                      className="absolute top-3 right-3 px-3 py-1.5 rounded-full border border-red-400 text-red-300 text-xs uppercase tracking-[0.2em] hover:bg-red-500/10 transition"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <label
                    htmlFor="image"
                    className="glass-card border border-dashed border-white/20 rounded-[20px] px-8 py-12 flex flex-col items-center justify-center gap-4 text-white/60 cursor-pointer hover:border-[#FFE600] transition-colors"
                  >
                    <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <div className="text-center text-sm">
                      <p className="font-medium">{uploadingImage ? 'Uploading image...' : 'Drop or click to add artwork'}</p>
                      <p className="text-white/40 text-xs mt-2">PNG, JPG, GIF up to 5MB</p>
                    </div>
                    <input
                      type="file"
                      id="image"
                      name="image"
                      accept="image/*"
                      onChange={handleImageChange}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label htmlFor="category" className="text-xs uppercase tracking-[0.32em] text-white/45">Category</label>
                <select
                  id="category"
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  className="w-full px-5 py-4 bg-[#121212] border border-white/15 rounded-[18px] text-white focus:outline-none focus:border-[#FFE600]"
                >
                  {categories.map(cat => (
                    <option key={cat.value} value={cat.value} className="bg-[#0B0B0B] text-white">
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="glass-card border border-white/12 rounded-[18px] px-5 py-4 bg-transparent">
                <p className="text-xs uppercase tracking-[0.3em] text-white/45 mb-2">Estimated Fee</p>
                <p className="text-[24px] font-semibold">{estimatedFee} {currencySymbol}</p>
                <p className="text-white/40 text-xs mt-1">Debited once the market is confirmed on-chain.</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label htmlFor="endDate" className="text-xs uppercase tracking-[0.32em] text-white/45">End Date*</label>
                <input
                  type="date"
                  id="endDate"
                  name="endDate"
                  value={formData.endDate}
                  onChange={handleInputChange}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-5 py-4 bg-transparent border border-white/15 rounded-[18px] text-white focus:outline-none focus:border-[#FFE600]"
                  required
                />
              </div>
              <div className="space-y-3">
                <label htmlFor="endTime" className="text-xs uppercase tracking-[0.32em] text-white/45">End Time*</label>
                <input
                  type="time"
                  id="endTime"
                  name="endTime"
                  value={formData.endTime}
                  onChange={handleInputChange}
                  className="w-full px-5 py-4 bg-transparent border border-white/15 rounded-[18px] text-white focus:outline-none focus:border-[#FFE600]"
                  required
                />
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <label htmlFor="resolutionDate" className="text-xs uppercase tracking-[0.32em] text-white/45">Resolution Date*</label>
                <input
                  type="date"
                  id="resolutionDate"
                  name="resolutionDate"
                  value={formData.resolutionDate}
                  onChange={handleInputChange}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-5 py-4 bg-transparent border border-white/15 rounded-[18px] text-white focus:outline-none focus:border-[#FFE600]"
                  required
                />
              </div>
              <div className="space-y-3">
                <label htmlFor="resolutionTime" className="text-xs uppercase tracking-[0.32em] text-white/45">Resolution Time*</label>
                <input
                  type="time"
                  id="resolutionTime"
                  name="resolutionTime"
                  value={formData.resolutionTime}
                  onChange={handleInputChange}
                  className="w-full px-5 py-4 bg-transparent border border-white/15 rounded-[18px] text-white focus:outline-none focus:border-[#FFE600]"
                  required
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs uppercase tracking-[0.32em] text-white/45">Market Rules</h3>
                  <p className="text-white/40 text-xs mt-2">These will display on the market detail page.</p>
                </div>
                <span className="text-white/50 text-xs uppercase tracking-[0.28em]">{rules.length} Added</span>
              </div>

              <div className="glass-card border border-white/15 rounded-[20px] px-5 py-5 bg-transparent space-y-4">
                <textarea
                  value={ruleInput}
                  onChange={(e) => setRuleInput(e.target.value)}
                  rows="3"
                  placeholder="Add a new rule…"
                  className="w-full px-4 py-3 bg-transparent border border-white/12 rounded-[16px] text-white placeholder:text-white/35 focus:outline-none focus:border-[#FFE600]"
                />
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={handleAddRule}
                    className="px-6 py-2 rounded-full border border-[#FFE600] text-white hover:bg-[#FFE600]/10 transition-colors text-xs font-medium tracking-[0.2em]"
                  >
                    Add Rule
                  </button>
                  <span className="text-white/40 text-xs">Keep rules concise and unambiguous.</span>
                </div>
              </div>

              {rules.length > 0 && (
                <div className="space-y-3">
                  {rules.map((rule, index) => (
                    <div
                      key={`${rule}-${index}`}
                      className="glass-card border border-white/12 rounded-[20px] px-5 py-4 bg-transparent flex items-start gap-4"
                    >
                      <div className="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center text-sm text-white/80">
                        {index + 1}
                      </div>
                      <p className="flex-1 text-white/80 leading-relaxed">{rule}</p>
                      <button
                        type="button"
                        onClick={() => handleRemoveRule(index)}
                        className="text-white/45 hover:text-white text-xs uppercase tracking-[0.26em]"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <button
              type="button"
              onClick={() => history.push('/markets')}
              className="text-white/50 hover:text-white text-sm uppercase tracking-[0.28em] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!isConnected || isLoading}
              className="px-8 py-3 rounded-full border border-[#FFE600] text-white text-sm uppercase tracking-[0.3em] hover:bg-[#FFE600]/10 transition disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating…' : 'Create Market'}
            </button>
          </div>
        </form>

        <div className="glass-card border border-white/15 rounded-[24px] px-8 py-8 bg-[#111111]/60">
          <h3 className="text-sm uppercase tracking-[0.3em] text-white/55 mb-4">Guidelines</h3>
          <ul className="space-y-2 text-sm text-white/70 leading-relaxed">
            <li>• Questions must be specific, measurable, and unambiguous.</li>
            <li>• Choose end and resolution times that allow enough trading activity.</li>
            <li>• Ensure your wallet holds sufficient {currencySymbol} to cover creation fees.</li>
            <li>• Markets become active immediately after the transaction is confirmed.</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default MarketCreation;

