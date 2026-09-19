import { expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';
import { obtenerHistorialCuentaServicio, obtenerCuentasBancariasActivasServicio, obtenerReciboPagoServicio } from '@/modulos/cobranza/servicios/historial-cobranza-servicio';
import { obtenerResumenCarteraServicio } from '@/modulos/cobranza/servicios/cobranza-servicio';
const cuenta={id:'ar1',cliente_id:'cliente1',orden_id:'op1',folio_factura_remision:null,monto_total:100,saldo_pendiente:20,moneda:'MXN',estado:'parcial',fecha_emision:'2026-09-01T12:00:00Z',fecha_vencimiento:'2026-09-30T12:00:00Z'};
const pago={id:'pago1',ar_id:'ar1',folio_recibo:'REC-000001',solicitud_id:'sol1',monto_pagado:5,moneda_pago:'USD',tipo_cambio_pago:20,monto_aplicado_ar:80,monto_sobrepago_ar:20,metodo_pago:'transferencia',referencia_bancaria:'Ref',cuenta_bancaria_id:null,notas:null,creado_por:'usuario1',creado_en:'2026-09-14T12:00:00Z'};
function clienteFalso(responder:(tabla:string, filtros:Record<string,unknown>)=>unknown){
 const llamadas:{tabla:string;filtros:Record<string,unknown>}[]=[];
 const from=vi.fn((tabla:string)=>{const filtros:Record<string,unknown>={};llamadas.push({tabla,filtros});const cadena={select:vi.fn((columnas:string)=>{filtros.columnas=columnas;return cadena;}),eq:vi.fn((clave:string,valor:unknown)=>{filtros[clave]=valor;return cadena;}),order:vi.fn(()=>cadena),range:vi.fn((desde:number,hasta:number)=>{filtros.rango=[desde,hasta];return cadena;}),maybeSingle:vi.fn(()=>cadena),then:(resolver:(valor:unknown)=>unknown)=>Promise.resolve(responder(tabla,filtros)).then(resolver)};return cadena;});
 return {cliente:{from} as unknown as SupabaseClient<Database>,llamadas};
}
it('rechaza cliente que no corresponde antes de leer sus pagos',async()=>{const {cliente,llamadas}=clienteFalso(()=>({data:cuenta}));await expect(obtenerHistorialCuentaServicio(cliente,{arId:'ar1',clienteId:'ajeno'})).rejects.toThrow('cuenta_cliente_no_corresponde');expect(llamadas).toHaveLength(1);});
it('consulta cada página con filtro de dueño y total real',async()=>{
 const {cliente,llamadas}=clienteFalso(tabla=>({data:tabla==='cuentas_por_cobrar'?cuenta:tabla==='clientes'?{nombre_comercial:'QA',razon_social:'Empresa'}:tabla==='ordenes_produccion'?{folio:'OP-1'}:[],count:tabla==='pagos_ar'?43:0}));
 const resultado=await obtenerHistorialCuentaServicio(cliente,{arId:'ar1',clienteId:'cliente1',paginaPagos:2,paginaMovimientos:3});expect(resultado.pagos.total).toBe(43);
 expect(llamadas.find(x=>x.tabla==='pagos_ar')?.filtros).toMatchObject({ar_id:'ar1',rango:[20,39]});expect(llamadas.find(x=>x.tabla==='movimientos_saldo_favor')?.filtros).toMatchObject({cliente_id:'cliente1',rango:[40,59]});
});
it('recibo conserva moneda pagada, aplicado y saldo actual como magnitudes distintas',async()=>{
 const {cliente}=clienteFalso(tabla=>({data:tabla==='pagos_ar'?pago:tabla==='cuentas_por_cobrar'?cuenta:tabla==='clientes'?{nombre_comercial:'QA',razon_social:'Empresa'}:tabla==='ordenes_produccion'?{folio:'OP-1'}:[{id:'mov1',monto:20}],count:1}));
 const recibo=await obtenerReciboPagoServicio(cliente,{pagoId:'pago1'});expect(recibo).toMatchObject({montoPagado:5,monedaPago:'USD',tipoCambioPago:20,montoAplicadoAr:80,monedaCuenta:'MXN',creditoMonederoMxn:20,saldoActualCuenta:20});
});
it('lista todas las opciones bancarias sin consultar datos bancarios completos',async()=>{
 const rpc=vi.fn().mockResolvedValueOnce({data:Array.from({length:100},(_,i)=>({id:String(i),banco:'QA',numero_cuenta_enmascarado:'••••1234',moneda:'MXN',titular:'QA'}))}).mockResolvedValueOnce({data:[{id:'101',banco:'QA',numero_cuenta_enmascarado:'••••5678',moneda:'MXN',titular:'QA'}]});
 const resultado=await obtenerCuentasBancariasActivasServicio({rpc} as unknown as SupabaseClient<Database>,{moneda:'MXN'});expect(resultado).toHaveLength(101);expect(rpc).toHaveBeenLastCalledWith('consultar_bancos_cobranza',{p_moneda:'MXN',p_desde:100});expect(resultado[100].numeroCuentaEnmascarado).toBe('••••5678');
});
it('no presenta falla de bancos como catálogo vacío',async()=>{const rpc=vi.fn().mockResolvedValue({error:{message:'Sin permiso'}});await expect(obtenerCuentasBancariasActivasServicio({rpc} as unknown as SupabaseClient<Database>)).rejects.toThrow('Sin permiso');});
it('cartera de más de1000 cuentas conserva el total y contexto con lotes pequeños',async()=>{
 const filas=Array.from({length:1050},(_,i)=>({...cuenta,id:`ar${i}`,orden_id:`op${i}`,tipo_cambio_origen:1,creado_en:cuenta.fecha_emision,actualizado_en:cuenta.fecha_emision}));
 const rangos:number[][]=[];const lotes:number[]=[];
 const from=vi.fn((tabla:string)=>{let ids:string[]=[];let rango=[0,199];const consulta={select:()=>consulta,order:()=>consulta,in:(_clave:string,valores:string[])=>{ids=valores;lotes.push(ids.length);return consulta;},range:(desde:number,hasta:number)=>{rango=[desde,hasta];rangos.push(rango);return consulta;},then:(resolve:(valor:unknown)=>unknown)=>Promise.resolve({data:tabla==='cuentas_por_cobrar'?filas.slice(rango[0],rango[1]+1):tabla==='clientes'?ids.map(id=>({id,nombre_comercial:'QA',razon_social:'QA',saldo_a_favor:0})):ids.map(id=>({id,folio:id.toUpperCase(),estado:'completada'})),count:1050}).then(resolve)};return consulta;});
 const resultado=await obtenerResumenCarteraServicio({from} as unknown as SupabaseClient<Database>,{fechaReferencia:'2026-09-14T12:00:00Z'});
 expect(resultado.cuentas).toHaveLength(1050);expect(resultado.cuentas[1049].folioOrden).toBe('OP1049');expect(resultado.totalPendienteMxn).toBe(21000);expect(rangos).toHaveLength(6);expect(Math.max(...lotes)).toBe(100);
});
