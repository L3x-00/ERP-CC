import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from '@react-pdf/renderer';

import type { DocumentoNotaEntrega } from '@/modulos/produccion/servicios/nota-entrega-documento-servicio';

const azul = '#16395f';
const azulSuave = '#eaf2fb';
const gris = '#5b6470';
const borde = '#d7dde5';

const estilos = StyleSheet.create({
  pagina: { padding: 42, fontFamily: 'Helvetica', fontSize: 9, color: '#152033' },
  encabezado: {
    flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2,
    borderBottomColor: azul, paddingBottom: 14,
  },
  marca: { width: '55%' },
  nombreEmpresa: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: azul },
  datoEmpresa: { marginTop: 2, color: gris },
  titulo: { fontSize: 20, fontFamily: 'Helvetica-Bold', textAlign: 'right', color: azul },
  folio: { marginTop: 5, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  meta: { marginTop: 3, textAlign: 'right', color: gris },
  bloque: { marginTop: 18 },
  etiqueta: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: gris, textTransform: 'uppercase' },
  valor: { marginTop: 3 },
  aviso: { marginTop: 14, backgroundColor: azulSuave, borderLeftWidth: 3, borderLeftColor: azul, padding: 8 },
  tabla: { marginTop: 16, borderWidth: 1, borderColor: borde },
  fila: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: borde, minHeight: 27, alignItems: 'center' },
  cabeceraTabla: { backgroundColor: azul, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  codigo: { width: '17%', padding: 6 },
  descripcion: { width: '35%', padding: 6 },
  cantidad: { width: '16%', padding: 6, textAlign: 'right' },
  acumulado: { width: '18%', padding: 6, textAlign: 'right' },
  solicitado: { width: '14%', padding: 6, textAlign: 'right' },
  resumen: { marginTop: 12, alignItems: 'flex-end', color: gris },
  firma: { marginTop: 44, flexDirection: 'row', justifyContent: 'space-between' },
  bloqueFirma: { width: '42%', borderTopWidth: 1, borderTopColor: '#152033', paddingTop: 6, textAlign: 'center' },
  pie: {
    position: 'absolute', left: 42, right: 42, bottom: 26, fontSize: 8, color: gris,
    flexDirection: 'row', justifyContent: 'space-between',
  },
});

function fechaDocumento(fecha: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(fecha));
}

function numero(valor: number): string {
  return new Intl.NumberFormat('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor);
}

/** PDF de consulta y conformidad; no contiene precios ni sustituye un CFDI. */
export function NotaEntregaPdfProfesional({ documento }: { documento: DocumentoNotaEntrega }) {
  const empresa = documento.empresa;
  const nombreEmpresa = empresa.razonSocial || empresa.nombre;

  return (
    <Document
      title={`Nota de entrega ${documento.nota.folio}`}
      author={nombreEmpresa}
      subject="Conformidad de entrega"
      creator="ORCA MFG ERP"
    >
      <Page size="A4" style={estilos.pagina}>
        <View style={estilos.encabezado}>
          <View style={estilos.marca}>
            <Text style={estilos.nombreEmpresa}>{nombreEmpresa}</Text>
            {empresa.rfc ? <Text style={estilos.datoEmpresa}>RFC: {empresa.rfc}</Text> : null}
            {[empresa.direccion, empresa.telefono, empresa.email].filter(Boolean).map((dato) => (
              <Text key={dato} style={estilos.datoEmpresa}>{dato}</Text>
            ))}
          </View>
          <View>
            <Text style={estilos.titulo}>NOTA DE ENTREGA</Text>
            <Text style={estilos.folio}>{documento.nota.folio}</Text>
            <Text style={estilos.meta}>{documento.nota.esParcial ? 'Entrega parcial' : 'Entrega total'}</Text>
            <Text style={estilos.meta}>Fecha: {fechaDocumento(documento.nota.creadoEn)}</Text>
            <Text style={estilos.meta}>Orden: {documento.orden.folio}</Text>
          </View>
        </View>

        <View style={estilos.bloque}>
          <Text style={estilos.etiqueta}>Cliente</Text>
          <Text style={estilos.valor}>{documento.orden.clienteRazonSocial || 'Cliente no registrado'}</Text>
          {documento.orden.clienteRfc ? <Text style={estilos.datoEmpresa}>RFC: {documento.orden.clienteRfc}</Text> : null}
        </View>

        <View style={estilos.aviso}>
          <Text>Este documento confirma las piezas entregadas. No contiene precios ni sustituye un comprobante fiscal.</Text>
        </View>

        <View style={estilos.tabla}>
          <View style={[estilos.fila, estilos.cabeceraTabla]} fixed>
            <Text style={estilos.codigo}>Código</Text>
            <Text style={estilos.descripcion}>Descripción</Text>
            <Text style={estilos.cantidad}>Esta nota</Text>
            <Text style={estilos.acumulado}>Entregado</Text>
            <Text style={estilos.solicitado}>Solicitado</Text>
          </View>
          {documento.lineas.map((linea) => (
            <View key={linea.codigoPieza} style={estilos.fila} wrap={false}>
              <Text style={estilos.codigo}>{linea.codigoPieza}</Text>
              <Text style={estilos.descripcion}>{linea.descripcion || '—'}</Text>
              <Text style={estilos.cantidad}>{numero(linea.cantidadNota)} {linea.unidadMedida}</Text>
              <Text style={estilos.acumulado}>{numero(linea.entregadoAcumulado)}</Text>
              <Text style={estilos.solicitado}>{numero(linea.cantidadSolicitada)}</Text>
            </View>
          ))}
        </View>

        <View style={estilos.resumen}>
          <Text>Total de esta nota: {numero(documento.totalNota)} pieza(s)</Text>
          <Text>Acumulado: {numero(documento.totalAcumulado)} de {numero(documento.totalSolicitado)}</Text>
        </View>

        <View style={estilos.firma} wrap={false}>
          <Text style={estilos.bloqueFirma}>Recibido por: {documento.nota.recibidoPor}</Text>
          <Text style={estilos.bloqueFirma}>Entregado por: {nombreEmpresa}</Text>
        </View>
        {documento.nota.firmaClienteUrl ? <Text style={[estilos.meta, { marginTop: 8 }]}>Firma de conformidad registrada electrónicamente.</Text> : null}
        <View style={estilos.pie} fixed>
          <Text>Documento generado por ORCA MFG ERP</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
