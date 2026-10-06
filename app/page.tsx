import "./globals.css";

export default function GatePage() {
  return (
    <>
      <div className="meridian-line" />
      <div className="ring ring--amin" />
      <div className="ring ring--ahmad" />
      <main className="gate">
        <p className="gate__kicker">AI Architect Amin Azimi</p>
        <h1 className="gate__title">Ahmad &amp; Amin Technology 2026</h1>
        <p className="gate__subtitle">
          اپلیکیشن اختصاصی دو برادر
        </p>
        <div className="gate__seal">
          <span className="gate__seal-dot gate__seal-dot--amin" />
          <span className="gate__seal-dot gate__seal-dot--ahmad" />
          <span>MERIDIAN SEAL</span>
        </div>
      </main>
    </>
  );
}
