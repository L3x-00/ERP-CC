'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import { Select } from '@/compartido/componentes/ui/input';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import {
  firmarEvidenciaEntregaAccion,
} from '@/modulos/entregas/acciones/firmar-evidencia-entrega';
import { actualizarFechaEntregaAccion } from '@/modulos/entregas/acciones/actualizar-fecha-entrega';
import {
  obtenerEntregaDetalleAccion,
  type DetalleEntregaCompleto,
} from '@/modulos/entregas/acciones/obtener-entrega-detalle';
import { vincularEvidenciaEntregaAccion } from '@/modulos/entregas/acciones/vincular-evidencia-entrega';
import { CapturaFirma } from '@/modulos/entregas/componentes/captura-firma';
import { ETIQUETA_CLASE_EVIDENCIA } from '@/modulos/entregas/utilidades/indice';

/**
 * SII-B7.2/B7.3: detalle de una nota con renglones por ITxx, evidencias y
 * captura de firma digital o escaneada. La firma queda ligada a la nota exacta
 * y versionada (nunca se sobrescribe).
 */
export function DetalleEntrega({
  inicial,
  puedeEvidencia,
  puedeEditar = false,
  puedeFacturar = false,
}: {
  inicial: DetalleEntregaCompleto;
  puedeEvidencia: boolean;
  puedeEditar?: boolean;
  puedeFacturar?: boolean;
}) {
  const [datos, setDatos] = useState<DetalleEntregaCompleto>(inicial);
  const [claseArchivo, setClaseArchivo] = useState<'evidencia' | 'firma_escaneada'>('evidencia');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [fechaEntrega, setFechaEntrega] = useState(inicial.detalle.entrega.fechaEntrega.slice(0, 10));
  const [guardandoFecha, setGuardandoFecha] = useState(false);
  const entradaArchivo = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const { detalle, evidencias } = datos;
  const { entrega, orden } = detalle;
  const folioVisible = entrega.folioSii ?? entrega.folio;

  async function actualizar(): Promise<void> {
    const respuesta = await obtenerEntregaDetalleAccion({ entregaId: entrega.id });
    if (respuesta.exito && respuesta.datos) setDatos(respuesta.datos);
  }

  async function subirArchivo(archivo: File, clase: 'evidencia' | 'firma_escaneada' | 'firma'): Promise<boolean> {
    const formulario = new FormData();
    formulario.append('notaId', entrega.id);
    formulario.append('clase', clase);
    formulario.append('nombreArchivo', archivo.name);
    formulario.append('archivo', archivo);
    const respuesta = await vincularEvidenciaEntregaAccion(formulario);
    if (respuesta.exito && respuesta.datos) {
      setMensaje(`${ETIQUETA_CLASE_EVIDENCIA[clase]} adjuntada (versión ${respuesta.datos.version}).`);
      setError(null);
      await actualizar();
      return true;
    }
    setMensaje(null);
    setError(respuesta.exito ? 'No se pudo adjuntar' : respuesta.error);
    return false;
  }

  async function enviarSeleccion(): Promise<void> {
    const archivo = entradaArchivo.current?.files?.[0];
    if (!archivo) {
      setError('Selecciona un archivo de evidencia o firma escaneada');
      return;
    }
    setOcupado(true);
    try {
      const subida = await subirArchivo(archivo, claseArchivo);
      if (subida && entradaArchivo.current) entradaArchivo.current.value = '';
    } finally {
      setOcupado(false);
    }
  }

  async function abrirEvidencia(archivoId: string): Promise<void> {
    const respuesta = await firmarEvidenciaEntregaAccion({ archivoId });
    if (respuesta.exito && respuesta.datos) {
      window.open(respuesta.datos.url, '_blank', 'noopener,noreferrer');
    } else if (!respuesta.exito) {
      setError(respuesta.error);
    }
  }

  async function guardarFechaEntrega(): Promise<void> {
    setMensaje(null);
    setError(null);
    setGuardandoFecha(true);
    try {
      const respuesta = await actualizarFechaEntregaAccion({
        entregaId: entrega.id,
        fechaEntrega: new Date(`${fechaEntrega}T12:00:00.000Z`).toISOString(),
        actualizadoEn: entrega.actualizadoEn,
      });
      if (!respuesta.exito || !respuesta.datos) {
        setError(respuesta.exito ? 'No se recibió la fecha actualizada' : respuesta.error);
        return;
      }
      const { fechaEntrega: fechaGuardada, actualizadoEn } = respuesta.datos;
      setDatos((previo) => ({
        ...previo,
        detalle: {
          ...previo.detalle,
          entrega: { ...previo.detalle.entrega, fechaEntrega: fechaGuardada, actualizadoEn },
        },
      }));
      setFechaEntrega(fechaGuardada.slice(0, 10));
      setMensaje('Fecha de entrega actualizada');
    } catch {
      setError('No se pudo actualizar la fecha. Intenta de nuevo.');
    } finally {
      setGuardandoFecha(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5" data-testid="detalle-entrega">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-2xl font-bold text-texto-primario" data-testid="detalle-folio">
              {folioVisible}
            </h1>
            <span className="rounded-full bg-superficie-2 px-2.5 py-0.5 text-xs font-medium text-texto-secundario">
              {entrega.esParcial ? 'Parcial' : 'Total'}
            </span>
          </div>
          <p className="text-sm text-texto-secundario">
            Orden{' '}
            <Link href={`/ordenes/${orden.id}`} className="text-acento underline" data-testid="detalle-orden">
              {orden.folioSii ?? orden.folio}
            </Link>
            {orden.clienteNombre ? ` · ${orden.clienteNombre}` : ''} · {formatearFecha(entrega.creadoEn)}
          </p>
          <p className="text-sm text-texto-secundario" data-testid="detalle-partes">
            Entrega: {detalle.entregadoPorNombre ?? '—'} · Recibe: {entrega.recibidoPor}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeFacturar ? (
            <Link
              href={`/facturacion?entrega=${entrega.id}`}
              className="inline-flex min-h-11 items-center rounded-md border border-borde px-3 text-sm font-semibold text-acento hover:bg-superficie-2"
              data-testid="facturar-entrega"
            >
              Facturar entrega
            </Link>
          ) : null}
          <Button variante="contorno" tamano="sm" onClick={() => router.push('/entregas')}>
            Volver a la cola
          </Button>
        </div>
      </header>

      {error ? <p role="alert" className="text-sm text-peligro-texto" data-testid="detalle-error">{error}</p> : null}
      {mensaje ? <p role="status" className="text-sm text-exito-texto" data-testid="detalle-mensaje">{mensaje}</p> : null}

      {puedeEditar ? (
        <section
          className="flex flex-wrap items-end gap-3 rounded-lg border border-borde p-4"
          aria-labelledby="titulo-fecha-entrega"
          data-testid="seccion-fecha-entrega"
        >
          <div className="grid gap-1">
            <h2 id="titulo-fecha-entrega" className="text-sm font-semibold">Fecha de entrega</h2>
            <p className="text-xs text-texto-secundario">
              Registrada: {formatearFecha(entrega.fechaEntrega)}. Corrígela solo dentro del rango
              permitido: no antes del día de generación ni en el futuro.
            </p>
          </div>
          <label className="grid gap-1 text-xs font-medium text-texto-secundario">
            Nueva fecha
            <input
              type="date"
              className="min-h-11 rounded-md border border-borde bg-superficie px-3 py-2 text-sm"
              data-testid="fecha-entrega-edicion"
              value={fechaEntrega}
              min={entrega.creadoEn.slice(0, 10)}
              onChange={(evento) => setFechaEntrega(evento.target.value)}
            />
          </label>
          <Button type="button" tamano="sm" disabled={guardandoFecha}
            data-testid="guardar-fecha-entrega"
            onClick={() => void guardarFechaEntrega()}>
            {guardandoFecha ? 'Guardando…' : 'Actualizar fecha'}
          </Button>
        </section>
      ) : null}

      <section className="overflow-x-auto rounded-lg border border-borde" aria-labelledby="titulo-renglones">
        <h2 id="titulo-renglones" className="border-b border-borde bg-superficie-2 px-4 py-2 text-sm font-semibold">
          Ítems entregados (ITxx)
        </h2>
        <table className="w-full border-collapse text-sm" data-testid="tabla-renglones-entrega">
          <thead className="text-left text-xs uppercase tracking-wide text-texto-secundario">
            <tr>
              <th scope="col" className="px-4 py-2">Ítem</th>
              <th scope="col" className="px-4 py-2 text-right">Solicitado</th>
              <th scope="col" className="px-4 py-2 text-right">Entregado</th>
            </tr>
          </thead>
          <tbody>
            {entrega.renglones.map((renglon) => {
              const codigo = renglon.codigoItem ?? renglon.partidaId.slice(0, 8);
              return (
                <tr key={renglon.id} className="border-t border-borde" data-testid={`renglon-entrega-${codigo}`}>
                  <th scope="row" className="px-4 py-2 text-left font-mono text-xs">{codigo}</th>
                  <td className="px-4 py-2 text-right tabular-nums">{renglon.cantidadSolicitada}</td>
                  <td className="px-4 py-2 text-right tabular-nums font-semibold">{renglon.cantidadEntregada}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <section className="grid gap-3 rounded-lg border border-borde p-4" aria-labelledby="titulo-evidencias"
        data-testid="seccion-evidencias-entrega">
        <div>
          <h2 id="titulo-evidencias" className="text-base font-semibold">Evidencia y firma</h2>
          <p className="text-xs text-texto-secundario">
            Obligatorio: cantidades, quién entrega, quién recibe y fecha. Cliente industrial: hoja
            impresa con sello, fecha y firma, digitalizada (`firma_escaneada`). Cliente no industrial:
            firma digital en pantalla (`firma`). La evidencia fotográfica se recomienda en ambos casos.
          </p>
        </div>

        <ul className="grid gap-2" data-testid="lista-evidencias-entrega">
          {evidencias.length === 0 ? (
            <li className="text-sm text-texto-secundario">Sin evidencia adjunta todavía.</li>
          ) : (
            evidencias.map((evidencia) => (
              <li key={evidencia.id}
                data-testid={`evidencia-${evidencia.clase}-${evidencia.version}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-borde px-3 py-2 text-sm">
                <span>
                  <span className="font-medium">
                    {ETIQUETA_CLASE_EVIDENCIA[evidencia.clase as keyof typeof ETIQUETA_CLASE_EVIDENCIA] ?? evidencia.clase}
                  </span>{' '}
                  · v{evidencia.version} {evidencia.vigente ? '' : '(reemplazada)'} · {evidencia.nombreOriginal}
                  <span className="block text-xs text-texto-secundario">{formatearFecha(evidencia.creadoEn)}</span>
                </span>
                <Button type="button" variante="contorno" tamano="sm"
                  data-testid={`abrir-evidencia-${evidencia.id}`}
                  onClick={() => void abrirEvidencia(evidencia.id)}>
                  Abrir
                </Button>
              </li>
            ))
          )}
        </ul>

        {puedeEvidencia ? (
          <div className="grid gap-3 border-t border-borde pt-3">
            <div className="flex flex-wrap items-end gap-2">
              <label className="grid gap-1 text-xs font-medium text-texto-secundario">
                Clase
                <Select className="min-h-11" data-testid="clase-evidencia"
                  value={claseArchivo}
                  onChange={(evento) => setClaseArchivo(evento.target.value as 'evidencia' | 'firma_escaneada')}>
                  <option value="evidencia">Evidencia fotográfica</option>
                  <option value="firma_escaneada">Firma escaneada (industrial)</option>
                </Select>
              </label>
              <label className="grid flex-1 gap-1 text-xs font-medium text-texto-secundario">
                Archivo (imagen o PDF, máx. 10 MB)
                <input
                  ref={entradaArchivo}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  data-testid="archivo-evidencia"
                  className="min-h-11 rounded-md border border-borde bg-superficie px-3 py-2 text-sm"
                />
              </label>
              <Button type="button" tamano="sm" disabled={ocupado}
                data-testid="subir-evidencia-entrega"
                onClick={() => void enviarSeleccion()}>
                {ocupado ? 'Subiendo…' : 'Adjuntar'}
              </Button>
            </div>

            <div>
              <p className="mb-2 text-xs font-medium text-texto-secundario">Firma digital en pantalla (cliente no industrial)</p>
              <CapturaFirma
                deshabilitado={ocupado}
                onFirma={async (archivo) => {
                  setOcupado(true);
                  try {
                    return await subirArchivo(archivo, 'firma');
                  } finally {
                    setOcupado(false);
                  }
                }}
              />
            </div>
          </div>
        ) : (
          <p className="text-xs text-texto-tenue">No tienes permiso para adjuntar evidencia a la entrega.</p>
        )}
      </section>
    </div>
  );
}
