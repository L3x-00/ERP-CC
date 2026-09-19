import type { CatalogoTarifasCotizador, MaterialCotizador } from '../validaciones/tarifas';
import { MATERIALES_COTIZADOR } from '../validaciones/tarifas';

/**
 * Valores por defecto editables del catálogo de tarifas. NO son precios
 * comerciales aprobados: son semillas razonables (MXN por hora / por unidad)
 * que el administrador ajusta en Configuración. El cálculo real siempre usa las
 * tarifas efectivas de cada cotización.
 */
export const CATALOGO_TARIFAS_DEFECTO: CatalogoTarifasCotizador = {
  laser: {
    maquinaHora: 650,
    preparacionHora: 400,
    consumoGasHora: 1,
    gas: { O2: 8, N2: 25, aire: 2 },
    segundosPerforacion: {
      'Acero al carbono': { hasta3Mm: 1.2, hasta6Mm: 2, mayor6Mm: 3.5 },
      'Acero inoxidable': { hasta3Mm: 1.5, hasta6Mm: 2.6, mayor6Mm: 4.4 },
      Aluminio: { hasta3Mm: 0.9, hasta6Mm: 1.6, mayor6Mm: 2.8 },
      Otro: { hasta3Mm: 1.2, hasta6Mm: 2.2, mayor6Mm: 3.8 },
    },
  },
  router: { maquinaHora: 550, preparacionHora: 350, endmill: 120, ballnose: 150 },
  doblado: {
    maquinaHora: 600,
    preparacionHora: 400,
    segundoOperarioHora: 300,
    longitudMaximaMm: 3000,
    factorLongitudMaxima: 0.4,
    piezasHora: { simple: 60, media: 40, compleja: 20 },
  },
  fabricacion: { manoObraHora: 350, soldaduraHora: 450, consumiblesHora: 80, acabadoHora: 300 },
};

/**
 * Aplana el catálogo a las claves de texto que consume el formulario del
 * cotizador (`laser.tarifas.maquinaHora`, `laser.pierce.hasta3Mm`, …). Los
 * tiempos de perforación (`*.pierce.*`) se toman del material indicado, con
 * respaldo en `Otro` para materiales sin fila propia.
 */
export function aplanarCatalogoTarifas(
  catalogo: CatalogoTarifasCotizador,
  material: string,
): Record<string, string> {
  const clave = (MATERIALES_COTIZADOR as readonly string[]).includes(material)
    ? (material as MaterialCotizador)
    : 'Otro';
  const pierce = catalogo.laser.segundosPerforacion[clave] ?? catalogo.laser.segundosPerforacion.Otro;
  const l = catalogo.laser;
  const r = catalogo.router;
  const d = catalogo.doblado;
  const f = catalogo.fabricacion;
  return {
    'laser.tarifas.maquinaHora': String(l.maquinaHora),
    'laser.tarifas.preparacionHora': String(l.preparacionHora),
    'laser.tarifas.consumoGasHora': String(l.consumoGasHora),
    'laser.tarifas.gas.O2': String(l.gas.O2),
    'laser.tarifas.gas.N2': String(l.gas.N2),
    'laser.tarifas.gas.aire': String(l.gas.aire),
    'laser.pierce.hasta3Mm': String(pierce.hasta3Mm),
    'laser.pierce.hasta6Mm': String(pierce.hasta6Mm),
    'laser.pierce.mayor6Mm': String(pierce.mayor6Mm),
    'router.tarifas.maquinaHora': String(r.maquinaHora),
    'router.tarifas.preparacionHora': String(r.preparacionHora),
    'router.tarifas.endmill': String(r.endmill),
    'router.tarifas.ballnose': String(r.ballnose),
    'doblado.tarifas.maquinaHora': String(d.maquinaHora),
    'doblado.tarifas.preparacionHora': String(d.preparacionHora),
    'doblado.tarifas.segundoOperarioHora': String(d.segundoOperarioHora),
    'doblado.tarifas.longitudMaximaMm': String(d.longitudMaximaMm),
    'doblado.tarifas.factorLongitudMaxima': String(d.factorLongitudMaxima),
    'doblado.tarifas.piezasHora.simple': String(d.piezasHora.simple),
    'doblado.tarifas.piezasHora.media': String(d.piezasHora.media),
    'doblado.tarifas.piezasHora.compleja': String(d.piezasHora.compleja),
    'fabricacion.tarifas.manoObraHora': String(f.manoObraHora),
    'fabricacion.tarifas.soldaduraHora': String(f.soldaduraHora),
    'fabricacion.tarifas.consumiblesHora': String(f.consumiblesHora),
    'fabricacion.tarifas.acabadoHora': String(f.acabadoHora),
  };
}
