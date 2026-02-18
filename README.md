# Eventually Consistent Form

A web application demonstrating eventually consistent form submission with automatic retry logic, duplicate prevention, and clear state management.

## Overview

This application consists of a React 19 frontend and a Node.js backend that simulates an eventually consistent API. The form collects an email and amount, and handles various API response scenarios including immediate success, temporary failures, and delayed responses.

## Project Structure

```
.
├── backend/          # Node.js Express API server
│   ├── server.js    # Mock API with random response simulation
│   └── package.json
├── frontend/        # React 19 application
│   ├── src/
│   │   ├── App.jsx  # Main form component with state management
│   │   ├── App.css  # Styling
│   │   ├── main.jsx # Entry point
│   │   └── index.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── README.md
```

## Features

- ✅ Immediate "pending" state on form submission
- ✅ Random API responses: success (200), temporary failure (503), delayed success (5-10s)
- ✅ Automatic retry logic for temporary failures
- ✅ Duplicate submission prevention
- ✅ Clear UI state reflection
- ✅ No duplicate records guarantee

## Installation

### Backend

```bash
cd backend
npm install
npm start
```

The backend server will run on `http://localhost:3001`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The frontend will run on `http://localhost:3000`

## State Transitions

The application manages the following states:

### 1. **Idle State**
- Initial state when the form is ready for input
- Form fields are enabled
- Submit button is active

### 2. **Pending State**
- Triggered immediately upon form submission
- Form fields and submit button are disabled
- Visual indicator (spinner) shows processing
- Message: "Submitting..." or "Submission accepted, processing..."

**Transitions from Pending:**
- → **Success**: API returns 200 or delayed submission completes
- → **Error**: Max retries exceeded or non-retryable error
- → **Pending** (retry): Temporary failure (503) triggers retry

### 3. **Success State**
- Submission completed successfully
- Green success message displayed
- Submission ID shown
- "Submit Another" button appears

**Transitions from Success:**
- → **Idle**: User clicks "Submit Another" button

### 4. **Error State**
- Submission failed after all retry attempts
- Red error message displayed
- Form can be reset

**Transitions from Error:**
- → **Idle**: User clicks "Submit Another" button

### State Transition Diagram

```
[Idle] 
  ↓ (submit)
[Pending]
  ↓ (200)          ↓ (503, retries < max)    ↓ (503, retries >= max)
[Success]         [Pending (retry)]          [Error]
  ↓ (reset)                                    ↓ (reset)
[Idle]                                         [Idle]
```

## Retry Logic

### Retry Conditions

The application automatically retries submissions when:
1. API returns HTTP 503 (Service Temporarily Unavailable)
2. Network errors occur (fetch exceptions)

### Retry Strategy

- **Maximum Retries**: 3 attempts
- **Retry Delay**: Exponential backoff
  - 1st retry: 1 second delay
  - 2nd retry: 2 seconds delay
  - 3rd retry: 4 seconds delay
- **Formula**: `delay = BASE_DELAY * 2^(retryCount - 1)`

### Retry Flow

1. Initial submission fails with 503
2. UI shows retry message: "Retrying... (1/3)"
3. Wait for exponential backoff delay
4. Retry submission with same request ID
5. If fails again, increment retry count and repeat
6. After 3 failed retries, transition to error state

### Implementation Details

```javascript
// Retry logic in App.jsx
if (response.status === 503) {
  if (retryCount < MAX_RETRIES) {
    const newRetryCount = retryCount + 1;
    const delay = RETRY_DELAY * Math.pow(2, newRetryCount - 1);
    setTimeout(() => {
      submitForm(true); // Retry with same request ID
    }, delay);
  } else {
    // Max retries exceeded
    setState('error');
  }
}
```

## Duplicate Prevention

### Mechanisms

The application prevents duplicate submissions through multiple layers:

#### 1. **Client-Side Prevention**

