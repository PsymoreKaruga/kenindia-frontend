const [status, setStatus] = useState(null);
const [timeLeft, setTimeLeft] = useState(60);

useEffect(() => {
  if (!calculationId) return;

  const interval = setInterval(() => {
    fetch(`/api/calculate/status/${calculationId}/`)
      .then(r => r.json())
      .then(data => {
        setStatus(data);

        if (data.expired) {
          clearInterval(interval);
          setTimeLeft(0);
        } else if (!data.paid) {
          setTimeLeft(prev => Math.max(0, prev - 1));
        }
      });
  }, 1000);

  return () => clearInterval(interval);
}, [calculationId]);

// UI
{status?.expired ? (
  <div className="error">
    <p>Retry — you delayed paying.</p>
    <button onClick={retryPayment}>Try Again</button>
  </div>
) : status?.paid ? (
  <div>Paid! Downloading...</div>
) : (
  <div>
    <p>Pay KES 5.00 now</p>
    <p>Time left: <strong>{timeLeft}s</strong></p>
  </div>
)}