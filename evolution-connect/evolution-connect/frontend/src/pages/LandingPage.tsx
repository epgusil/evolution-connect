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
          <b>Evolution Connect</b> es un juego de networking en tiempo real.<br>
          Los participantes escanean un código QR desde su celular, reciben un color asignado y se buscan 
          físicamente en el lugar del evento. <br> Durante 3 rondas de 5 minutos, cada quien confirma en su 
          pantalla a las personas que va conociendo.
        </p>
        <Link to="/admin" className="btn btn-primary" style={{ textDecoration: "none", display: "inline-block" }}>
          ¡EMPECÉMOS!
        </Link>
      </div>
    </div>
  );
}