- **Submission Flag**: `isSubmittingRef` tracks if a submission is in progress
- **Button Disabling**: Submit button is disabled during pending state
- **Form Field Disabling**: Input fields are disabled during submission
- **Request ID**: Unique request ID generated per submission attempt

```javascript
// Prevent duplicate submissions
if (isSubmittingRef.current && !isRetry) {
  return; // Exit early if already submitting
}
```

#### 2. **Server-Side Prevention**

- **Request ID Tracking**: Server stores submissions by request ID
- **Idempotency Check**: Server checks if request ID already exists
- **Status Verification**: If submission already succeeded, returns success without processing

```javascript
// Server-side duplicate check
if (submissions.has(requestId)) {
  const existing = submissions.get(requestId);
  if (existing.status === 'success') {
    return res.status(200).json({
      message: 'Submission already processed',
      requestId,
      // ... existing data
    });
  }
}
```

#### 3. **Request ID Generation**

Each submission generates a unique request ID:
- Format: `{email}-{timestamp}-{randomString}`
- Sent in `X-Request-ID` header
- Used for idempotency on server
- Persists across retry attempts

### Duplicate Prevention Flow

```
User clicks Submit
  ↓
Generate Request ID
  ↓
Check isSubmittingRef (client-side)
  ↓ (if false)
Set isSubmittingRef = true
  ↓
Send request with X-Request-ID header
  ↓
Server checks request ID in submissions map
  ↓ (if exists and status = success)
Return existing submission (no duplicate)
  ↓ (if new or pending)
Process submission
  ↓
Store with request ID
```

### Guarantees

- ✅ **No duplicate records**: Server-side idempotency ensures same request ID = same result
- ✅ **No duplicate UI actions**: Client-side flag prevents multiple simultaneous submissions
- ✅ **Retry safety**: Same request ID used for retries, ensuring idempotent retry behavior

## API Endpoints

### POST `/api/submit`

Submit form data.

**Request:**
```json
{
  "email": "user@example.com",
  "amount": 100.50
}
```

**Headers:**
```
X-Request-ID: {unique-request-id}
```

**Responses:**

1. **200 OK** - Immediate success
```json
{
  "message": "Submission successful",
  "requestId": "...",
  "email": "user@example.com",
  "amount": 100.50,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

2. **202 Accepted** - Delayed success (processing)
```json
{
  "message": "Submission accepted, processing...",
  "requestId": "...",
  "email": "user@example.com",
  "amount": 100.50,
  "estimatedDelay": 7500
}
```

3. **503 Service Unavailable** - Temporary failure
```json
{
  "error": "Service temporarily unavailable",
  "requestId": "...",
  "retryAfter": 1
}
```

### GET `/api/status/:requestId`

Check status of a delayed submission.

**Response:**
```json
{
  "requestId": "...",
  "status": "success",
  "email": "user@example.com",
  "amount": 100.50,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

## Testing the Application

### Testing Scenarios

1. **Immediate Success**: Submit form - should see success message immediately
2. **Temporary Failure**: Submit form multiple times until you get a 503 - should see automatic retries
3. **Delayed Success**: Submit form - if you get a 202 response, wait 5-10 seconds for completion
4. **Duplicate Prevention**: Try clicking submit multiple times quickly - only one submission should process

### Manual Testing

1. Start backend: `cd backend && npm start`
2. Start frontend: `cd frontend && npm run dev`
3. Open browser to `http://localhost:3000`
4. Fill in email and amount
5. Click Submit and observe behavior

## Technical Decisions

### Why Exponential Backoff?

- Reduces server load during outages
- Gives server time to recover
- Industry standard for retry strategies

### Why Request ID?

- Enables idempotent operations
- Prevents duplicate processing
- Allows status checking for delayed operations

### Why Client + Server Prevention?

- Client-side: Better UX (immediate feedback)
- Server-side: Guaranteed correctness (handles race conditions, network issues)

## Future Enhancements

- WebSocket support for real-time status updates
- Polling mechanism for delayed submissions
- Request queue visualization
- Retry attempt history display
- Configurable retry limits

## License

ISC

