'use client';

import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { crearClienteSupabase } from '@/nucleo/supabase/cliente';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { usarCliente } from '@/modulos/clientes/hooks/usar-cliente';
import { subirDocumentoClienteAccion } from '@/modulos/clientes/acciones/subir-documento-cliente';
import { asignarTierManualAccion } from '@/modulos/clientes/acciones/asignar-tier-manual';
import { BadgeTier } from '@/modulos/clientes/componentes/badge-tier';
import { AlertaCredito } from '@/modulos/clientes/componentes/alerta-credito';
import type {
  Cliente,
  Direccion,
  DocumentoCliente,
  TierCliente,
  TipoDocumentoCliente,
} from '@/modulos/clientes/tipos/indice';
import {
  CLASE_ESTADO,
  ETIQUETA_ESTADO,
  ETIQUETA_TIPO_DOCUMENTO,
} from '@/modulos/clientes/utilidades/indice';

const BUCKET = 'documentos-cliente';
type Pestana = 'general' | 'direcciones' | 'documentos' | 'oportunidades';

const CLASE_BOTON_PRIMARIO =
  'rounded-base bg-primario px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50';

/**
 * Ficha 360° del cliente en un drawer lateral. Cabecera con tier/estado y alerta
 * de crédito; pestañas General, Direcciones, Documentos (subida + previsualización
 * vía URL firmada) y Oportunidades (placeholder para Fase 5). Carga sus datos con
 * `usarCliente`.
 */
export function FichaCliente({
  clienteId,
  esAdmin,
  onCerrar,
}: {
  clienteId: string;
  esAdmin: boolean;
  onCerrar: () => void;
}) {
  const [pestana, setPestana] = useState<Pestana>('general');
  const { data, isLoading } = usarCliente(clienteId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onCerrar}>
      <aside
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto bg-background shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-foreground/10 p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold">{data?.cliente.razonSocial ?? 'Cliente'}</h2>
            {data && (
              <div className="flex items-center gap-2">
                <BadgeTier cliente={data.cliente} />
                <span
                  className={`inline-flex items-center rounded-base px-2 py-0.5 text-xs font-semibold ${CLASE_ESTADO[data.cliente.estado]}`}
                >
                  {ETIQUETA_ESTADO[data.cliente.estado]}
                </span>
              </div>
            )}
          </div>
          <button onClick={onCerrar} className="text-2xl leading-none text-foreground/60 hover:text-foreground" aria-label="Cerrar">
            ×
          </button>
        </header>

        {isLoading && <p className="p-4 text-sm text-foreground/60">Cargando…</p>}
        {!isLoading && !data && <p className="p-4 text-sm text-foreground/60">Cliente no encontrado.</p>}

        {data && (
          <>
            <div className="p-4">
              <AlertaCredito cliente={data.cliente} />
            </div>

            {esAdmin && <ControlTierManual clienteId={clienteId} />}

            <nav className="flex gap-1 border-b border-foreground/10 px-4">
              {(['general', 'direcciones', 'documentos', 'oportunidades'] as Pestana[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPestana(p)}
                  className={`border-b-2 px-3 py-2 text-sm capitalize transition-colors ${
                    pestana === p
                      ? 'border-primario font-semibold text-primario'
                      : 'border-transparent text-foreground/60 hover:text-foreground'
                  }`}
                >
                  {p}
                </button>
              ))}
            </nav>

            <div className="flex-1 p-4">
              {pestana === 'general' && <PanelGeneral cliente={data.cliente} />}
              {pestana === 'direcciones' && <PanelDirecciones cliente={data.cliente} />}
              {pestana === 'documentos' && (
                <PanelDocumentos clienteId={clienteId} documentos={data.documentos} />
              )}
              {pestana === 'oportunidades' && (
                <p className="text-sm text-foreground/60">
                  El historial de oportunidades y órdenes se conecta en la Fase 5.
                </p>
              )}
            </div>
          </>
        )}
      </aside>
    </div>
  );
}

function PanelGeneral({ cliente }: { cliente: Cliente }) {
  return (
    <dl className="grid grid-cols-2 gap-3 text-sm">
      <Dato etiqueta="Nombre comercial" valor={cliente.nombreComercial} />
      <Dato etiqueta="RFC" valor={cliente.rfc ?? '—'} />
      <Dato etiqueta="Contacto" valor={cliente.contacto ?? '—'} />
      <Dato etiqueta="Correo" valor={cliente.correo ?? '—'} />
      <Dato etiqueta="Teléfono" valor={cliente.telefono ?? '—'} />
      <Dato etiqueta="Condiciones de pago" valor={cliente.condicionesPago ?? '—'} />
      <Dato etiqueta="Alta" valor={formatearFecha(cliente.creadoEn)} />
    </dl>
  );
}

function PanelDirecciones({ cliente }: { cliente: Cliente }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <BloqueDireccion titulo="Fiscal" direccion={cliente.direccionFiscal} />
      <BloqueDireccion
        titulo="Envío"
        direccion={cliente.direccionEnvio}
        notaSiVacia="Misma que la fiscal"
      />
    </div>
  );
}

