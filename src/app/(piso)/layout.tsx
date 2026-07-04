/**
 * Layout de la zona de piso de producción.
 * Fuerza el tema oscuro de forma fija (clase `dark`), independiente de la
 * preferencia de tema del sistema u otras rutas, pensado para pantallas de
 * planta de producción.
 */
export default function LayoutPiso({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <div className="dark min-h-screen bg-zinc-950 text-zinc-50">{children}</div>;
}
