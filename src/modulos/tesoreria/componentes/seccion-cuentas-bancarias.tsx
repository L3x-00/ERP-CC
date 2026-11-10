'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import {
  Tabla,
  TablaCelda,
  TablaContenedor,
  TablaCuerpo,
  TablaEncabezado,
  TablaEncabezadoCelda,
  TablaFila,
} from '@/compartido/componentes/diseno/tabla';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';
import {
  crearActualizarCuentaBancariaAccion,
  obtenerCuentasBancariasAccion,
} from '@/modulos/configuracion/acciones/indice';
import type { CuentaBancaria } from '@/modulos/configuracion/tipos/indice';

const CLAVE_CUENTAS_BANCARIAS = ['configuracion', 'cuentas-bancarias-admin'] as const;

type FormularioCuenta = {
  banco: string;
  numeroCuenta: string;
  clabe: string;
  moneda: 'MXN' | 'USD';
  titular: string;
  activa: boolean;
};

const FORMULARIO_VACIO: FormularioCuenta = {
  banco: '',
  numeroCuenta: '',
  clabe: '',
  moneda: 'MXN',
  titular: '',
  activa: true,
};

/**
 * UI-02: administración de cuentas bancarias dentro de Cobros y tesorería.
 * Reutiliza la acción y el servicio existentes; el permiso `configuracion` se
 * sigue exigiendo en el servidor y esta sección solo se ofrece a quien lo tiene.
 */
export function SeccionCuentasBancarias() {
  const clienteQuery = useQueryClient();
  const consulta = useQuery({
    queryKey: CLAVE_CUENTAS_BANCARIAS,
    queryFn: async (): Promise<CuentaBancaria[]> => {
      const respuesta = await obtenerCuentasBancariasAccion();
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'Cuentas ausentes' : respuesta.error);
      }
      return respuesta.datos;
    },
    staleTime: 0,
  });

  if (consulta.isPending) {
    return <SkeletonTabla filas={4} columnas={6} />;
  }

  if (consulta.isError || !consulta.data) {
    return (
      <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-borde bg-superficie-2 p-3 text-sm text-peligro-texto">
        No se pudieron cargar las cuentas bancarias.
        <Button type="button" variante="contorno" tamano="sm" onClick={() => void consulta.refetch()}>
          Reintentar
        </Button>
      </div>
    );
  }

  return (
    <CuentasBancariasAdmin
      datos={consulta.data}
      onGuardado={(cuenta) => {
        clienteQuery.setQueryData<CuentaBancaria[]>(CLAVE_CUENTAS_BANCARIAS, (actual) => {
          if (!actual) return [cuenta];
          return actual.some((item) => item.id === cuenta.id)
            ? actual.map((item) => (item.id === cuenta.id ? cuenta : item))
            : [...actual, cuenta];
        });
      }}
    />
  );
}

