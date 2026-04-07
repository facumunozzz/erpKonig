import RolesDemo from "../components/RolesDemo";
import obrasData from "../data/obras.json";
import { useState, useEffect } from "react";

export default function RolesPage() {
  const [obras, setObras] = useState([]);

  useEffect(() => {
    setObras(obrasData);
  }, []);

  return (
    <div className="container">
      <h1>👥 Roles y Permisos – Demo</h1>
      <RolesDemo obras={obras} />
    </div>
  );
}