function BloqueDireccion({
  titulo,
  direccion,
  notaSiVacia = 'Sin registrar',
}: {
  titulo: string;
  direccion: Direccion | null;
  notaSiVacia?: string;
}) {
  return (
    <div className="rounded-base border border-foreground/15 p-3 text-sm">
      <h3 className="mb-1 font-semibold">{titulo}</h3>
      {direccion ? (
        <address className="not-italic text-foreground/80">
          {direccion.calle} {direccion.numeroExterior}
          {direccion.numeroInterior ? ` int. ${direccion.numeroInterior}` : ''}
          <br />
          {direccion.colonia}, {direccion.municipio}
          <br />
          {direccion.estado}, C.P. {direccion.codigoPostal}
          <br />
          {direccion.pais}
        </address>
      ) : (
        <p className="text-foreground/50">{notaSiVacia}</p>
      )}
    </div>
  );
}

function PanelDocumentos({
  clienteId,
  documentos,
}: {
  clienteId: string;
  documentos: DocumentoCliente[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <FormularioDocumento clienteId={clienteId} />
      {documentos.length === 0 ? (
        <p className="text-sm text-foreground/60">Sin documentos.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-foreground/10">
          {documentos.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div className="flex flex-col">
                <span className="font-medium">{ETIQUETA_TIPO_DOCUMENTO[doc.tipo]}</span>
                <span className="text-xs text-foreground/60">
                  {doc.nombreArchivo} · {formatearFecha(doc.creadoEn)}
                </span>
              </div>
              <BotonVer ruta={doc.rutaStorage} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Abre el documento con una URL firmada temporal (bucket privado). */
function BotonVer({ ruta }: { ruta: string }) {
  const [cargando, setCargando] = useState(false);
  async function ver(): Promise<void> {
    setCargando(true);
    const { data } = await crearClienteSupabase().storage.from(BUCKET).createSignedUrl(ruta, 60);
    setCargando(false);
    if (data?.signedUrl) {
      window.open(data.signedUrl, '_blank', 'noopener');
    }
  }
  return (
    <button onClick={ver} disabled={cargando} className="text-sm font-medium text-primario hover:underline disabled:opacity-50">
      {cargando ? '…' : 'Ver'}
    </button>
  );
}

function FormularioDocumento({ clienteId }: { clienteId: string }) {
  const queryClient = useQueryClient();
  const [tipo, setTipo] = useState<TipoDocumentoCliente>('csf');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);

  async function manejarEnvio(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    if (!archivo) {
      setError('Selecciona un archivo');
      return;
    }
    setSubiendo(true);
    const fd = new FormData();
    fd.set('clienteId', clienteId);
    fd.set('tipo', tipo);
    fd.set('nombreArchivo', archivo.name);
    fd.set('archivo', archivo);

    try {
      const respuesta = await subirDocumentoClienteAccion(fd);
      if (respuesta.exito) {
        setArchivo(null);
        await queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] });
      } else {
        setError(respuesta.error);
      }
    } catch {
      setError('Error de conexión');
    }
    setSubiendo(false);
  }

  return (
    <form onSubmit={manejarEnvio} className="flex flex-col gap-2 rounded-base border border-foreground/15 p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">Tipo</span>
          <select
            value={tipo}
            onChange={(e) => setTipo(e.target.value as TipoDocumentoCliente)}
            className="rounded-base border border-foreground/20 bg-background px-2 py-1.5 text-sm"
          >
            {(Object.keys(ETIQUETA_TIPO_DOCUMENTO) as TipoDocumentoCliente[]).map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_TIPO_DOCUMENTO[t]}
              </option>
            ))}
          </select>
        </label>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className="text-sm"
        />
        <button type="submit" disabled={subiendo} className={CLASE_BOTON_PRIMARIO}>
          {subiendo ? 'Subiendo…' : 'Subir'}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </form>
  );
}

/** Control admin para asignar tier manual (caduca a los 90 días). */
function ControlTierManual({ clienteId }: { clienteId: string }) {
  const queryClient = useQueryClient();
  const [tier, setTier] = useState<TierCliente>('oro');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function asignar(): Promise<void> {
    setEnviando(true);
    setMensaje(null);
    const respuesta = await asignarTierManualAccion({ clienteId, tier });
    setEnviando(false);
    if (respuesta.exito) {
      setMensaje('Tier manual asignado (vence en 90 días).');
      await queryClient.invalidateQueries({ queryKey: ['cliente', clienteId] });
    } else {
      setMensaje(respuesta.error);
    }
  }

  return (
    <div className="mx-4 mb-2 flex flex-wrap items-center gap-2 rounded-base border border-foreground/15 bg-foreground/5 p-3 text-sm">
      <span className="font-medium">Tier manual (admin):</span>
      <select
        value={tier}
        onChange={(e) => setTier(e.target.value as TierCliente)}
        className="rounded-base border border-foreground/20 bg-background px-2 py-1 text-sm"
      >
        <option value="bronce">Bronce</option>
        <option value="plata">Plata</option>
        <option value="oro">Oro</option>
        <option value="platino">Platino</option>
      </select>
      <button onClick={asignar} disabled={enviando} className={CLASE_BOTON_PRIMARIO}>
        {enviando ? '…' : 'Asignar'}
      </button>
      {mensaje && <span className="text-foreground/70">{mensaje}</span>}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-foreground/60">{etiqueta}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}
