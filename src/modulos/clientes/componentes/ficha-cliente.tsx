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
import { HistorialCliente } from '@/modulos/clientes/componentes/historial-cliente';
import { HiloComentarios } from '@/modulos/comentarios/componentes/indice';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Tarjeta } from '@/compartido/componentes/diseno/tarjeta';
import { Button } from '@/compartido/componentes/ui/button';
import { Select } from '@/compartido/componentes/ui/input';
import type {
  Cliente,
  Direccion,
  DocumentoCliente,
  TierCliente,
  TipoDocumentoCliente,
} from '@/modulos/clientes/tipos/indice';
import { ETIQUETA_TIPO_DOCUMENTO } from '@/modulos/clientes/utilidades/indice';

const BUCKET = 'documentos-cliente';
type Pestana = 'general' | 'direcciones' | 'documentos' | 'historial' | 'comentarios';

const ETIQUETA_PESTANA: Record<Pestana, string> = {
  general: 'General',
  direcciones: 'Direcciones',
  documentos: 'Documentos',
  historial: 'Historial',
  comentarios: 'Comentarios',
};

/**
 * Ficha 360° del cliente en un drawer lateral. Cabecera con tier/estado y alerta
 * de crédito; pestañas General, Direcciones, Documentos (subida + previsualización
 * vía URL firmada), Historial (cotizaciones y órdenes reales) y Comentarios.
 * Carga sus datos con `usarCliente`.
 */
export function FichaCliente({
  clienteId,
  esAdmin,
  usuarioActualId,
  onCerrar,
}: {
  clienteId: string;
  esAdmin: boolean;
  usuarioActualId?: string;
  onCerrar: () => void;
}) {
  const [pestana, setPestana] = useState<Pestana>('general');
  const { data, isLoading } = usarCliente(clienteId);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onCerrar}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Ficha del cliente"
        className="deslizar-derecha flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-borde bg-superficie shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between border-b border-borde p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-bold text-texto-primario">{data?.cliente.razonSocial ?? 'Cliente'}</h2>
            {data && (
              <div className="flex items-center gap-2">
                <BadgeTier cliente={data.cliente} consumo={data.consumoUltimos3Meses} />
                <BadgeEstado estado={data.cliente.estado} />
              </div>
            )}
          </div>
          <Button
            variante="fantasma"
            tamano="sm"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="text-xl leading-none"
          >
            ×
          </Button>
        </header>

        {isLoading && <p className="p-4 text-sm text-texto-secundario">Cargando…</p>}
        {!isLoading && !data && <p className="p-4 text-sm text-texto-secundario">Cliente no encontrado.</p>}

        {data && (
          <>
            <div className="p-4">
              <AlertaCredito cliente={data.cliente} usado={data.creditoUsado} />
            </div>

            {esAdmin && <ControlTierManual clienteId={clienteId} />}

            <nav className="flex flex-wrap gap-1 border-b border-borde px-4">
              {(Object.keys(ETIQUETA_PESTANA) as Pestana[]).map((p) => (
                <button
                  key={p}
                  onClick={() => setPestana(p)}
                  aria-current={pestana === p ? 'page' : undefined}
                  className={`border-b-2 px-3 py-2 text-sm transition-colors ${
                    pestana === p
                      ? 'border-acento font-semibold text-acento'
                      : 'border-transparent text-texto-secundario hover:text-texto-primario'
                  }`}
                >
                  {ETIQUETA_PESTANA[p]}
                </button>
              ))}
            </nav>

            <div className="flex-1 p-4">
              {pestana === 'general' && <PanelGeneral cliente={data.cliente} />}
              {pestana === 'direcciones' && <PanelDirecciones cliente={data.cliente} />}
              {pestana === 'documentos' && (
                <PanelDocumentos clienteId={clienteId} documentos={data.documentos} />
              )}
              {pestana === 'historial' && <HistorialCliente clienteId={clienteId} />}
              {pestana === 'comentarios' && (
                <HiloComentarios
                  entidadTipo="cliente"
                  entidadId={clienteId}
                  usuarioActualId={usuarioActualId}
                  puedeEliminarTodos={esAdmin}
                  titulo="Comentarios del cliente"
                />
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
    <Tarjeta>
      <dl className="grid grid-cols-2 gap-3 px-6 py-4 text-sm">
        <Dato etiqueta="Nombre comercial" valor={cliente.nombreComercial} />
        <Dato etiqueta="RFC" valor={cliente.rfc ?? '—'} />
        <Dato etiqueta="Contacto" valor={cliente.contacto ?? '—'} />
        <Dato etiqueta="Correo" valor={cliente.correo ?? '—'} />
        <Dato etiqueta="Teléfono" valor={cliente.telefono ?? '—'} />
        <Dato etiqueta="Condiciones de pago" valor={cliente.condicionesPago ?? '—'} />
        <Dato etiqueta="Alta" valor={formatearFecha(cliente.creadoEn)} />
      </dl>
    </Tarjeta>
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
    <Tarjeta className="p-3 text-sm">
      <h3 className="mb-1 font-semibold">{titulo}</h3>
      {direccion ? (
        <address className="not-italic text-texto-primario">
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
        <p className="text-texto-tenue">{notaSiVacia}</p>
      )}
    </Tarjeta>
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
        <p className="text-sm text-texto-secundario">Sin documentos.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-borde">
          {documentos.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div className="flex flex-col">
                <span className="font-medium">{ETIQUETA_TIPO_DOCUMENTO[doc.tipo]}</span>
                <span className="text-xs text-texto-secundario">
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
    <Button variante="fantasma" tamano="sm" onClick={ver} disabled={cargando}>
      {cargando ? '…' : 'Ver'}
    </Button>
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
    <Tarjeta>
      <form onSubmit={manejarEnvio} className="flex flex-col gap-2 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Tipo</span>
            <Select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoDocumentoCliente)}
              aria-label="Tipo de documento"
              className="w-auto"
            >
              {(Object.keys(ETIQUETA_TIPO_DOCUMENTO) as TipoDocumentoCliente[]).map((t) => (
                <option key={t} value={t}>
                  {ETIQUETA_TIPO_DOCUMENTO[t]}
                </option>
              ))}
            </Select>
          </label>
          <input
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
            className="text-sm"
          />
          <Button type="submit" tamano="sm" disabled={subiendo}>
            {subiendo ? 'Subiendo…' : 'Subir'}
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-peligro-texto">
            {error}
          </p>
        )}
      </form>
    </Tarjeta>
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
    <Tarjeta className="mx-4 mb-2 flex flex-wrap items-center gap-2 p-3 text-sm">
      <span className="font-medium">Tier manual (admin):</span>
      <Select
        value={tier}
        onChange={(e) => setTier(e.target.value as TierCliente)}
        aria-label="Tier manual"
        className="w-auto"
      >
        <option value="bronce">Bronce</option>
        <option value="plata">Plata</option>
        <option value="oro">Oro</option>
        <option value="platino">Platino</option>
      </Select>
      <Button onClick={asignar} disabled={enviando} tamano="sm">
        {enviando ? '…' : 'Asignar'}
      </Button>
      {mensaje && <span className="text-texto-secundario">{mensaje}</span>}
    </Tarjeta>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs text-texto-secundario">{etiqueta}</dt>
      <dd className="font-medium">{valor}</dd>
    </div>
  );
}
