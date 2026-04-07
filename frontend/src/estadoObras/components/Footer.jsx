import "./styles/Footer.css";
import logoSZ from "../../images/logo-aquatic.png"; // 👈 reemplazá con tu imagen
import logoCliente from "../../images/LOGO-SZCONSULTORES.png"; // 👈 reemplazá con tu imagen

export default function Footer() {
  return (
    <footer className="footer">
      <div className="footer-logos">
        <img src={logoSZ} alt="SZ Consultores" className="footer-logo" />
        <img src={logoCliente} alt="Cliente" className="footer-logo" />
      </div>
      <p>© {new Date().getFullYear()} SZ Consultores · Sistema de Seguimiento de Obras</p>
    </footer>
  );
}
