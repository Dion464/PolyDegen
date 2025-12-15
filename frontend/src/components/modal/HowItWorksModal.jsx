import React, { useState, useEffect } from 'react';
import ReactDOM from 'react-dom';
import '../../pages/market/MarketDetailGlass.css';

const HowItWorksModal = ({ isOpen, onClose }) => {
  const [currentStep, setCurrentStep] = useState(0);

  // Reset to first step when modal opens
  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0);
    }
  }, [isOpen]);

  // Close on escape key and lock body scroll
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const steps = [
    {
      image: '/1.svg',
      number: '1',
      title: 'Pick a Market',
      description: "Buy 'Yes' or 'No' shares depending on your prediction. Buying shares is like betting on the outcome. Odds shift in real time as other traders bet."
    },
    {
      image: '/2.svg',
      number: '2',
      title: 'Place a bet',
      description: "Fund your account with crypto, credit/debit card, or bank transfer, then you're ready to bet. No bet limits and no fees."
    },
    {
      image: '/3.svg',
      number: '3',
      title: 'Profit',
      description: "Sell your 'Yes' or 'No' shares at any time, or wait until the market ends to redeem winning shares for $1 each. Create an account and place your first trade in minutes."
    }
  ];

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1);
    } else {
      onClose();
    }
  };

  const step = steps[currentStep];

  const modalContent = (
    <div 
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '20px',
        boxSizing: 'border-box'
      }}
    >
      {/* Backdrop */}
      <div 
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'transparent',
          backdropFilter: 'blur(5px)'
        }}
      />
      
      {/* Modal with glass effect */}
      <div 
        className="glass-card box-shadow"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: '450px',
          background: 'black',
          borderRadius: '20px',
          overflow: 'hidden'
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            zIndex: 10,
            width: '36px',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'rgba(255,255,255,0.5)',
            background: 'rgba(0,0,0,0.3)',
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            transition: 'color 0.2s'
          }}
          onMouseEnter={(e) => e.target.style.color = 'white'}
          onMouseLeave={(e) => e.target.style.color = 'rgba(255,255,255,0.5)'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>

        {/* Image container */}
        <div 
          style={{
            width: '100%',
            height: '360px',
            overflow: 'hidden'
          }}
        >
          <img 
            src={step.image} 
            alt={step.title}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: 'center'
            }}
          />
        </div>

        {/* Content */}
        <div style={{ padding: '28px 24px 24px' }}>
          {/* Title */}
          <h2 
            style={{
              fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, sans-serif',
              color: 'white',
              textAlign: 'center',
              fontSize: '28px',
              fontWeight: 600,
              letterSpacing: '-0.5px',
              margin: '0 0 16px 0'
            }}
          >
            {step.number}. {step.title}
          </h2>

          {/* Description */}
          <p 
            style={{
              fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, sans-serif',
              color: '#999',
              textAlign: 'center',
              fontSize: '16px',
              lineHeight: '1.6',
              fontWeight: 400,
              margin: '0 0 28px 0',
              minHeight: '76px'
            }}
          >
            {step.description}
          </p>

          {/* Next button only */}
          <button
            onClick={handleNext}
            className="glass-card"
            style={{
              width: '100%',
              padding: '14px 24px',
              borderRadius: '6px',
              border: 'none',
              backgroundColor: '#FCDB35',
              color: 'black',
              fontFamily: '"Clash Grotesk", "Space Grotesk", -apple-system, BlinkMacSystemFont, sans-serif',
              fontSize: '16px',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s',
              boxShadow: 'inset 0 0 1px rgba(255, 255, 255, 0.6), inset 0 0 16px rgba(255, 255, 255, 0.06)'
            }}
            onMouseEnter={(e) => e.target.style.backgroundColor = '#f0d800'}
            onMouseLeave={(e) => e.target.style.backgroundColor = '#FCDB35'}
          >
            {currentStep === steps.length - 1 ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>
    </div>
  );

  // Render to body using portal to escape any parent styling issues
  return ReactDOM.createPortal(modalContent, document.body);
};

export default HowItWorksModal;