function CuentasBancariasAdmin({
  datos,
  onGuardado,
}: {
  datos: readonly CuentaBancaria[];
  onGuardado: (cuenta: CuentaBancaria) => void;
}) {
  const [dialogoAbierto, setDialogoAbierto] = useState(false);
  const [seleccionada, setSeleccionada] = useState<CuentaBancaria | null>(null);
  const [formulario, setFormulario] = useState<FormularioCuenta>(FORMULARIO_VACIO);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function abrirNueva(): void {
    setSeleccionada(null);
    setFormulario(FORMULARIO_VACIO);
    setMensaje(null);
    setError(null);
    setDialogoAbierto(true);
  }

  function abrirEdicion(cuenta: CuentaBancaria): void {
    setSeleccionada(cuenta);
    setFormulario({
      banco: cuenta.banco,
      numeroCuenta: cuenta.numeroCuenta,
      clabe: cuenta.clabe ?? '',
      moneda: cuenta.moneda,
      titular: cuenta.titular,
      activa: cuenta.activa,
    });
    setMensaje(null);
    setError(null);
    setDialogoAbierto(true);
  }

  function cambiarDialogo(abierto: boolean): void {
    if (guardando) return;
    setDialogoAbierto(abierto);
    if (!abierto) {
      setError(null);
      setSeleccionada(null);
      setFormulario(FORMULARIO_VACIO);
    }
  }

  async function guardar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setGuardando(true);
    setMensaje(null);
    setError(null);
    try {
      const respuesta = await crearActualizarCuentaBancariaAccion({
        id: seleccionada?.id,
        ...formulario,
        clabe: formulario.clabe || null,
      });
      if (!respuesta.exito || !respuesta.datos) {
        setError(respuesta.exito ? 'No se recibió la cuenta actualizada' : respuesta.error);
        return;
      }
      onGuardado(respuesta.datos);
      setMensaje('Cuenta guardada');
      setDialogoAbierto(false);
      setSeleccionada(null);
      setFormulario(FORMULARIO_VACIO);
    } catch {
      setError('No se pudo guardar la cuenta');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section className="grid gap-4" aria-labelledby="titulo-cuentas-bancarias" data-testid="seccion-cuentas-bancarias">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="titulo-cuentas-bancarias" className="text-lg font-semibold text-texto-primario">
            Cuentas bancarias
          </h2>
          <p className="text-sm text-texto-secundario">
            Cuentas que se asocian a cobranza y pagos. Solo los usuarios con permiso de
            configuración pueden administrarlas.
          </p>
        </div>
        <Button type="button" tamano="lg" variante="contorno" onClick={abrirNueva} data-testid="nueva-cuenta-bancaria">
          Nueva cuenta
        </Button>
      </div>

      {datos.length === 0 ? (
        <EstadoVacio
          titulo="Sin cuentas bancarias"
          descripcion="Registra una cuenta para asociarla a cobranza y pagos."
        />
      ) : (
        <TablaContenedor>
          <Tabla className="min-w-[620px]">
            <caption className="sr-only">Cuentas bancarias configuradas</caption>
            <TablaEncabezado>
              <tr>
                <TablaEncabezadoCelda>Banco</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Número</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Moneda</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Titular</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>Estado</TablaEncabezadoCelda>
                <TablaEncabezadoCelda>
                  <span className="sr-only">Acción</span>
                </TablaEncabezadoCelda>
              </tr>
            </TablaEncabezado>
            <TablaCuerpo>
              {datos.map((cuenta) => (
                <TablaFila key={cuenta.id} className="h-12" data-testid={`cuenta-fila-${cuenta.id}`}>
                  <TablaCelda>{cuenta.banco}</TablaCelda>
                  <TablaCelda className="font-mono">{cuenta.numeroCuenta}</TablaCelda>
                  <TablaCelda>{cuenta.moneda}</TablaCelda>
                  <TablaCelda>{cuenta.titular}</TablaCelda>
                  <TablaCelda>
                    <BadgeEstado estado={cuenta.activa ? 'activo' : 'inactivo'} />
                  </TablaCelda>
                  <TablaCelda>
                    <Button
                      tamano="sm"
                      variante="fantasma"
                      onClick={() => abrirEdicion(cuenta)}
                      aria-label={`Editar ${cuenta.banco}`}
                    >
                      Editar
                    </Button>
                  </TablaCelda>
                </TablaFila>
              ))}
            </TablaCuerpo>
          </Tabla>
        </TablaContenedor>
      )}

      {mensaje ? (
        <p role="status" data-testid="cuentas-bancarias-mensaje" className="text-sm text-exito-texto">
          {mensaje}
        </p>
      ) : null}

      <Dialog open={dialogoAbierto} onOpenChange={cambiarDialogo}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {seleccionada ? `Editar ${seleccionada.banco}` : 'Nueva cuenta bancaria'}
            </DialogTitle>
            <DialogDescription>
              {seleccionada
                ? 'Actualiza los datos de la cuenta seleccionada.'
                : 'Registra los datos de la cuenta que se usará en cobranza y pagos.'}
            </DialogDescription>
          </DialogHeader>

          <form id="formulario-cuenta-bancaria" className="grid gap-3" onSubmit={(evento) => void guardar(evento)} aria-label="Editor de cuenta bancaria">
            <div className="grid gap-1.5">
              <Label htmlFor="configuracion-banco" obligatorio>Banco</Label>
              <Input id="configuracion-banco" value={formulario.banco} onChange={(e) => setFormulario((v) => ({ ...v, banco: e.target.value }))} required maxLength={120} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="configuracion-numero-cuenta" obligatorio>Número de cuenta</Label>
              <Input id="configuracion-numero-cuenta" value={formulario.numeroCuenta} onChange={(e) => setFormulario((v) => ({ ...v, numeroCuenta: e.target.value }))} required maxLength={50} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="configuracion-clabe">CLABE (opcional)</Label>
              <Input id="configuracion-clabe" inputMode="numeric" value={formulario.clabe} onChange={(e) => setFormulario((v) => ({ ...v, clabe: e.target.value }))} maxLength={18} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="configuracion-moneda">Moneda</Label>
              <Select id="configuracion-moneda" value={formulario.moneda} onChange={(e) => setFormulario((v) => ({ ...v, moneda: e.target.value as 'MXN' | 'USD' }))}>
                <option value="MXN">MXN</option>
                <option value="USD">USD</option>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="configuracion-titular" obligatorio>Titular</Label>
              <Input id="configuracion-titular" value={formulario.titular} onChange={(e) => setFormulario((v) => ({ ...v, titular: e.target.value }))} required maxLength={160} />
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={formulario.activa} onChange={(e) => setFormulario((v) => ({ ...v, activa: e.target.checked }))} />
              Cuenta activa
            </label>
            {error ? (
              <p role="alert" data-testid="cuentas-bancarias-error" className="text-sm text-peligro-texto">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="button" variante="contorno" onClick={() => cambiarDialogo(false)} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" form="formulario-cuenta-bancaria" disabled={guardando} data-testid="guardar-cuenta-bancaria">
                {guardando ? 'Guardando…' : 'Guardar cuenta'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
