"use client";

import { useCallback, useEffect, useState } from "react";

type Lang = "en" | "fa";

const LANG_KEY = "aa-lang";

const GATE_STR: Record<Lang, Record<string, string>> = {
  en: {
    kicker: "AI Architect Amin Azimi",
    title: "Ahmad & Amin Technology",
    subtitle: "The exclusive two-brothers app",
    email: "Email",
    password: "Password",
    enter: "Enter",
    accessDenied: "Access denied.",
    seal: "MERIDIAN SEAL",
  },
  fa: {
    kicker: "معماری هوش مصنوعی امین عظیمی",
    title: "احمد و امین تکنولوژی",
    subtitle: "اپ اختصاصی دو برادر",
    email: "ایمیل",
    password: "رمز عبور",
    enter: "ورود",
    accessDenied: "دسترسی غیرمجاز.",
    seal: "مُهرِ نیمروز",
  },
};

export default function GatePage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lang, setLang] = useState<Lang>("en");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "fa" || saved === "en") {
        setLang(saved);
        const el = document.documentElement;
        el.lang = saved;
        el.dir = saved === "fa" ? "rtl" : "ltr";
      }
    } catch {
      // ignore — default en
    }
  }, []);

  const changeLang = useCallback((next: Lang) => {
    setLang(next);
    try {
      localStorage.setItem(LANG_KEY, next);
    } catch {
      // ignore
    }
    const el = document.documentElement;
    el.lang = next;
    el.dir = next === "fa" ? "rtl" : "ltr";
  }, []);

  const t = GATE_STR[lang];

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
        setError(t.accessDenied);
        setLoading(false);
        return;
      }
      setError(t.accessDenied);
      setLoading(false);
    } catch {
      setError(t.accessDenied);
      setLoading(false);
    }
  }

  return (
    <>
      <div className="gate-field" />
      <div className="meridian-line" />
      <div className="ring ring--amin" />
      <div className="ring ring--ahmad" />
      <div className="lang-switch lang-switch--gate" aria-label="language switch">
        <button
          type="button"
          className={`lang-switch__btn${lang === "en" ? " lang-switch__btn--active" : ""}`}
          onClick={() => changeLang("en")}
          aria-label="English"
        >
          EN
        </button>
        <button
          type="button"
          className={`lang-switch__btn${lang === "fa" ? " lang-switch__btn--active" : ""}`}
          onClick={() => changeLang("fa")}
          aria-label="Persian"
        >
          فا
        </button>
      </div>
      <main className="gate">
        <p className="gate__kicker">{t.kicker}</p>
        <h1 className="gate__title">{t.title}</h1>
        <p className="gate__subtitle">{t.subtitle}</p>
        <form className="gate__form" onSubmit={handleSubmit}>
          <label className="gate__field">
            <span className="gate__field-label">{t.email}</span>
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
            <span className="gate__field-label">{t.password}</span>
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
            {loading ? "..." : t.enter}
          </button>
          {error && <p className="gate__error">{error}</p>}
        </form>
        <div className="gate__seal">
          <span className="gate__seal-dot gate__seal-dot--amin" />
          <span className="gate__seal-dot gate__seal-dot--ahmad" />
          <span>{t.seal}</span>
        </div>
      </main>
    </>
  );
}
