/** Fecha de un instante en la zona operativa; evita desplazar un trabajo al mes/día UTC. */
export function fechaKpiMexico(instante: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(instante)) return instante;
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date(instante));
  const parte = (tipo: string) => partes.find((item) => item.type === tipo)?.value ?? '';
  return `${parte('year')}-${parte('month')}-${parte('day')}`;
}
