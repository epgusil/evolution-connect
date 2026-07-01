import { Link } from "react-router-dom";
import ParticleField from "../components/ParticleField";

export default function LandingPage() {
  return (
    <div className="screen">
      <ParticleField />
      <div className="glass-card" style={{ maxWidth: 480, textAlign: "center" }}>
        <span className="eyebrow">USIL Evolution</span>
        <h1 className="display-title" style={{ fontSize: "clamp(32px, 6vw, 44px)", margin: "10px 0" }}>
          Evolution Connect
        </h1>
        <p style={{ color: "var(--color-text-dim)", marginBottom: 28 }}>
          Juego de networking en tiempo real. Si eres participante, escanea el código QR
          que muestra la pantalla del evento. Si eres organizador, entra al panel de
          administración.
        </p>
        <Link to="/admin" className="btn btn-primary" style={{ textDecoration: "none", display: "inline-block" }}>
          Ir al panel de administración
        </Link>
      </div>
    </div>
  );
}
