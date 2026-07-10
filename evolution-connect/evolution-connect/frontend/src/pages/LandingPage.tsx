import { Link } from "react-router-dom";
import ParticleField from "../components/ParticleField";

export default function LandingPage() {
  return (
    <div className="screen">
      <ParticleField />
      <div className="glass-card" style={{ maxWidth: 480, textAlign: "center" }}>
        <span className="eyebrow">USIL Evolution</span>
        <img
          src="/evolution-connect-logo.png"
          alt="Evolution Connect"
          style={{ maxWidth: "min(90%, 420px)", width: "100%", height: "auto", margin: "10px 0" }}
        />
        <p style={{ color: "var(--color-text-dim)", marginBottom: 28 }}>
          <b>Evolution Connect</b> es un juego de networking en tiempo real.
          Los participantes escanean un código QR desde su celular, reciben un color asignado y se buscan 
          físicamente en el lugar del evento. Durante 2 rondas de 5 minutos, cada quien confirma en su 
          pantalla a las personas que va conociendo.
        </p>
        <Link to="/admin" className="btn btn-primary" style={{ textDecoration: "none", display: "inline-block" }}>
          ¡EMPECÉMOS!
        </Link>
      </div>
    </div>
  );
}
