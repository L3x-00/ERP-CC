'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { crearClienteAccion } from '@/modulos/clientes/acciones/crear-cliente';
import { clienteRfqDesdeAlta } from '@/modulos/pipeline/servicios/cliente-rfq-alta';
import type { ClienteRfq, CondicionesPago } from '@/modulos/pipeline/tipos/indice';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';

type Props = {
  /** Texto ya capturado en la RFQ (empresa) para precargar la razón social. */
  nombreSugerido?: string;
  contactoSugerido?: string;
  correoSugerido?: string;
  telefonoSugerido?: string;
  onCreado: (cliente: ClienteRfq) => void;
  onCancelar: () => void;
};

/**
 * Alta rápida de cliente desde la RFQ — RFQ-02. Captura el mínimo que el
 * catálogo exige y devuelve el cliente ya creado para seleccionarlo sin salir
 * de la cotización (el borrador vive en el componente padre y no se pierde).
 *
 * No reutiliza `FormularioCliente` a propósito: aquel pide direcciones y límite
 * de crédito (que exige `ver_finanzas`) y su `onExito` no devuelve el id del
 * cliente creado, que es justo lo que la RFQ necesita para ligarlo. La
 * autorización, la validación y la deduplicación siguen siendo las del módulo de
 * Clientes: esto solo llama a `crearClienteAccion`.
 *
 * El cliente nace como `prospecto`: al ganar la oportunidad, la promoción
 * (`promoverAClienteSiNoExiste`) lo pasa a `activo`.
 */
export function AltaRapidaCliente({
  nombreSugerido = '',
  contactoSugerido = '',
  correoSugerido = '',
  telefonoSugerido = '',
  onCreado,
  onCancelar,
}: Props) {
  const clienteConsultas = useQueryClient();
  const [razonSocial, setRazonSocial] = useState(nombreSugerido);
  const [nombreComercial, setNombreComercial] = useState(nombreSugerido);
  const [rfc, setRfc] = useState('');
  const [contacto, setContacto] = useState(contactoSugerido);
  const [correo, setCorreo] = useState(correoSugerido);
  const [telefono, setTelefono] = useState(telefonoSugerido);
  const [condicionesPago, setCondicionesPago] = useState<CondicionesPago | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function crear(): Promise<void> {
    setError(null);
    setEnviando(true);
    try {
      const respuesta = await crearClienteAccion({
        razonSocial,
        // El nombre comercial es obligatorio en el catálogo; si no se captura,
        // el alta rápida usa la razón social en vez de rechazar la RFQ.
        nombreComercial: nombreComercial.trim() ? nombreComercial : razonSocial,
        rfc,
        contacto,
        correo,
        telefono,
        ...(condicionesPago !== '' ? { condicionesPago } : {}),
        estado: 'prospecto' as const,
      });

      if (!respuesta.exito) {
        setError(respuesta.error);
        return;
      }
      if (!respuesta.datos) {
        setError('No se pudo crear el cliente');
        return;
      }

      await clienteConsultas.invalidateQueries({ queryKey: ['clientes'] });
      onCreado(
        clienteRfqDesdeAlta(respuesta.datos.id, {
          razonSocial,
          nombreComercial,
          rfc,
          contacto,
          correo,
          telefono,
          condicionesPago: condicionesPago === '' ? null : condicionesPago,
        }),
      );
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie-2 px-4 py-3">
      <span className="text-sm font-medium text-texto-primario">Nuevo cliente</span>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor="alta-rapida-razon">Razón social</Label>
          <Input
            id="alta-rapida-razon"
            type="text"
            value={razonSocial}
            onChange={(evento) => setRazonSocial(evento.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="alta-rapida-nombre">Nombre comercial (opcional)</Label>
          <Input
            id="alta-rapida-nombre"
            type="text"
            value={nombreComercial}
            onChange={(evento) => setNombreComercial(evento.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="alta-rapida-rfc">RFC (opcional)</Label>
          <Input
            id="alta-rapida-rfc"
            type="text"
            value={rfc}
            onChange={(evento) => setRfc(evento.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="alta-rapida-contacto">Contacto (opcional)</Label>
          <Input
            id="alta-rapida-contacto"
            type="text"
            value={contacto}
            onChange={(evento) => setContacto(evento.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="alta-rapida-correo">Correo (opcional)</Label>
          <Input
            id="alta-rapida-correo"
            type="email"
            value={correo}
            onChange={(evento) => setCorreo(evento.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="alta-rapida-telefono">Teléfono (opcional)</Label>
          <Input
            id="alta-rapida-telefono"
            type="tel"
            value={telefono}
            onChange={(evento) => setTelefono(evento.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1 sm:col-span-2">
          <Label htmlFor="alta-rapida-condiciones">Condiciones de pago (opcional)</Label>
          <Select
            id="alta-rapida-condiciones"
            value={condicionesPago}
            onChange={(evento) =>
              setCondicionesPago(evento.target.value as CondicionesPago | '')
            }
          >
            <option value="">Sin especificar</option>
            <option value="contado">Contado</option>
            <option value="15_dias">15 días</option>
            <option value="30_dias">30 días</option>
            <option value="credito">Crédito</option>
          </Select>
        </div>
      </div>

      {error !== null && (
        <p role="alert" className="text-xs text-peligro-texto">
          {error}
        </p>
      )}

      <div className="flex items-center gap-2">
        <Button type="button" tamano="sm" onClick={() => void crear()} disabled={enviando}>
          {enviando ? 'Creando…' : 'Crear y usar en la RFQ'}
        </Button>
        <Button
          type="button"
          variante="contorno"
          tamano="sm"
          onClick={onCancelar}
          disabled={enviando}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}
