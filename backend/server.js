import express from 'express';
import cors from 'cors';

const app = express();
const PORT = 3001;

app.use(cors());
app.use(express.json());

// In-memory store to prevent duplicates
const submissions = new Map();

// Helper function to generate random response type
function getRandomResponseType() {
  const rand = Math.random();
  if (rand < 0.33) {
    return 'success'; // 33% chance
  } else if (rand < 0.66) {
    return 'temporary_failure'; // 33% chance
  } else {
    return 'delayed_success'; // 34% chance
  }
}

// Helper function to generate random delay between 5-10 seconds
function getRandomDelay() {
  return Math.floor(Math.random() * 5000) + 5000; // 5000-10000ms
}

// Mock API endpoint
app.post('/api/submit', async (req, res) => {
  const { email, amount } = req.body;
  const requestId = req.headers['x-request-id'] || req.headers['X-Request-ID'] || `${email}-${Date.now()}`;

  // Validate input
  if (!email || !amount) {
    return res.status(400).json({ error: 'Email and amount are required' });
  }

  // Check for duplicate submission
  if (submissions.has(requestId)) {
    const existing = submissions.get(requestId);
    if (existing.status === 'success') {
      return res.status(200).json({
        message: 'Submission already processed',
        requestId,
        email,
        amount,
        timestamp: existing.timestamp
      });
    }
  }

  const responseType = getRandomResponseType();

  // Store submission attempt
  submissions.set(requestId, {
    email,
    amount,
    status: 'pending',
    timestamp: new Date().toISOString()
  });

  switch (responseType) {
    case 'success':
      submissions.set(requestId, {
        email,
        amount,
        status: 'success',
        timestamp: new Date().toISOString()
      });
      return res.status(200).json({
        message: 'Submission successful',
        requestId,
        email,
        amount,
        timestamp: new Date().toISOString()
      });

    case 'temporary_failure':
      return res.status(503).json({
        error: 'Service temporarily unavailable',
        requestId,
        retryAfter: 1 // seconds
      });

    case 'delayed_success':
      const delay = getRandomDelay();
      setTimeout(() => {
        submissions.set(requestId, {
          email,
          amount,
          status: 'success',
          timestamp: new Date().toISOString()
        });
      }, delay);
      
      // Return immediately but mark as delayed
      return res.status(202).json({
        message: 'Submission accepted, processing...',
        requestId,
        email,
        amount,
        estimatedDelay: delay
      });
  }
});

// Status check endpoint for delayed submissions
app.get('/api/status/:requestId', (req, res) => {
  const { requestId } = req.params;
  const submission = submissions.get(requestId);
  
  if (!submission) {
    return res.status(404).json({ error: 'Submission not found' });
  }
  
  res.status(200).json({
    requestId,
    status: submission.status,
    email: submission.email,
    amount: submission.amount,
    timestamp: submission.timestamp
  });
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.listen(PORT, () => {
  console.log(`Mock API server running on http://localhost:${PORT}`);
});

