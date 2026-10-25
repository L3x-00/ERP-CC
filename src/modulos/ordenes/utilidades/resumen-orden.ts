/** Horas y eficiencia de una orden a partir de sus partidas (misma regla que la comparativa). */
export function calcularHorasResumen(
  partidas: readonly { tiempoEstimadoMinutos: number; tiempoRealMinutos: number }[],
): { estimadas: number; reales: number; eficiencia: number | null } {
  const estimadas = partidas.reduce(
    (total, partida) => total + partida.tiempoEstimadoMinutos,
    0,
  ) / 60;
  const reales = partidas.reduce(
    (total, partida) => total + partida.tiempoRealMinutos,
    0,
  ) / 60;

  return {
    estimadas: Math.round(estimadas * 100) / 100,
    reales: Math.round(reales * 100) / 100,
    eficiencia: reales > 0 ? Math.round((estimadas / reales) * 1000) / 10 : null,
  };
}
