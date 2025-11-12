// frontend/src/Calculator.jsx
import React, { useState, useRef, useEffect } from "react";
import axios from "axios";
import generateQuotationPDF from "./pdfGenerator";

export default function Calculator() {
  const initialForm = {
    product: "",
    customerName: "",
    dob: "",
    childDob: "",
    term: "",
    termMode: "manual",
    paymentMode: "yearly",
    sumAssured: "",
    premium: "",
    gender: "male",
    smoker: "non-smoker",
    dabIncluded: true,
    phone: "",
  };

  const [mode, setMode] = useState("premium");
  const [formData, setFormData] = useState(initialForm);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showBenefits, setShowBenefits] = useState(false);
  const [mpesaLoading, setMpesaLoading] = useState(false);
  const [mpesaMessage, setMpesaMessage] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [calculationId, setCalculationId] = useState(null);
  const [amountDue, setAmountDue] = useState(null);
  const [downloadedResult, setDownloadedResult] = useState(null);
  const [checkingPayment, setCheckingPayment] = useState(false);
  const [status, setStatus] = useState(null);
  const [timeLeft, setTimeLeft] = useState(60);


  // --- Age calculation helper ---
  const getAgeNextBirthday = (dob) => {
    if (!dob) return { actualAge: null, ageNextBirthday: null };
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const hasHadBirthday =
      today.getMonth() > birthDate.getMonth() ||
      (today.getMonth() === birthDate.getMonth() &&
        today.getDate() >= birthDate.getDate());
    if (!hasHadBirthday) age -= 1;
    return { actualAge: age, ageNextBirthday: age + 1 };
  };

  // --- Input handler with product-specific logic ---
  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === "checkbox" ? checked : value;

    setFormData((prev) => {
      let updated = { ...prev, [name]: newValue };

      // If selecting 15-Year Money Back Plan → auto-lock term to 15 and force manual mode
      if (name === "product") {
        if (newValue === "money_back_15") {
          updated.termMode = "manual";
          updated.term = "15";
        } else {
          // If switching away from money_back_15, clear the locked term so user can edit normally
          if (prev.product === "money_back_15") {
            updated.term = "";
            updated.termMode = "manual"; // keep manual default
          }
        }
      }

      // If DOB changes while product is 15-Year Money Back → check age and set an inline error
      if (name === "dob") {
        if (prev.product === "money_back_15") {
          const { actualAge } = getAgeNextBirthday(newValue);
          if (actualAge !== null && (actualAge < 18 || actualAge > 45)) {
            // set an error but don't block typing
            setError(
              "For the 15-Year Money Back Plan, the parent's age must be between 18 and 45 years."
            );
          } else {
            setError(null);
          }
        }
      }

      return updated;
    });
  };

  // --- Mode toggle ---
  const toggleMode = (newMode) => {
    setMode(newMode);
    setFormData((prev) => ({ ...prev, sumAssured: "", premium: "" }));
    setResult(null);
    setError(null);
    setShowBenefits(false);
    setMpesaMessage("");
  };

  // --- Reset ---
  const handleReset = () => {
    setFormData(initialForm);
    setResult(null);
    setError(null);
    setShowBenefits(false);
    setMode("premium");
    setMpesaMessage("");
    setPhoneError("");
  };

  // --- Submit handler ---
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setResult(null);
    setLoading(true);
    setShowBenefits(false);
    setMpesaMessage("");

    // Basic presence validation
    if (!formData.product || !formData.dob) {
      setError("Please select a product and enter Date of Birth.");
      setLoading(false);
      return;
    }

    // Compute ages
    const { actualAge, ageNextBirthday } = getAgeNextBirthday(formData.dob);

    // Critical: Age restriction for 15-Year Money Back Plan
    if (formData.product === "money_back_15") {
      if (actualAge === null || actualAge < 18 || actualAge > 45) {
        setError(
          "For the 15-Year Money Back Plan, the parent's age must be between 18 and 45 years."
        );
        setLoading(false);
        return;
      }
    }



    


    // Determine term
    let term;
    if (formData.termMode === "auto") {
      if (!formData.childDob) {
        setError("Please enter the Child's Date of Birth for auto term calculation.");
        setLoading(false);
        return;
      }
      const { actualAge: childAge } = getAgeNextBirthday(formData.childDob);
      if (childAge === null) {
        setError("Invalid Child's Date of Birth.");
        setLoading(false);
        return;
      }
      term = 18 - childAge;
      if (term <= 0) {
        setError("The child is already above 18 years. Please use manual term mode.");
        setLoading(false);
        return;
      }
      if (term < 10 || term > 20) {
        setError(`Calculated term (${term}) is out of range (10-20 years).`);
        setLoading(false);
        return;
      }
    } else {
      if (!formData.term) {
        setError("Please enter the Policy Term.");
        setLoading(false);
        return;
      }
      term = parseInt(formData.term, 10);
      if (isNaN(term) || term < 10 || term > 20) {
        setError("Policy Term must be between 10 and 20 years.");
        setLoading(false);
        return;
      }
    }

    // Force term to 15 if product is 15-Year Money Back
    if (formData.product === "money_back_15") {
      term = 15;
    }
     if (formData.product === "money_back_10") {
      term = 10;
    }
    

    // Check amount inputs
    if (mode === "premium" && !formData.sumAssured) {
      setError("Please enter the Sum Assured amount.");
      setLoading(false);
      return;
    }
    if (mode === "sumAssured" && !formData.premium) {
      setError("Please enter the Premium amount.");
      setLoading(false);
      return;
    }

    // Prepare payload
    const payload = {
      ...formData,
      actualAge,
      ageNextBirthday,
      term,
      mode: formData.paymentMode,
    };

    try {
      const url =
        mode === "premium"
          ? "http://127.0.0.1:8000/api/calculate/premium/"
          : "http://127.0.0.1:8000/api/calculate/sum-assured/";

      const response = await axios.post(url, payload, {
        headers: { "Content-Type": "application/json" },
      });

      if (response.status >= 200 && response.status < 300) {
        // Backend now saves the calculation and requires payment before returning the results.
        const data = response.data || {};
        if (data.calculation_id) {
          setCalculationId(data.calculation_id);
          setAmountDue(data.amount_due || null);
          setMpesaMessage("Calculation saved. Please pay to download results.");
        } else if (data.results) {
          // fallback (older behavior)
          setResult(data.results);
        }
      } else {
        setError(response.data.error || "Invalid input or calculation error.");
      }
    } catch (err) {
      console.error("Backend error:", err);
      if (err.response && err.response.data) {
        setError(err.response.data.error || "Invalid input sent to backend.");
      } else if (err.message && err.message.includes("Network")) {
        setError("Cannot connect to backend. Make sure Django server is running.");
      } else {
        setError("An unexpected error occurred. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

    // --- M-Pesa STK Push (improved: single poll instance, backoff, abort support) ---
    const paymentAbortRef = useRef(null);
    const pollingRef = useRef(false);
    const POLL_SESSION_KEY = "mpesa_polling_active";

    const handleMpesaPayment = async () => {
      if (!formData.phone || phoneError) {
        setMpesaMessage("Please enter a valid phone number (2547XXXXXXXX).");
        return;
      }

      if (!calculationId) {
        setMpesaMessage("No calculation found to pay for. Please run a calculation first.");
        return;
      }

      if (mpesaLoading || checkingPayment || pollingRef.current) {
        // already in-flight
        return;
      }

      setMpesaLoading(true);
      setMpesaMessage("");

      try {
        const payload = {
          phone_number: formData.phone,
          amount: amountDue || formData.sumAssured || formData.premium || 1,
          product: formData.product,
          calculation_id: calculationId,
        };

        // Use relative path; backend is expected under /api/
          const response = await axios.post(`http://127.0.0.1:8000/api/mpesa/stkpush/`, payload, {
          headers: { "Content-Type": "application/json" },
        });

        if (response.status >= 200 && response.status < 300) {
          setMpesaMessage("STK Push requested. Please confirm on your phone.");
          // start polling
          setCheckingPayment(true);
          await pollPaymentStatus(calculationId);
        } else {
          setMpesaMessage(response.data?.error || "Failed to initiate payment.");
        }
      } catch (err) {
        console.error("M-Pesa error:", err);
        setMpesaMessage(err?.response?.data?.error || "Network or server error. Please try again.");
      } finally {
        setMpesaLoading(false);
      }
    };

    const pollPaymentStatus = async (calcId) => {
      // prevent multiple pollers (across tabs/windows) for same calc
      const sessionKey = `${POLL_SESSION_KEY}_${calcId}`;
      if (sessionStorage.getItem(sessionKey) || pollingRef.current) {
        setMpesaMessage("Payment status is already being checked in another tab/window. Please wait.");
        return;
      }

      sessionStorage.setItem(sessionKey, "1");
      pollingRef.current = true;
      paymentAbortRef.current = new AbortController();

      const maxAttempts = 40;
      const baseDelay = 2000; // start 2s
      let attempts = 0;

      const delayForAttempt = (n) => Math.min(20000, Math.round(baseDelay * Math.pow(1.5, n)));

      try {
        while (attempts < maxAttempts) {
          attempts += 1;
          try {
            // check calculation paid flag (primary source)
            const res = await fetch(`http://127.0.0.1:8000/api/calculate/status/${calcId}/`, { signal: paymentAbortRef.current.signal });
            if (res.ok) {
              const json = await res.json();
              if (json && json.paid) {
                // download result
                const dl = await axios.get(`http://127.0.0.1:8000/api/calculate/download/${calcId}/`);
                if (dl.status >= 200 && dl.status < 300) {
                  setDownloadedResult(dl.data);
                  setMpesaMessage("Payment confirmed — results are ready.");
                } else {
                  setMpesaMessage("Payment confirmed but failed to download results.");
                }
                setCheckingPayment(false);
                pollingRef.current = false;
                sessionStorage.removeItem(sessionKey);
                return;
              }
            }
          } catch (err) {
            if (err.name === "AbortError") {
              // aborted externally
              break;
            }
            // otherwise ignore and retry with backoff
            console.warn("Payment poll attempt failed:", err);
          }

          // not paid yet, wait with backoff
          const delay = Math.round(delayForAttempt(attempts) * (0.9 + Math.random() * 0.2));
          setMpesaMessage(`Waiting for confirmation... (attempt ${attempts})`);
          await new Promise((res) => setTimeout(res, delay));
        }

        setMpesaMessage("Timed out waiting for payment confirmation. Please try again or contact support.");
        setCheckingPayment(false);
        pollingRef.current = false;
        sessionStorage.removeItem(sessionKey);
      } finally {
        if (paymentAbortRef.current) {
          try { paymentAbortRef.current.abort(); } catch (e) {}
          paymentAbortRef.current = null;
        }
        pollingRef.current = false;
        sessionStorage.removeItem(sessionKey);
      }
    };

  const downloadJsonFile = (data) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calculation_${data.calculation_id || "result"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Download official server-generated PDF
  const downloadOfficialPdf = async () => {
    const calcId = calculationId || (downloadedResult && downloadedResult.calculation_id);
    if (!calcId) {
      setMpesaMessage("No calculation ID available for PDF generation.");
      return;
    }

    setMpesaMessage("Preparing official PDF...");
    try {
      const payload = { calculation_id: calcId, customerName: formData.customerName };
      const res = await axios.post("http://127.0.0.1:8000/api/generate-pdf/", payload, {
        responseType: "blob",
        headers: { "Content-Type": "application/json" },
      });

      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `kenindia_quotation_${calcId}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setMpesaMessage("Official PDF downloaded.");
    } catch (err) {
      console.error("Failed to download official PDF:", err);
      setMpesaMessage("Failed to download official PDF. See console for details.");
    }
  };

  // Retry helper when a payment session expires or the user wants to try again
  const retryPayment = () => {
    setMpesaMessage("");
    setCalculationId(null);
    setDownloadedResult(null);
    setStatus(null);
    setTimeLeft(60);
    setCheckingPayment(false);
  };

  // Fetch downloadable result when paid (manual trigger)
  const fetchDownloadResult = async (calcId) => {
    try {
      setMpesaMessage("Downloading results...");
      const dl = await axios.get(`http://127.0.0.1:8000/api/calculate/download/${calcId}/`);
      if (dl.status >= 200 && dl.status < 300) {
        setDownloadedResult(dl.data);
        setMpesaMessage("Results ready.");
      } else {
        setMpesaMessage("Failed to download results.");
      }
    } catch (err) {
      console.error("Download error:", err);
      setMpesaMessage("Failed to download results. See console.");
    }
  };

  // UI polling: update status and countdown while a calculation is awaiting payment
  useEffect(() => {
    if (!calculationId) {
      setStatus(null);
      setTimeLeft(60);
      return;
    }

    let mounted = true;
    setTimeLeft(60);
    setStatus(null);

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/calculate/status/${calculationId}/`);
        if (!mounted) return;
        if (res.ok) {
          const json = await res.json();
          setStatus(json);
          if (json.expired) {
            setTimeLeft(0);
            clearInterval(interval);
            return;
          }
          if (json.paid) {
            setTimeLeft(0);
            clearInterval(interval);
            return;
          }
        }
      } catch (e) {
        // ignore network blips
        console.warn("Status poll failed:", e);
      }

      setTimeLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [calculationId]);














  // --- Helpers for display ---
  const formatKey = (key) =>
    key.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const formatValue = (v) =>
    v === null || v === undefined
      ? "-"
      : typeof v === "number"
      ? v.toLocaleString()
      : !isNaN(Number(v))
      ? Number(v).toLocaleString()
      : String(v);

  const toggleBenefits = () => setShowBenefits((s) => !s);

  // --- Component JSX ---
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center p-6">
      <div className="max-w-2xl w-full bg-white shadow-lg rounded-2xl p-6">
        <h1 className="text-2xl font-bold text-blue-800 mb-4 text-center">
          Kenindia Premiums Calculator
        </h1>

        {/* Mode Toggle */}
        <div className="flex justify-center mb-6 space-x-4">
          <button
            type="button"
            onClick={() => toggleMode("premium")}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              mode === "premium"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Calculate Premium
          </button>
          <button
            type="button"
            onClick={() => toggleMode("sumAssured")}
            className={`px-4 py-2 rounded-lg font-medium transition ${
              mode === "sumAssured"
                ? "bg-blue-600 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            Calculate Sum Assured
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Product */}
          <div>
            <label className="block text-gray-700 font-medium mb-1">Product</label>
            <select
              name="product"
              value={formData.product}
              onChange={handleChange}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="">-- Select Product --</option>
              <option value="education_endowment">Education Endowment Plan</option>
              <option value="academic_advantage">Academic Advantage Plan</option>
              <option value="money_back_15">15-Year Money Back Plan</option>
              <option value="money_back_10">10-Year Money Back Plan</option>
              <option value="multiple_advantage">Multiple Advantage Plan</option>
            </select>
          </div>

          {/* Parent DOB */}
          <div>
            <label className="block text-gray-700 font-medium mb-1">
              Parent's Date of Birth
            </label>
            <input
              type="date"
              name="dob"
              value={formData.dob}
              onChange={handleChange}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Customer Name (for PDF) */}
          <div>
            <label className="block text-gray-700 font-medium mb-1">Customer Name</label>
            <input
              type="text"
              name="customerName"
              value={formData.customerName}
              onChange={handleChange}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
              placeholder="Full name for quotation"
            />
          </div>





         {/* Phone Number */}
          <div>
            <label className="block text-gray-700 font-medium mb-1">Phone Number</label>
            <input
              type="text"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
              placeholder="2547XXXXXXXX"
              required
            />
            {phoneError && <p className="text-red-600 text-sm mt-1">{phoneError}</p>}
          </div>







          {/* Gender */}
          <div>
            <label className="block text-gray-700 font-medium mb-1">Gender</label>
            <select
              name="gender"
              value={formData.gender}
              onChange={handleChange}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>

          {/* Smoker */}
          <div>
            <label className="block text-gray-700 font-medium mb-1">Smoker Status</label>
            <select
              name="smoker"
              value={formData.smoker}
              onChange={handleChange}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
              required
            >
              <option value="smoker">Smoker</option>
              <option value="non-smoker">Non-Smoker</option>
            </select>
          </div>

          {/* Term Calculation Mode */}
          <div>
            <label className="block text-gray-700 font-medium mb-1">
              Term Calculation
            </label>
            <select
              name="termMode"
              value={formData.termMode}
              onChange={handleChange}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
            >
              <option value="manual">Manual Input</option>
              <option value="auto">Auto (Based on Child's Age)</option>
            </select>
          </div>

          {/* Child DOB (auto) */}
          {formData.termMode === "auto" && (
            <div>
              <label className="block text-gray-700 font-medium mb-1">
                Child's Date of Birth
              </label>
              <input
                type="date"
                name="childDob"
                value={formData.childDob}
                onChange={handleChange}
                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
          )}

          {/* Policy Term (manual) */}
          {formData.termMode === "manual" && (
            <div>
              <label className="block text-gray-700 font-medium mb-1">
                Policy Term (Years)
              </label>
              <input
                type="number"
                name="term"
                value={formData.term}
                onChange={handleChange}
                className={`w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500 ${
                  formData.product === "money_back_15" ? "bg-gray-100 cursor-not-allowed" : ""
                }`}
                min="10"
                max="20"
                required
                readOnly={formData.product === "money_back_15"}
              />
              {formData.product === "money_back_15" && (
                <p className="text-sm text-gray-500 mt-1">(Term is fixed at 15 years for this plan)</p>
              )}
               

               {formData.product === "money_back_10" && (
                <p className="text-sm text-gray-500 mt-1">(Term is fixed at 10 years for this plan)</p>
              )}


            </div>
          )}

          {/* DAB */}
          <div className="flex items-center">
            <input
              type="checkbox"
              name="dabIncluded"
              checked={formData.dabIncluded}
              onChange={handleChange}
              className="mr-2"
            />
            <label className="text-gray-700 font-medium">Include Double Accident Benefit (DAB)</label>
          </div>

          {/* Payment Mode */}
          <div>
            <label className="block text-gray-700 font-medium mb-1">Mode of Payment</label>
            <select
              name="paymentMode"
              value={formData.paymentMode}
              onChange={handleChange}
              className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
            >
              <option value="yearly">Yearly</option>
              <option value="half-yearly">Half-Yearly</option>
              <option value="quarterly">Quarterly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          {/* Amount input */}
          {mode === "premium" ? (
            <div>
              <label className="block text-gray-700 font-medium mb-1">Sum Assured (KSh)</label>
              <input
                type="number"
                name="sumAssured"
                value={formData.sumAssured}
                onChange={handleChange}
                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                min="1"
                required
              />
            </div>
          ) : (
            <div>
              <label className="block text-gray-700 font-medium mb-1">Affordable Premium (KSh)</label>
              <input
                type="number"
                name="premium"
                value={formData.premium}
                onChange={handleChange}
                className="w-full border rounded-lg p-2 focus:ring-2 focus:ring-blue-500"
                min="1"
                required
              />
            </div>
          )}

          {/* Buttons */}
          <div className="flex space-x-3">
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-700 text-white py-2 rounded-lg font-semibold hover:bg-blue-800 transition"
            >
              {loading ? "Calculating..." : mode === "premium" ? "Calculate Premium" : "Calculate Sum Assured"}
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="flex-1 bg-gray-300 text-gray-800 py-2 rounded-lg font-semibold hover:bg-gray-400 transition"
            >
              Reset Form
            </button>
          </div>
        </form>

        {/* Error */}
        {error && <p className="text-red-600 text-center mt-4 font-medium">{error}</p>}

        {/* Payment prompt / Countdown (refreshed UI) */}
        {calculationId && (
          <div className="mt-4 p-4 bg-white border rounded-lg shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="p-2 rounded bg-blue-50 text-[#0b3b5a]">
                  {/* clock icon */}
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.5a.75.75 0 10-1.5 0v3.292l2.146 1.146a.75.75 0 10.708-1.292L10.75 9.792V6.5z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-[#0b3b5a]">Calculation saved</p>
                  <p className="text-xs text-gray-600">Amount due: KSh {amountDue ? Number(amountDue).toLocaleString() : "-"}</p>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                {status?.paid ? (
                  <span className="inline-flex items-center text-green-700 font-semibold">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M16.704 5.293a1 1 0 00-1.408-1.414L8 10.175 4.704 7.293A1 1 0 003.296 8.707l4 3.5a1 1 0 001.408 0l8-7z" clipRule="evenodd" />
                    </svg>
                    Paid
                  </span>
                ) : status?.expired ? (
                  <span className="inline-flex items-center text-red-600 font-semibold">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-1-9V6a1 1 0 112 0v3a1 1 0 01-.293.707L9 11.414a1 1 0 11-1.414-1.414L9 9.586V9z" clipRule="evenodd" />
                    </svg>
                    Expired
                  </span>
                ) : (
                  <div className="inline-flex items-center text-gray-700">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-1 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-11.5a.75.75 0 10-1.5 0v3.292l2.146 1.146a.75.75 0 10.708-1.292L10.75 9.792V6.5z" clipRule="evenodd" />
                    </svg>
                    <span className="font-medium">Time left:</span>
                    <span className="ml-2 font-semibold">{timeLeft}s</span>
                  </div>
                )}

                {status?.paid ? (
                  <button
                    type="button"
                    onClick={() => fetchDownloadResult(calculationId)}
                    className="bg-[#0b3b5a] text-white px-3 py-1 rounded-md hover:bg-[#092a43]"
                  >
                    Get Results
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleMpesaPayment}
                    disabled={mpesaLoading || checkingPayment}
                    className="bg-yellow-500 text-[#0b3b5a] px-3 py-1 rounded-md font-semibold hover:bg-yellow-600"
                  >
                    {mpesaLoading ? "Requesting..." : "Pay Now"}
                  </button>
                )}

                <button
                  type="button"
                  onClick={retryPayment}
                  className="bg-gray-100 text-gray-800 px-3 py-1 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
              </div>
            </div>
            {mpesaMessage && <p className="mt-3 text-sm text-gray-600">{mpesaMessage}</p>}
          </div>
        )}



       

        {/* Downloaded results after payment */}
        {downloadedResult && (
          <div className="mt-6 bg-blue-50 p-4 rounded-lg shadow-inner">
            <h2 className="text-lg font-semibold text-blue-700 mb-2">Your Results (Paid)</h2>
            <pre className="whitespace-pre-wrap text-sm mt-1 bg-white p-2 rounded border">
              {JSON.stringify(downloadedResult, null, 2)}
            </pre>
            <div className="mt-3 flex space-x-3">
              <button
                type="button"
                onClick={() => downloadJsonFile(downloadedResult)}
                className="bg-blue-700 text-white px-4 py-2 rounded-lg"
              >
                Download JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    generateQuotationPDF({
                      calculationId: downloadedResult.calculation_id,
                      customerName: formData.customerName,
                      product: downloadedResult.product,
                      input: downloadedResult.input,
                      results: downloadedResult.results,
                    });
                  } catch (e) {
                    console.error("PDF generation failed:", e);
                    setMpesaMessage("Failed to generate PDF. See console for details.");
                  }
                }}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg"
              >
                Generate PDF
              </button>
              <button
                type="button"
                onClick={downloadOfficialPdf}
                className="bg-yellow-600 text-white px-4 py-2 rounded-lg"
              >
                Download Official PDF
              </button>
            </div>
          </div>
        )}




        








        








                {calculationId && (
          <div className="mt-4 p-4 bg-yellow-50 rounded-lg text-center">
            <p className="text-gray-800 font-medium">Your calculation has been saved.</p>
            <p className="text-sm text-gray-600">Amount due: KSh {amountDue ? Number(amountDue).toLocaleString() : "-"}</p>
            <div className="mt-3 flex justify-center space-x-3">
              <button
                type="button"
                onClick={handleMpesaPayment}
                disabled={mpesaLoading || checkingPayment}
                className="bg-green-600 text-white px-4 py-2 rounded-lg"
              >
                {mpesaLoading ? "Requesting payment..." : "Pay to download results"}
              </button>
              <button
                type="button"
                onClick={() => { setCalculationId(null); setMpesaMessage(""); }}
                className="bg-gray-200 px-4 py-2 rounded-lg"
              >
                Cancel
              </button>
            </div>
            {mpesaMessage && <p className="mt-2 text-sm text-gray-700">{mpesaMessage}</p>}
          </div>
        )}

        {/* Downloaded results after payment */}
        {downloadedResult && (
          <div className="mt-6 bg-blue-50 p-4 rounded-lg shadow-inner">
            <h2 className="text-lg font-semibold text-blue-700 mb-2">Your Results (Paid)</h2>
            <pre className="whitespace-pre-wrap text-sm mt-1 bg-white p-2 rounded border">
              {JSON.stringify(downloadedResult, null, 2)}
            </pre>
            <div className="mt-3 flex space-x-3">
              <button
                type="button"
                onClick={() => downloadJsonFile(downloadedResult)}
                className="bg-blue-700 text-white px-4 py-2 rounded-lg"
              >
                Download JSON
              </button>
              <button
                type="button"
                onClick={() => {
                  try {
                    generateQuotationPDF({
                      calculationId: downloadedResult.calculation_id,
                      customerName: formData.customerName,
                      product: downloadedResult.product,
                      input: downloadedResult.input,
                      results: downloadedResult.results,
                    });
                  } catch (e) {
                    console.error("PDF generation failed:", e);
                    setMpesaMessage("Failed to generate PDF. See console for details.");
                  }
                }}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg"
              >
                Generate PDF
              </button>
              <button
                type="button"
                onClick={downloadOfficialPdf}
                className="bg-yellow-600 text-white px-4 py-2 rounded-lg"
              >
                Download Official PDF
              </button>
            </div>
          </div>
        )}















        {/* Results */}
        {result && (
          <div className="mt-6 bg-blue-50 p-4 rounded-lg shadow-inner">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-blue-700 mb-2">Results</h2>
              {result.benefits && (
                <button
                  type="button"
                  onClick={toggleBenefits}
                  className="text-sm bg-white border rounded px-3 py-1 hover:bg-gray-50"
                >
                  {showBenefits ? "Hide Benefits" : "View Benefits"}
                </button>
              )}
            </div>

            {/* Results entries except benefits */}
            {Object.entries(result).map(([key, value]) => {
              if (key === "benefits") return null;
              if (typeof value === "object" && value !== null) {
                return (
                  <div key={key} className="text-gray-800 mb-1">
                    <strong>{formatKey(key)}:</strong>
                    <pre className="whitespace-pre-wrap text-sm mt-1 bg-white p-2 rounded border">
                      {JSON.stringify(value, null, 2)}
                    </pre>
                  </div>
                );
              }
              return (
                <p key={key} className="text-gray-800">
                  <strong>{formatKey(key)}:</strong> {formatValue(value)}
                </p>
              );
            })}

            {/* Expandable Benefits */}
            {result?.benefits && showBenefits && (
              <div className="mt-4 bg-white border rounded-lg shadow-md overflow-hidden">
                <div className="p-4">
                  <h3 className="text-lg font-semibold mb-2 text-blue-800">
                    {formData.product === "education_endowment" && "Education Endowment Benefits"}
                    {formData.product === "academic_advantage" && "Academic Advantage Benefits"}
                    {formData.product === "money_back_15" && "15-Year Money Back Plan Benefits"}
                    {formData.product === "money_back_10" && "10-Year Money Back Plan Benefits"}
                    {formData.product === "multiple_advantage" && "Multiple Advantage Plan Benefits"}
                  </h3>

                  {/* Plan summaries */}
                  {formData.product === "education_endowment" && (
                    <p className="text-gray-700 mb-3">
                      <strong>Plan summary:</strong> The Education Endowment Plan names the child as beneficiary. It pays staged education benefits
                      at Grade 9–12 (each 15% of the Sum Assured) and a final maturity in the 1st year of university equal to 50% of Sum Assured
                      plus accrued bonus. The accrued bonus is <em>10% × Sum Assured × Policy Term</em>.
                    </p>
                  )}

                  {formData.product === "academic_advantage" && (
                    <p className="text-gray-700 mb-3">
                      <strong>Plan summary:</strong> The Academic Advantage Plan pays education benefits to the child (beneficiary) in the <em>last four years</em>
                      of the policy term as follows: 20%, 20%, 30%, 30% (final year includes accrued bonus). Accrued Bonus = 10% × SA × Term.
                      WP = 2% of Basic Premium. DAB = 0.1% of SA. Minimum SA = KES 100,000.
                    </p>
                  )}

                  {formData.product === "money_back_15" && (
                    <p className="text-gray-700 mb-3">
                      <strong>Plan summary:</strong> The 15-Year Money Back Plan gives regular cash returns while maintaining full life cover.
                      It pays 15% of the Sum Assured at the end of years <strong>3, 6, 9,</strong> and <strong>12</strong>, and pays
                      <strong>100% of the Sum Assured plus the accrued bonus</strong> at maturity (year 15). Accrued Bonus = 10% × SA × Term.
                      WP = 1% (or 2% depending on product rules — ensure backend matches). DAB = 0.1% of SA. Minimum SA = KES 50,000.
                    </p>
                  )}




                  
                 {formData.product === "money_back_10" && (
                    <p className="text-gray-700 mb-3">
                      <strong>Plan summary:</strong> The <em>10-Year Money Back Plan (“Kumi Bora With Profit”)</em> provides protection, savings, and regular cash returns. 
                      It pays <strong>10% of the Sum Assured</strong> at the end of years <strong>4, 6, and 8</strong>, and at maturity (year 10), pays 
                     <strong>100% of the Sum Assured + Accrued Bonus</strong> (total return: <strong>130% of SA</strong>). 
                    Accrued Bonus = <em>10% × Sum Assured × Term</em>. 
                    Optional riders: <strong>Double Accident Benefit (DAB = 0.1% of SA)</strong> and <strong>Waiver of Premium (WP = 1% of Basic Premium)</strong>. 
                    Minimum SA = <strong>KES 50,000</strong>.
                 </p>
    )}

                 
                  {formData.product === "multiple_advantage" && (
                    <p className="text-gray-700 mb-3">
                      <strong>Plan summary:</strong> Multiple Advantage Plan details (placeholder).
                    </p>
                  )}

                  {/* Benefits table */}
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(result.benefits).map(([k, v]) => (
                      <div key={k} className="flex justify-between items-center bg-blue-50 rounded px-3 py-2">
                        <div className="text-gray-800 font-medium">{k}</div>
                        <div className="text-gray-900 font-semibold">KSh {Number(v).toLocaleString()}</div>
                      </div>
                    ))}
                  </div>

                  {/* Footnote */}
                  <p className="text-xs text-gray-500 mt-3">
                    Note: "Accrued Bonus (included above)" represents total bonus added during the policy term. Values shown are based on the Sum Assured returned by the calculation.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}