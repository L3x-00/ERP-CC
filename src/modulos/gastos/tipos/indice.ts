export {
  MONEDAS_GASTO,
  CATEGORIAS_GASTO,
  ESTADOS_GASTO,
  METODOS_PAGO_GASTO,
  COMPONENTES_RENTABILIDAD,
  RUBROS_DESGLOSE_RENTABILIDAD,
  CATEGORIAS_INCLUIDAS_EN_RUBROS,
  categoriaIncluidaEnRubros,
  filaAGasto,
} from '@/modulos/gastos/tipos/gastos';

export type {
  MonedaGasto,
  CategoriaGasto,
  EstadoGasto,
  TipoGasto,
  MetodoPagoGasto,
  MonedaRentabilidad,
  ComponenteRentabilidad,
  RubroDesgloseRentabilidad,
  DesgloseRentabilidadOrden,
  Gasto,
  FilaGasto,
  CalculoRentabilidadOrden,
  DatosComprobanteOCR,
} from '@/modulos/gastos/tipos/gastos';

export {
  CONCEPTOS_CONCILIACION,
  FUENTES_CONCILIACION,
  ETIQUETA_CONCEPTO_CONCILIACION,
  ETIQUETA_FUENTE_CONCILIACION,
} from '@/modulos/gastos/tipos/conciliacion';

export type {
  ConceptoConciliacion,
  FuenteConciliacion,
  FilaConciliacionCostos,
  AvisoConciliacion,
  TotalesConciliacion,
  ConciliacionCostosOrden,
} from '@/modulos/gastos/tipos/conciliacion';
