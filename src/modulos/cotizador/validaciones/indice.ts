import { z } from 'zod';

const costo = z.number().finite().nonnegative();
const positivo = z.number().finite().positive();
const tarifaEquipo = { maquinaHora: costo, preparacionHora: costo };
export const esquemaCotizacionTecnica = z.object({
  moneda: z.enum(['MXN', 'USD']), cantidad: positivo,
  material: z.string().trim().min(1).max(120).optional(), espesorMm: positivo.optional(),
  recargoPorcentaje: costo, descuentoPorcentaje: costo.max(100),
  fechaCalculo: z.iso.datetime({ offset: true }).optional(),
  laser: z.object({
    material: z.string().trim().min(1), espesorMm: positivo, perimetroM: costo,
    velocidadMMin: positivo, perforaciones: costo.int(), preparacionHoras: costo, costoMaterial: costo,
    gas: z.enum(['O2', 'N2', 'aire']),
    tarifas: z.object({ ...tarifaEquipo, consumoGasHora: costo,
      gas: z.object({ O2: costo, N2: costo, aire: costo }).strict(),
      segundosPerforacion: z.record(z.string(), z.object({ hasta3Mm: costo, hasta6Mm: costo, mayor6Mm: costo }).strict()),
    }).strict(),
  }).strict().optional(),
  router: z.object({ horas: costo, preparacionHoras: costo, fresas: costo.int(), fresa: z.enum(['endmill', 'ballnose']), costoMaterial: costo,
    tarifas: z.object({ ...tarifaEquipo, endmill: costo, ballnose: costo }).strict(),
  }).strict().optional(),
  doblado: z.object({ complejidad: z.enum(['simple', 'media', 'compleja']), longitudMm: costo, preparacionHoras: costo, dosOperarios: z.boolean(), costoMaterial: costo,
    tarifas: z.object({ ...tarifaEquipo, segundoOperarioHora: costo, longitudMaximaMm: positivo, factorLongitudMaxima: costo.max(1),
      piezasHora: z.object({ simple: positivo, media: positivo, compleja: positivo }).strict(),
    }).strict(),
  }).strict().optional(),
  fabricacion: z.object({ horasManoObra: costo, horasSoldadura: costo, horasAcabado: costo, costoMaterial: costo, subcontrato: costo,
    tarifas: z.object({ manoObraHora: costo, soldaduraHora: costo, consumiblesHora: costo, acabadoHora: costo }).strict(),
  }).strict().optional(),
  otros: z.object({ flete: costo, adicionales: costo }).strict().optional(),
}).strict().refine(datos => datos.laser || datos.router || datos.doblado || datos.fabricacion || datos.otros, 'Selecciona al menos un proceso');
