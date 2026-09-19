import { esquemaCotizacionTecnica } from '../validaciones/indice';
import type { CostoProceso, CotizacionTecnicaCalculada, ProcesoCotizacion } from '../tipos/indice';

function redondear(valor: number): number {
  if (!Number.isFinite(valor) || valor < 0) throw new Error('El cálculo excede el rango numérico permitido');
  const resultado = Number(valor.toFixed(4));
  if (resultado > 99_999_999.9999) throw new Error('El importe excede el rango monetario permitido');
  return resultado;
}

/** Costos del trabajo completo. Recargo sobre costo; descuento posterior.
 * Cada rubro se redondea a4 decimales; el total suma esos rubros.
 * Precio total = precio unitario redondeado × cantidad, también a4 decimales.
 * No convierte monedas ni aplica impuestos; todas las tarifas vienen de entrada.
 */
export function calcularCotizacionTecnica(entrada: unknown): CotizacionTecnicaCalculada {
  const datos = esquemaCotizacionTecnica.parse(entrada);
  const procesos: CostoProceso[] = [];
  const advertencias: string[] = [];
  // Tiempo de máquina/mano de obra estimado de la pieza (minutos). Es el mismo
  // tiempo con el que el motor calcula el costo; se expone para que la orden de
  // producción herede un estimado real en vez de 0 (RFQ-15).
  const minutos: number[] = [];
  const agregar = (proceso: ProcesoCotizacion, material: number, servicios: number, otros = 0) => {
    const rubros = { material: redondear(material), servicios: redondear(servicios), otros: redondear(otros) };
    procesos.push({ proceso, ...rubros, total: redondear(rubros.material + rubros.servicios + rubros.otros) });
  };
  const laser = datos.laser;
  if (laser) {
    const tarifas = laser.tarifas;
    const tieneMaterial = Object.hasOwn(tarifas.segundosPerforacion, laser.material);
    const tiempos = tieneMaterial ? tarifas.segundosPerforacion[laser.material]
      : Object.hasOwn(tarifas.segundosPerforacion, 'Otro') ? tarifas.segundosPerforacion.Otro : undefined;
    if (!tiempos) throw new Error('Falta el tiempo de perforación para el material');
    if (!tieneMaterial) advertencias.push('Láser utiliza el tiempo de perforación configurado para Otro');
    const segundos = laser.espesorMm <= 3 ? tiempos.hasta3Mm : laser.espesorMm <= 6 ? tiempos.hasta6Mm : tiempos.mayor6Mm;
    const horasCorte = laser.perimetroM / laser.velocidadMMin / 60;
    const horasPerforacion = laser.perforaciones * segundos / 3600;
    minutos.push((horasCorte + horasPerforacion + laser.preparacionHoras) * 60);
    agregar('laser', laser.costoMaterial,
      (horasCorte + horasPerforacion) * tarifas.maquinaHora
      + horasCorte * tarifas.consumoGasHora * tarifas.gas[laser.gas]
      + laser.preparacionHoras * tarifas.preparacionHora);
  }
  const router = datos.router;
  if (router) {
    minutos.push((router.horas + router.preparacionHoras) * 60);
    agregar('router', router.costoMaterial,
      router.horas * router.tarifas.maquinaHora + router.preparacionHoras * router.tarifas.preparacionHora + router.fresas * router.tarifas[router.fresa]);
  }
  const doblado = datos.doblado;
  if (doblado) {
    const tarifas = doblado.tarifas;
    if (doblado.longitudMm > tarifas.longitudMaximaMm) advertencias.push('La longitud de doblado supera la referencia configurada; verifica la capacidad del equipo');
    const proporcion = Math.min(doblado.longitudMm / tarifas.longitudMaximaMm, 1);
    const factor = Math.max(1 - tarifas.factorLongitudMaxima * proporcion ** 2, 0.3);
    const horas = datos.cantidad / (tarifas.piezasHora[doblado.complejidad] * factor);
    minutos.push((horas + doblado.preparacionHoras) * 60);
    agregar('doblado', doblado.costoMaterial, horas * tarifas.maquinaHora
      + doblado.preparacionHoras * tarifas.preparacionHora
      + (doblado.dosOperarios ? horas * tarifas.segundoOperarioHora : 0));
  }
  const fabricacion = datos.fabricacion;
  if (fabricacion) {
    minutos.push((fabricacion.horasManoObra + fabricacion.horasSoldadura + fabricacion.horasAcabado) * 60);
    agregar('fabricacion', fabricacion.costoMaterial,
      fabricacion.horasManoObra * fabricacion.tarifas.manoObraHora
        + fabricacion.horasSoldadura * (fabricacion.tarifas.soldaduraHora + fabricacion.tarifas.consumiblesHora)
        + fabricacion.horasAcabado * fabricacion.tarifas.acabadoHora, fabricacion.subcontrato);
  }
  if (datos.otros) agregar('otros', 0, 0, datos.otros.flete + datos.otros.adicionales);
  const totalMinutos = minutos.reduce((total, valor) => total + valor, 0);
  if (!Number.isFinite(totalMinutos) || totalMinutos < 0) {
    throw new Error('El tiempo estimado excede el rango permitido');
  }
  const sumar = (clave: 'material' | 'servicios' | 'otros') => redondear(procesos.reduce((total, proceso) => total + proceso[clave], 0));
  const costoMaterial = sumar('material'); const costoServicios = sumar('servicios'); const costoOtros = sumar('otros');
  const costoTotal = redondear(costoMaterial + costoServicios + costoOtros);
  const precioUnitario = redondear(costoTotal / datos.cantidad * (1 + datos.recargoPorcentaje / 100) * (1 - datos.descuentoPorcentaje / 100));
  return { version: 1, entrada: datos, procesos, costoMaterial, costoServicios, costoOtros, costoTotal,
    precioUnitario, precioTotal: redondear(precioUnitario * datos.cantidad),
    tiempoEstimadoMinutos: Number(totalMinutos.toFixed(2)), advertencias };
}
