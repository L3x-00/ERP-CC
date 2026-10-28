/**
 * Dispara la descarga de una URL firmada con `Content-Disposition: attachment`
 * (por ejemplo, una URL de Supabase Storage con `download`). Usa un ancla
 * temporal para no sacar al usuario de la ficha que está consultando.
 */
export function descargarUrlFirmada(url: string): void {
  if (typeof document === 'undefined') return;
  const enlace = document.createElement('a');
  enlace.href = url;
  enlace.rel = 'noopener';
  document.body.appendChild(enlace);
  enlace.click();
  enlace.remove();
}
