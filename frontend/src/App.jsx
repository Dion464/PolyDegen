import React from 'react';
import { BrowserRouter as Router } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './helpers/AuthContent';
import { Web3Provider } from './hooks/useWeb3';
import { WebSocketProvider } from './contexts/WebSocketContext';
import AppRoutes from './helpers/AppRoutes';

function ErrorFallback({ error, resetErrorBoundary }) {
  return (
    <div className='flex flex-col items-center justify-center min-h-screen bg-gray-50 font-body'>
      <h1 className='text-display-sm font-semibold mb-4 text-gray-900'>Oops! Something went wrong.</h1>
      <p className='text-lg mb-8 text-gray-600'>
        We're sorry for the inconvenience. Please try again.
      </p>
      <pre className='mb-8 p-4 bg-gray-100 rounded-md text-sm text-gray-800'>{error.message}</pre>
      <button
        onClick={resetErrorBoundary}
        className='px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium'
      >
        Try again
      </button>
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => {
        // Reset the state of your app so the error doesn't happen again
      }}
    >
      <Web3Provider>
        <WebSocketProvider>
          <AuthProvider>
            <Router>
              <div className='App min-h-screen bg-gray-50 font-body'>
                <main>
                  <AppRoutes />
                </main>
                <Toaster
                position="bottom-left"
                toastOptions={{
                  duration: 4500,
                  className: 'glass-toast',
                  style: {
                    background: 'rgba(10, 10, 14, 0.82)',
                    color: '#f7f7f5',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    backdropFilter: 'blur(22px)',
                    borderRadius: '16px'
                  },
                  success: {
                    duration: 4500,
                    className: 'glass-toast glass-toast--success',
                    iconTheme: {
                      primary: '#FFE600',
                      secondary: '#121212',
                    },
                  },
                  error: {
                    duration: 5200,
                    className: 'glass-toast glass-toast--error',
                    iconTheme: {
                      primary: '#FF4C4C',
                      secondary: '#121212',
                    },
                  },
                }}
                />
              </div>
            </Router>
          </AuthProvider>
        </WebSocketProvider>
      </Web3Provider>
    </ErrorBoundary>
  );
}

export default App;
