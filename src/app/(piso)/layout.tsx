/**
 * Layout de la zona de piso de producción.
 * Hereda el tema global elegido por el usuario. La terminal comparte la misma
 * preferencia claro/oscuro que el resto del ERP, incluso tras navegar desde el
 * menú de cuenta del operador.
 */
export default function LayoutPiso({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="min-h-screen bg-fondo text-texto-primario">{children}</div>;
}
