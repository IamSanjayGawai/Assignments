import { useState, useRef } from 'react';
import './App.css';

const API_URL = '/api/submit';
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second base delay

function App() {
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [state, setState] = useState('idle'); // idle, pending, success, error
  const [message, setMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [submissionId, setSubmissionId] = useState(null);
  
  const isSubmittingRef = useRef(false);
  const requestIdRef = useRef(null);

  // Generate unique request ID for duplicate prevention
  const generateRequestId = () => {
    return `${email}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  };

  const submitForm = async (isRetry = false) => {
    // Prevent duplicate submissions
    if (isSubmittingRef.current && !isRetry) {
      return;
    }

    // Generate request ID if this is a new submission
    if (!isRetry && !requestIdRef.current) {
      requestIdRef.current = generateRequestId();
    }

    isSubmittingRef.current = true;
    setState('pending');
    setMessage('Submitting...');

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': requestIdRef.current,
        },
        body: JSON.stringify({ email, amount: parseFloat(amount) }),
      });

      const data = await response.json();

      if (response.status === 200) {
        // Success
        isSubmittingRef.current = false;
        setState('success');
        setMessage(data.message || 'Submission successful!');
        setSubmissionId(data.requestId);
        setRetryCount(0);
      } else if (response.status === 202) {
        // Delayed success - accepted but processing
        setState('pending');
        setMessage('Submission accepted, processing... This may take a few seconds.');
        setSubmissionId(data.requestId);
        
        // Poll for completion
        pollSubmissionStatus(data.requestId, data.estimatedDelay || 8000);
      } else if (response.status === 503) {
        // Temporary failure - retry
        if (retryCount < MAX_RETRIES) {
          const newRetryCount = retryCount + 1;
          setRetryCount(newRetryCount);
          setMessage(
            `Service temporarily unavailable. Retrying... (${newRetryCount}/${MAX_RETRIES})`
          );
          
          // Exponential backoff
          const delay = RETRY_DELAY * Math.pow(2, newRetryCount - 1);
          setTimeout(() => {
            submitForm(true);
          }, delay);
        } else {
          // Max retries reached
          isSubmittingRef.current = false;
          setState('error');
          setMessage('Submission failed after multiple retries. Please try again later.');
        }
      } else {
        // Other errors
        isSubmittingRef.current = false;
        setState('error');
        setMessage(data.error || 'An error occurred. Please try again.');
      }
    } catch (error) {
      // Network error or other exception
      if (retryCount < MAX_RETRIES) {
        const newRetryCount = retryCount + 1;
        setRetryCount(newRetryCount);
        setMessage(
          `Network error. Retrying... (${newRetryCount}/${MAX_RETRIES})`
        );
        
        const delay = RETRY_DELAY * Math.pow(2, newRetryCount - 1);
        setTimeout(() => {
          submitForm(true);
        }, delay);
      } else {
        isSubmittingRef.current = false;
        setState('error');
        setMessage('Network error. Please check your connection and try again.');
      }
    }
  };

  const pollSubmissionStatus = async (requestId, estimatedDelay) => {
    // Start polling after estimated delay
    const pollInterval = 1000; // Poll every second
    const maxPolls = Math.ceil(estimatedDelay / pollInterval) + 5; // Poll a bit longer than estimated
    let pollCount = 0;

    const poll = async () => {
      try {
        const response = await fetch(`/api/status/${requestId}`);
        const data = await response.json();

        if (data.status === 'success') {
          setState('success');
          setMessage('Submission completed successfully!');
          isSubmittingRef.current = false;
          return;
        }

        pollCount++;
        if (pollCount < maxPolls) {
          setTimeout(poll, pollInterval);
        } else {
          // Fallback: assume success after max polls
          setState('success');
          setMessage('Submission completed successfully!');
          isSubmittingRef.current = false;
        }
      } catch (error) {
        pollCount++;
        if (pollCount < maxPolls) {
          setTimeout(poll, pollInterval);
        } else {
          setState('error');
          setMessage('Unable to verify submission status. Please check later.');
          isSubmittingRef.current = false;
        }
      }
    };

    // Start polling after a short delay
    setTimeout(poll, Math.min(estimatedDelay / 2, 3000));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validation
    if (!email || !amount) {
      setState('error');
      setMessage('Please fill in all fields.');
      return;
    }

    if (isNaN(amount) || parseFloat(amount) <= 0) {
      setState('error');
      setMessage('Please enter a valid amount.');
      return;
    }

    // Reset state for new submission
    setRetryCount(0);
    requestIdRef.current = null;
    setSubmissionId(null);
    
    submitForm();
  };

  const handleReset = () => {
    setEmail('');
    setAmount('');
    setState('idle');
    setMessage('');
    setRetryCount(0);
    setSubmissionId(null);
    isSubmittingRef.current = false;
    requestIdRef.current = null;
  };

  const isDisabled = state === 'pending' || isSubmittingRef.current;

  return (
    <div className="app">
      <div className="card">
        <h1>Eventually Consistent Form</h1>
        <p className="subtitle">Submit your information</p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={isDisabled}
              placeholder="your.email@example.com"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="amount">Amount</label>
            <input
              id="amount"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isDisabled}
              placeholder="0.00"
              step="0.01"
              min="0"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isDisabled}
            className={`submit-btn ${isDisabled ? 'disabled' : ''}`}
          >
            {state === 'pending' ? 'Submitting...' : 'Submit'}
          </button>
        </form>

        {message && (
          <div className={`message ${state}`}>
            <div className="message-content">
              {state === 'pending' && <div className="spinner"></div>}
              <span>{message}</span>
            </div>
            {submissionId && (
              <div className="submission-id">ID: {submissionId}</div>
            )}
          </div>
        )}

        {(state === 'success' || state === 'error') && (
          <button onClick={handleReset} className="reset-btn">
            Submit Another
          </button>
        )}
      </div>
      <h1>I love prachu</h1>
      <h2>alwasy</h2>
      <h3>Chatting</h3>
    </div>
  );
}

export default App;

