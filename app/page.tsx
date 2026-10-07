"use client";

import { useState } from "react";

/**
 * Gate — login form.
 *
 * POSTs email and password to /api/auth/login. On 200 the server sets
 * the aa_session cookie and the client navigates to /chamber. On 401
 * the gate shows "Access denied." The Meridian Seal visual frame is
 * kept: meridian line, two rings, the gate panel with the seal.
 */
export default function GatePage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.status === 200) {
        window.location.href = "/chamber";
        return;
      }
      if (res.status === 401) {
        setError("Access denied.");
        setLoading(false);
        return;
      }
      setError("Access denied.");
      setLoading(false);
    } catch {
      setError("Access denied.");
      setLoading(false);
    }
  }

  return (
    <>
      <div className="meridian-line" />
      <div className="ring ring--amin" />
      <div className="ring ring--ahmad" />
      <main className="gate">
        <p className="gate__kicker">AI Architect Amin Azimi</p>
        <h1 className="gate__title">Ahmad &amp; Amin Technology 2026</h1>
        <p className="gate__subtitle">The exclusive two-brothers app</p>
        <form className="gate__form" onSubmit={handleSubmit}>
          <label className="gate__field">
            <span className="gate__field-label">Email</span>
            <input
              type="email"
              className="gate__input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              aria-label="email"
            />
          </label>
          <label className="gate__field">
            <span className="gate__field-label">Password</span>
            <input
              type="password"
              className="gate__input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              aria-label="password"
            />
          </label>
          <button
            type="submit"
            className="gate__submit"
            disabled={loading || !email.trim() || !password.trim()}
          >
            {loading ? "..." : "Enter"}
          </button>
          {error && <p className="gate__error">{error}</p>}
        </form>
        <div className="gate__seal">
          <span className="gate__seal-dot gate__seal-dot--amin" />
          <span className="gate__seal-dot gate__seal-dot--ahmad" />
          <span>MERIDIAN SEAL</span>
        </div>
      </main>
    </>
  );
}
