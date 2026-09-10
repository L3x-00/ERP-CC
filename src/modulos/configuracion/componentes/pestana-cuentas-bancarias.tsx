'use client';

import { useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { crearActualizarCuentaBancariaAccion } from '@/modulos/configuracion/acciones/indice';
import type { CuentaBancaria } from '@/modulos/configuracion/tipos/indice';

export function PestanaCuentasBancarias({ datos, onGuardado }: { datos: readonly CuentaBancaria[]; onGuardado: (cuenta: CuentaBancaria) => void }) {
  const [seleccionada, setSeleccionada] = useState<CuentaBancaria | null>(null);
  const [formulario, setFormulario] = useState({ banco: '', numeroCuenta: '', clabe: '', moneda: 'MXN' as 'MXN' | 'USD', titular: '', activa: true });
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  function editar(cuenta: CuentaBancaria): void {
    setSeleccionada(cuenta);
    setFormulario({ banco: cuenta.banco, numeroCuenta: cuenta.numeroCuenta, clabe: cuenta.clabe ?? '', moneda: cuenta.moneda, titular: cuenta.titular, activa: cuenta.activa });
    setMensaje(null);
  }

  function nueva(): void {
    setSeleccionada(null);
    setFormulario({ banco: '', numeroCuenta: '', clabe: '', moneda: 'MXN', titular: '', activa: true });
    setMensaje(null);
  }

  async function guardar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const respuesta = await crearActualizarCuentaBancariaAccion({ id: seleccionada?.id, ...formulario, clabe: formulario.clabe || null });
      if (!respuesta.exito || !respuesta.datos) setMensaje(respuesta.exito ? 'No se recibió la cuenta actualizada' : respuesta.error);
      else { onGuardado(respuesta.datos); setMensaje('Cuenta guardada'); }
    } catch {
      setMensaje('No se pudo guardar la cuenta');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1.3fr_1fr]">
      <section aria-labelledby="titulo-cuentas-config" className="grid gap-3"><div className="flex items-center justify-between gap-2"><h2 id="titulo-cuentas-config" className="text-lg font-semibold">Cuentas bancarias</h2><Button tamano="sm" variante="contorno" onClick={nueva}>Nueva cuenta</Button></div><div className="overflow-x-auto rounded-base border border-foreground/15"><table className="w-full min-w-[620px] text-left text-sm"><caption className="sr-only">Cuentas bancarias configuradas</caption><thead className="border-b border-foreground/10 bg-foreground/5"><tr><th className="p-3">Banco</th><th className="p-3">Número</th><th className="p-3">Moneda</th><th className="p-3">Titular</th><th className="p-3">Estado</th><th className="p-3"><span className="sr-only">Acción</span></th></tr></thead><tbody>{datos.map((cuenta) => <tr key={cuenta.id} className="border-b border-foreground/10 last:border-0"><td className="p-3">{cuenta.banco}</td><td className="p-3 font-mono">{cuenta.numeroCuenta}</td><td className="p-3">{cuenta.moneda}</td><td className="p-3">{cuenta.titular}</td><td className="p-3">{cuenta.activa ? 'Activa' : 'Inactiva'}</td><td className="p-3"><Button tamano="sm" variante="fantasma" onClick={() => editar(cuenta)}>Editar</Button></td></tr>)}</tbody></table></div></section>
      <form className="grid content-start gap-3 rounded-base border border-foreground/15 p-4" onSubmit={guardar} aria-label="Editor de cuenta bancaria"><h2 className="text-lg font-semibold">{seleccionada ? `Editar ${seleccionada.banco}` : 'Nueva cuenta'}</h2><label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-banco">Banco<Input id="configuracion-banco" value={formulario.banco} onChange={(e) => setFormulario((v) => ({ ...v, banco: e.target.value }))} required maxLength={120} /></label><label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-numero-cuenta">Número de cuenta<Input id="configuracion-numero-cuenta" value={formulario.numeroCuenta} onChange={(e) => setFormulario((v) => ({ ...v, numeroCuenta: e.target.value }))} required maxLength={50} /></label><label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-clabe">CLABE (opcional)<Input id="configuracion-clabe" inputMode="numeric" value={formulario.clabe} onChange={(e) => setFormulario((v) => ({ ...v, clabe: e.target.value }))} maxLength={18} /></label><label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-moneda">Moneda<Select id="configuracion-moneda" value={formulario.moneda} onChange={(e) => setFormulario((v) => ({ ...v, moneda: e.target.value as 'MXN' | 'USD' }))}><option value="MXN">MXN</option><option value="USD">USD</option></Select></label><label className="grid gap-1 text-sm font-medium" htmlFor="configuracion-titular">Titular<Input id="configuracion-titular" value={formulario.titular} onChange={(e) => setFormulario((v) => ({ ...v, titular: e.target.value }))} required maxLength={160} /></label><label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={formulario.activa} onChange={(e) => setFormulario((v) => ({ ...v, activa: e.target.checked }))} /> Cuenta activa</label><div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cuenta'}</Button>{mensaje ? <p role="status" className="text-sm text-foreground/70">{mensaje}</p> : null}</div></form>
    </div>
  );
}
