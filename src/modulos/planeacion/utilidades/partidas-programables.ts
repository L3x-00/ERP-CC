import { siguienteSecuencia } from '@/modulos/planeacion/servicios/bolsa-planeacion-servicio';

/**
 * C9.2/P06: prepara la lista del selector de programación de Planeación.
 *
 * El orden pone primero las partidas sin ninguna programación vigente —las más
 * recientes primero— y después las parcialmente programadas, rotuladas con su
 * conteo; el tope acota el selector y `total` permite avisar cuántas quedaron
 * fuera. Puro: recibe conteos ya leídos y no decide autorizaciones.
 */

export const TOPE_PARTIDAS_PROGRAMABLES = 300;

export interface CandidataPartidaProgramable {
  ordenId: string;
  partidaId: string;
  /** Etiqueta base (`folio · código pieza`), sin el conteo de programaciones. */
  etiqueta: string;
  creadoEn: string;
  /** Secuencias de las programaciones vigentes (ni canceladas ni completadas). */
  secuenciasVigentes: readonly number[];
}

export interface PartidaProgramablePreparada {
  ordenId: string;
  partidaId: string;
  etiqueta: string;
  creadoEn: string;
  /** Programaciones vigentes de la partida. */
  programadas: number;
  /** Máxima secuencia vigente + 1; 1 cuando no hay ninguna. */
  secuenciaSugerida: number;
}

export interface ResultadoPartidasProgramables {
  partidas: PartidaProgramablePreparada[];
  /** Candidatas totales antes de aplicar el tope. */
  total: number;
}

export function prepararPartidasProgramables(
  candidatas: readonly CandidataPartidaProgramable[],
  tope: number = TOPE_PARTIDAS_PROGRAMABLES,
): ResultadoPartidasProgramables {
  const ordenadas = [...candidatas].sort((a, b) => {
    const aProgramadas = a.secuenciasVigentes.length > 0 ? 1 : 0;
    const bProgramadas = b.secuenciasVigentes.length > 0 ? 1 : 0;
    if (aProgramadas !== bProgramadas) return aProgramadas - bProgramadas;
    return b.creadoEn.localeCompare(a.creadoEn);
  });

  return {
    partidas: ordenadas.slice(0, Math.max(0, tope)).map((candidata) => ({
      ordenId: candidata.ordenId,
      partidaId: candidata.partidaId,
      etiqueta:
        candidata.secuenciasVigentes.length > 0
          ? `${candidata.etiqueta} (${candidata.secuenciasVigentes.length} programada(s))`
          : candidata.etiqueta,
      creadoEn: candidata.creadoEn,
      programadas: candidata.secuenciasVigentes.length,
      secuenciaSugerida: siguienteSecuencia([...candidata.secuenciasVigentes]),
    })),
    total: ordenadas.length,
  };
}
