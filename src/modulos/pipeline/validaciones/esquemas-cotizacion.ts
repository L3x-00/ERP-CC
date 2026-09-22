import { z } from 'zod';
import { esquemaSnapshotTecnico } from '@/modulos/cotizador/validaciones/snapshot';

/** Tope de líneas por cotización; igual al que valida la RPC. */
export const MAXIMO_LINEAS_COTIZACION = 200;

const textoOpcional = (maximo: number) =>
  z
    .string()
    .trim()
    .max(maximo)
    .transform((valor) => (valor === '' ? undefined : valor))
    .optional();

/**
 * Decimales significativos de un número, sin depender de `String()` (que usa
 * notación exponencial para valores pequeños y devolvería 0 decimales).
 */
function decimalesDe(valor: number): number {
  const [mantisa, exponente] = valor.toExponential().split('e');
  const fraccion = mantisa?.split('.')[1]?.length ?? 0;
  return Math.max(0, fraccion - Number(exponente));
}

/**
 * Las columnas de `cotizacion_lineas` tienen escala fija — `cantidad`
 * numeric(12,2), `precio_unitario` numeric(14,4), `area` numeric(12,4) — y
 * Postgres redondea al insertar. Sin esta validación el usuario guardaría un
 * número distinto al que capturó sin enterarse; la RPC aplica el mismo tope.
 */
const escalaMaxima = (decimales: number) => ({
  comprobar: (valor: number) => decimalesDe(valor) <= decimales,
  mensaje: `Máximo ${decimales} decimales`,
});

/** Esquema de una línea individual de cotización. */
export const esquemaLineaCotizacion = z
  .object({
    descripcion: z.string().trim().min(1, 'Descripción requerida').max(300),
    cantidad: z
      .number()
      .positive('Cantidad debe ser mayor a 0')
      .max(1_000_000_000, 'Cantidad fuera de rango')
      .refine(escalaMaxima(2).comprobar, `Cantidad: ${escalaMaxima(2).mensaje}`),
    precioUnitario: z
      .number()
      .min(0, 'Precio no puede ser negativo')
      .max(1_000_000_000, 'Precio fuera de rango')
      .refine(escalaMaxima(4).comprobar, `Precio unitario: ${escalaMaxima(4).mensaje}`),
    material: textoOpcional(120),
    espesor: textoOpcional(120),
    area: z
      .number()
      .min(0, 'Área no puede ser negativa')
      .max(10_000_000)
      .refine(escalaMaxima(4).comprobar, `Área: ${escalaMaxima(4).mensaje}`)
      .optional(),
    procesos: z.array(z.string().trim().max(60)).max(20).default([]),
    // RFQ-05: área/departamento del catálogo de configuración.
    areaTrabajoCodigo: textoOpcional(48),
    // OBS-04: equipo/estación del catálogo de Planeación (opcional).
    estacionCodigo: textoOpcional(60),
    // RFQ-06: trabajo externo (EXT) con proveedor de texto libre.
    esExterno: z.boolean().default(false),
    proveedorExterno: textoOpcional(120),
    // RFQ-03: concepto de descuento del cliente (no fabricable).
    esDescuento: z.boolean().default(false),
    calculoTecnico: esquemaSnapshotTecnico.optional(),
  })
  .strict().superRefine((linea, contexto) => {
    if (linea.calculoTecnico && (linea.calculoTecnico.entrada.cantidad !== linea.cantidad || linea.calculoTecnico.precioUnitario !== linea.precioUnitario)) {
      contexto.addIssue({ code: 'custom', message: 'El cálculo técnico no corresponde al precio o cantidad de la línea', path: ['calculoTecnico'] });
    }
    if (linea.esDescuento && linea.calculoTecnico) {
      contexto.addIssue({ code: 'custom', message: 'La línea de descuento no lleva cálculo técnico', path: ['esDescuento'] });
    }
    if (
      linea.esDescuento &&
      (linea.material !== undefined ||
        linea.espesor !== undefined ||
        linea.area !== undefined ||
        linea.areaTrabajoCodigo !== undefined ||
        linea.estacionCodigo !== undefined ||
        linea.esExterno ||
        linea.procesos.length > 0)
    ) {
      contexto.addIssue({
        code: 'custom',
        message: 'La línea de descuento no lleva datos técnicos ni de producción',
        path: ['esDescuento'],
      });
    }
    if (!linea.esExterno && linea.proveedorExterno !== undefined) {
      contexto.addIssue({
        code: 'custom',
        message: 'El proveedor externo requiere marcar la línea como externa',
        path: ['proveedorExterno'],
      });
    }
  });

/**
 * Esquema para guardar la cotización completa de una oportunidad.
 * La semántica de guardado es de reemplazo total de líneas, por eso se exige
 * al menos una línea (una cotización vacía no tiene sentido de negocio).
 *
 * `actualizadoEnEsperado` es el token de concurrencia que leyó el editor: si la
 * oportunidad cambió desde entonces, la RPC rechaza la escritura en vez de
 * pisar el trabajo de otra pantalla. Es opcional para no romper llamadas
 * anteriores que no lo enviaban; el editor actual siempre lo manda.
 */
export const esquemaGuardarCotizacion = z
  .object({
    pipelineId: z.uuid(),
    lineas: z
      .array(esquemaLineaCotizacion)
      .min(1, 'Agrega al menos una línea')
      .max(MAXIMO_LINEAS_COTIZACION, 'Demasiadas líneas en la cotización'),
    actualizadoEnEsperado: z.iso.datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((cotizacion, contexto) => {
    // RFQ-03: el descuento no sustituye líneas fabricables ni puede dejar la
    // cotización en negativo (la RPC aplica exactamente estas dos reglas).
    const fabricables = cotizacion.lineas.filter((linea) => !linea.esDescuento);
    if (fabricables.length === 0) {
      contexto.addIssue({
        code: 'custom',
        message: 'Agrega al menos una línea que no sea descuento',
        path: ['lineas'],
      });
      return;
    }
    const subtotal = fabricables.reduce(
      (suma, linea) => suma + linea.cantidad * linea.precioUnitario,
      0,
    );
    const descuento = cotizacion.lineas.reduce(
      (suma, linea) => suma + (linea.esDescuento ? linea.cantidad * linea.precioUnitario : 0),
      0,
    );
    if (descuento > subtotal) {
      contexto.addIssue({
        code: 'custom',
        message: 'El descuento no puede superar el subtotal de las líneas',
        path: ['lineas'],
      });
    }
  });

/** Datos validados de una línea de cotización. */
export type LineaCotizacionInput = z.infer<typeof esquemaLineaCotizacion>;

/** Datos validados para guardar una cotización completa. */
export type GuardarCotizacionInput = z.infer<typeof esquemaGuardarCotizacion>;
