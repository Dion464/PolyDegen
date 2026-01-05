import React, { useState, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import { ethers } from 'ethers';
import WormStyleNavbar from '../../components/modern/WormStyleNavbar';
import { useWeb3 } from '../../hooks/useWeb3';
import toast from 'react-hot-toast';
import { showGlassToast } from '../../utils/toastUtils';
import { CONTRACT_ADDRESS } from '../../contracts/eth-config';

const CreateMarket = () => {
  const history = useHistory();
  const { account, isConnected, signer } = useWeb3();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPayingFee, setIsPayingFee] = useState(false);

  const [formData, setFormData] = useState({
    question: '',
    description: '',
    category: 'Politics',
    imageUrl: '',
    endDate: '',
    endTime: '23:59',
    resolutionDate: '',
    resolutionTime: '23:59',
    rules: []
  });

  const [currentRule, setCurrentRule] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [imagePreview, setImagePreview] = useState('');
  const fileInputRef = useRef(null);

  const SUBMISSION_FEE_TCENT = '1';
  const submissionFeeRecipient = import.meta.env.VITE_SUBMISSION_FEE_RECIPIENT;

  const resolveApiBase = () => {
    const envBase = import.meta.env.VITE_API_BASE_URL;
    const looksLocal = envBase && /localhost:8080|127\.0\.0\.1:8080/i.test(envBase);
    if (envBase && !looksLocal) return envBase;

    if (typeof window !== 'undefined' && window.location?.origin) {
      const origin = window.location.origin;
      // In production, use same origin (Vercel will serve /api)
      if (!/localhost|127\.0\.0\.1/i.test(origin)) {
        return origin;
      }
      // In local dev, always hit the deployed API
      return 'https://polydegen.vercel.app';
    }
    return '';
  };

  const homePageFont = {
    fontFamily: 'gilroy, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  };

  const categories = [
    'Politics',
    'Sports',
    'Crypto',
    'Tech',
    'KEK'
  ];

  const handleImageFile = (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showGlassToast({ title: 'Please upload an image file (PNG/JPG/GIF)' });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      showGlassToast({ title: 'Image too large. Max 5MB.' });
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result;
      setFormData(prev => ({ ...prev, imageUrl: result }));
      setImagePreview(result);
      showGlassToast({ title: 'Image attached successfully!' });
    };
    reader.readAsDataURL(file);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  };

  const handleManualImageUrl = (value) => {
    setFormData(prev => ({ ...prev, imageUrl: value }));
    setImagePreview(value);
  };

  const handleAddRule = () => {
    if (currentRule.trim()) {
      setFormData(prev => ({
        ...prev,
        rules: [...prev.rules, currentRule.trim()]
      }));
      setCurrentRule('');
    }
  };

  const handleRemoveRule = (index) => {
    setFormData(prev => ({
      ...prev,
      rules: prev.rules.filter((_, i) => i !== index)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!isConnected || !signer) {
      showGlassToast({ title: 'Please connect your wallet to submit a market' });
      return;
    }

    // Validation
    if (!formData.question.trim()) {
      showGlassToast({ title: 'Please enter a question' });
      return;
    }

    if (!formData.endDate || !formData.resolutionDate) {
      showGlassToast({ title: 'Please set end date and resolution date' });
      return;
    }

    const endTime = new Date(`${formData.endDate}T${formData.endTime}`);
    const resolutionTime = new Date(`${formData.resolutionDate}T${formData.resolutionTime}`);
    const now = new Date();

    if (endTime <= now) {
      showGlassToast({ title: 'End date must be in the future' });
      return;
    }

    if (resolutionTime <= endTime) {
      showGlassToast({ title: 'Resolution date must be after end date' });
      return;
    }

    setIsSubmitting(true);

    // Payment is REQUIRED - fail if recipient not configured
    if (!submissionFeeRecipient || !ethers.utils.isAddress(submissionFeeRecipient)) {
      showGlassToast({ title: 'Submission fee recipient not configured. Please contact support.' });
      setIsSubmitting(false);
      return;
    }

    let feeTxHash = null;
    let feeAmountWei = null;

    // Attempt fee payment (required, so fail if it fails)
    try {
      setIsPayingFee(true);
      const submissionFeeWei = ethers.utils.parseEther(SUBMISSION_FEE_TCENT);
      showGlassToast({ title: `Paying ${SUBMISSION_FEE_TCENT} TCENT submission fee...` });
      
      const feeTx = await signer.sendTransaction({
        to: submissionFeeRecipient,
        value: submissionFeeWei
      });
      
      feeTxHash = feeTx.hash;
      feeAmountWei = submissionFeeWei.toString();
      
      showGlassToast({ title: 'Waiting for fee payment confirmation...' });
      await feeTx.wait();
      
      showGlassToast({ title: 'Submission fee paid!' });
    } catch (feeError) {
      console.error('Fee payment failed:', feeError);
      showGlassToast({ title: `Fee payment failed: ${feeError.message || 'Transaction rejected'}. Market submission cancelled.` });
      setIsSubmitting(false);
      setIsPayingFee(false);
      return;
    } finally {
      setIsPayingFee(false);
    }

    try {
      const apiBaseUrl = resolveApiBase();
      console.log('Submitting to:', `${apiBaseUrl}/api/pending-markets`);
      
      const response = await fetch(`${apiBaseUrl}/api/pending-markets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: formData.question.trim(),
          description: formData.description.trim() || null,
          category: formData.category,
          imageUrl: formData.imageUrl.trim() || null,
          endTime: endTime.toISOString(),
          resolutionTime: resolutionTime.toISOString(),
          rules: formData.rules.length > 0 ? formData.rules : null,
          creator: account.toLowerCase(),
          feeTxHash,
          feeAmountWei
        })
      });

      let data;
      try {
        const text = await response.text();
        if (!text) {
          throw new Error('Empty response from server');
        }
        data = JSON.parse(text);
      } catch (jsonError) {
        console.error('Failed to parse API response:', jsonError);
        throw new Error(`API returned invalid response (status ${response.status}). Check Vercel logs.`);
      }

      if (!response.ok) {
        const errorMsg = data.details 
          ? `${data.error}: ${data.details}${data.code ? ` (${data.code})` : ''}`
          : data.error || 'Failed to submit market';
        console.error('API error response:', data);
        throw new Error(errorMsg);
      }

      // Success - show toast and log for debugging
      console.log('✅ Market submitted successfully:', data);
      showGlassToast({ title: 'Market submitted for approval!' });
      
      // Reset form
      setFormData({
        question: '',
        description: '',
        category: 'Politics',
        imageUrl: '',
        endDate: '',
        endTime: '23:59',
        resolutionDate: '',
        resolutionTime: '23:59',
        rules: []
      });
      setImagePreview('');

      // Redirect to home after 2 seconds
      setTimeout(() => {
        history.push('/');
      }, 2000);

    } catch (error) {
      console.error('Error submitting market:', error);
      showGlassToast({ title: error.message || 'Failed to submit market' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E0E0E]" style={homePageFont}>
      <WormStyleNavbar />
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-24 pb-12">
        <div className="glass-card rounded-[24px] p-8" style={{
          background: 'linear-gradient(180deg, rgba(15,15,15,0.92) 0%, rgba(8,8,8,0.78) 100%)',
          backdropFilter: 'blur(32px)'
        }}>
          <h1 className="text-3xl font-bold text-white mb-2">Create Market</h1>
          <p className="text-gray-400 mb-8">
            Submit a prediction market for admin approval. Once approved, it will be deployed on-chain.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Question */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Question *
              </label>
              <input
                type="text"
                value={formData.question}
                onChange={(e) => setFormData({ ...formData, question: e.target.value })}
                placeholder="Will Bitcoin reach $100,000 by end of 2025?"
                className="w-full px-4 py-3 rounded-[12px] glass-card text-white placeholder-gray-500"
                style={{
                  background: 'linear-gradient(180deg, rgba(32,32,32,0.92) 0%, rgba(14,14,14,0.68) 100%)',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}
                required
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="Additional details about the market..."
                rows={4}
                className="w-full px-4 py-3 rounded-[12px] glass-card text-white placeholder-gray-500"
                style={{
                  background: 'linear-gradient(180deg, rgba(32,32,32,0.92) 0%, rgba(14,14,14,0.68) 100%)',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Category *
              </label>
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                className="w-full px-4 py-3 rounded-[12px] glass-card text-white"
                style={{
                  background: 'linear-gradient(180deg, rgba(32,32,32,0.92) 0%, rgba(14,14,14,0.68) 100%)',
                  border: '1px solid rgba(255,255,255,0.05)'
                }}
                required
              >
                {categories.map(cat => (
                  <option key={cat} value={cat} className="bg-[#1a1a1a]">{cat}</option>
                ))}
              </select>
            </div>

            {/* Image Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Market Image (drag & drop or paste URL)
              </label>

              <div
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`w-full border rounded-[16px] px-4 py-6 text-center transition-all cursor-pointer ${
                  dragActive ? 'border-[#FFE600] bg-white/5' : 'border-white/10 bg-white/5/0'
                }`}
                style={{
                  background: 'linear-gradient(180deg, rgba(24,24,24,0.6) 0%, rgba(8,8,8,0.5) 100%)'
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleImageFile(e.target.files?.[0])}
                />
                <p className="text-sm text-gray-300">
                  Drop an image here or <span className="text-[#FFE600]">browse</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">Max 5MB • PNG/JPG/GIF</p>
                {imagePreview && (
                  <div className="mt-4 flex justify-center">
                    <img src={imagePreview} alt="Preview" className="w-40 h-24 object-cover rounded-[12px] border border-white/10" />
                  </div>
                )}
              </div>

              <div className="mt-3">
                <input
                  type="url"
                  value={formData.imageUrl}
                  onChange={(e) => handleManualImageUrl(e.target.value)}
                  placeholder="https://example.com/image.jpg"
                  className="w-full px-4 py-3 rounded-[12px] glass-card text-white placeholder-gray-500"
                  style={{
                    background: 'linear-gradient(180deg, rgba(32,32,32,0.92) 0%, rgba(14,14,14,0.68) 100%)',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}
                />
              </div>
            </div>

            {/* End Date & Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  End Date *
                </label>
                <input
                  type="date"
                  value={formData.endDate}
                  onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                  className="w-full px-4 py-3 rounded-[12px] glass-card text-white"
                  style={{
                    background: 'linear-gradient(180deg, rgba(32,32,32,0.92) 0%, rgba(14,14,14,0.68) 100%)',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  End Time *
                </label>
                <input
                  type="time"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                  className="w-full px-4 py-3 rounded-[12px] glass-card text-white"
                  style={{
                    background: 'linear-gradient(180deg, rgba(32,32,32,0.92) 0%, rgba(14,14,14,0.68) 100%)',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}
                  required
                />
              </div>
            </div>

            {/* Resolution Date & Time */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Resolution Date *
                </label>
                <input
                  type="date"
                  value={formData.resolutionDate}
                  onChange={(e) => setFormData({ ...formData, resolutionDate: e.target.value })}
                  className="w-full px-4 py-3 rounded-[12px] glass-card text-white"
                  style={{
                    background: 'linear-gradient(180deg, rgba(32,32,32,0.92) 0%, rgba(14,14,14,0.68) 100%)',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Resolution Time *
                </label>
                <input
                  type="time"
                  value={formData.resolutionTime}
                  onChange={(e) => setFormData({ ...formData, resolutionTime: e.target.value })}
                  className="w-full px-4 py-3 rounded-[12px] glass-card text-white"
                  style={{
                    background: 'linear-gradient(180deg, rgba(32,32,32,0.92) 0%, rgba(14,14,14,0.68) 100%)',
                    border: '1px solid rgba(255,255,255,0.05)'
                  }}
                  required
                />
              </div>
            </div>

            {/* Rules */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Market Rules (optional)
              </label>
              <div className="space-y-2">
                {formData.rules.map((rule, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <div className="flex-1 px-4 py-2 rounded-[12px] glass-card text-white text-sm"
                      style={{
                        background: 'linear-gradient(180deg, rgba(32,32,32,0.92) 0%, rgba(14,14,14,0.68) 100%)',
                        border: '1px solid rgba(255,255,255,0.05)'
                      }}>
                      {index + 1}. {rule}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveRule(index)}
                      className="px-3 py-2 rounded-[8px] text-red-400 hover:bg-red-500/10"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={currentRule}
                    onChange={(e) => setCurrentRule(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddRule();
                      }
                    }}
                    placeholder="Add a rule..."
                    className="flex-1 px-4 py-3 rounded-[12px] glass-card text-white placeholder-gray-500"
                    style={{
                      background: 'linear-gradient(180deg, rgba(32,32,32,0.92) 0%, rgba(14,14,14,0.68) 100%)',
                      border: '1px solid rgba(255,255,255,0.05)'
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddRule}
                    className="px-6 py-3 rounded-[12px] text-white"
                    style={{
                      background: 'linear-gradient(180deg, rgba(15,15,15,0.92) 0%, rgba(8,8,8,0.78) 100%)',
                      border: '1px solid #FFE600'
                    }}
                  >
                    Add
                  </button>
                </div>
              </div>
            </div>

            {/* Submission Fee Info */}
            <div className="rounded-[16px] border border-white/5 bg-white/5 px-4 py-3 text-sm text-gray-300">
              <p className="font-semibold text-white">Submission Fee</p>
              <p className="text-gray-400">A refundable {SUBMISSION_FEE_TCENT} TCENT deposit is required when submitting new markets. This helps prevent spam listings.</p>
            </div>

            {/* Submit Button */}
            <div className="flex gap-4 pt-4">
              <button
                type="button"
                onClick={() => history.push('/')}
                className="flex-1 py-4 rounded-[12px] text-white font-medium"
                style={{
                  background: 'linear-gradient(180deg, rgba(32,32,32,0.92) 0%, rgba(14,14,14,0.68) 100%)',
                  border: '1px solid rgba(255,255,255,0.1)'
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !isConnected}
                className="flex-1 py-4 rounded-[12px] text-black font-bold disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: isConnected ? '#FFE600' : 'rgba(255,230,0,0.3)',
                  border: '1px solid #FFE600'
                }}
              >
                {isSubmitting ? (isPayingFee ? 'Paying fee...' : 'Submitting...') : isConnected ? 'Submit for Approval' : 'Connect Wallet'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default CreateMarket;

