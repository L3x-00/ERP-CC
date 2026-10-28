import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';

import { formatearMoneda } from '@/compartido/utilidades/formatear';
import type { DocumentoPropuesta } from './documento-propuesta';

const azul = '#16395f';
const azulSuave = '#eaf2fb';
const gris = '#5b6470';
const borde = '#d7dde5';

const estilos = StyleSheet.create({
  pagina: { padding: 42, fontFamily: 'Helvetica', fontSize: 9, color: '#152033' },
  encabezado: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: azul, paddingBottom: 14 },
  marca: { width: '55%' },
  nombreEmpresa: { fontSize: 17, fontFamily: 'Helvetica-Bold', color: azul },
  datoEmpresa: { marginTop: 2, color: gris },
  titulo: { fontSize: 20, fontFamily: 'Helvetica-Bold', textAlign: 'right', color: azul },
  folio: { marginTop: 5, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  meta: { marginTop: 3, textAlign: 'right', color: gris },
  bloque: { marginTop: 18 },
  etiqueta: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: gris, textTransform: 'uppercase' },
  cliente: { marginTop: 5, flexDirection: 'row', gap: 18 },
  columna: { flexGrow: 1, flexBasis: 0 },
  valor: { marginTop: 2 },
  tabla: { marginTop: 16, borderWidth: 1, borderColor: borde },
  fila: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: borde, minHeight: 27, alignItems: 'center' },
  cabeceraTabla: { backgroundColor: azul, color: '#ffffff', fontFamily: 'Helvetica-Bold' },
  codigo: { width: '13%', padding: 6 },
  descripcion: { width: '39%', padding: 6 },
  cantidad: { width: '12%', padding: 6, textAlign: 'right' },
  importe: { width: '18%', padding: 6, textAlign: 'right' },
  precio: { width: '18%', padding: 6, textAlign: 'right' },
  resumen: { marginTop: 14, alignItems: 'flex-end' },
  totalFila: { flexDirection: 'row', width: 210, justifyContent: 'space-between', paddingVertical: 3 },
  granTotal: { marginTop: 4, backgroundColor: azulSuave, padding: 8, fontFamily: 'Helvetica-Bold', fontSize: 11 },
  condiciones: { marginTop: 18, borderTopWidth: 1, borderTopColor: borde, paddingTop: 10, color: gris },
  pie: { position: 'absolute', left: 42, right: 42, bottom: 26, fontSize: 8, color: gris, flexDirection: 'row', justifyContent: 'space-between' },
});

function moneda(valor: number, codigo: DocumentoPropuesta['moneda']): string {
  return formatearMoneda(valor, codigo);
}

function PropuestaPdf({ documento }: { documento: DocumentoPropuesta }) {
  const empresa = documento.empresa;
  const nombreEmpresa = empresa.razonSocial || empresa.nombre;
  const fecha = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeZone: 'UTC' })
    .format(new Date(`${documento.fecha}T12:00:00.000Z`));

  return (
    <Document
      title={`${documento.titulo} ${documento.folioRevision}`}
      author={nombreEmpresa}
      subject="Documento comercial"
      creator="ORCA MFG ERP"
      creationDate={new Date('2000-01-01T00:00:00.000Z')}
      modificationDate={new Date('2000-01-01T00:00:00.000Z')}
    >
      <Page size="A4" style={estilos.pagina}>
        <View style={estilos.encabezado}>
          <View style={estilos.marca}>
            <Text style={estilos.nombreEmpresa}>{nombreEmpresa}</Text>
            {empresa.rfc ? <Text style={estilos.datoEmpresa}>RFC: {empresa.rfc}</Text> : null}
            {[empresa.direccion, empresa.telefono, empresa.email].filter(Boolean).map((dato) => <Text key={dato} style={estilos.datoEmpresa}>{dato}</Text>)}
          </View>
          <View>
            <Text style={estilos.titulo}>{documento.titulo.toUpperCase()}</Text>
            <Text style={estilos.folio}>{documento.folioRevision}</Text>
            <Text style={estilos.meta}>Fecha: {fecha}</Text>
            <Text style={estilos.meta}>Moneda: {documento.moneda}</Text>
          </View>
        </View>

        <View style={estilos.bloque}>
          <Text style={estilos.etiqueta}>Cliente</Text>
          <View style={estilos.cliente}>
            <View style={estilos.columna}>
              <Text style={estilos.valor}>{documento.cliente.razonSocial || documento.cliente.nombreComercial || 'Cliente no registrado'}</Text>
              {documento.cliente.rfc ? <Text style={estilos.meta}>RFC: {documento.cliente.rfc}</Text> : null}
              {documento.cliente.correo ? <Text style={estilos.meta}>{documento.cliente.correo}</Text> : null}
            </View>
            {documento.contacto ? <View style={estilos.columna}>
              <Text style={estilos.etiqueta}>Contacto</Text>
              <Text style={estilos.valor}>{[documento.contacto.nombre, documento.contacto.correo, documento.contacto.telefono].filter(Boolean).join(' · ') || '—'}</Text>
            </View> : null}
          </View>
        </View>

        <View style={estilos.tabla}>
          <View style={[estilos.fila, estilos.cabeceraTabla]} fixed>
            <Text style={estilos.codigo}>Código</Text><Text style={estilos.descripcion}>Descripción</Text><Text style={estilos.cantidad}>Cant.</Text><Text style={estilos.precio}>P. unitario</Text><Text style={estilos.importe}>Importe</Text>
          </View>
          {documento.items.map((item) => <View key={item.codigo} style={estilos.fila} wrap={false}>
            <Text style={estilos.codigo}>{item.codigo}</Text><Text style={estilos.descripcion}>{item.descripcion}</Text><Text style={estilos.cantidad}>{item.cantidad.toLocaleString('es-MX', { maximumFractionDigits: 2 })}</Text><Text style={estilos.precio}>{moneda(item.precioUnitario, documento.moneda)}</Text><Text style={estilos.importe}>{moneda(item.importe, documento.moneda)}</Text>
          </View>)}
        </View>

        <View style={estilos.resumen}>
          <View style={estilos.totalFila}><Text>Subtotal</Text><Text>{moneda(documento.totales.subtotal, documento.moneda)}</Text></View>
          <View style={estilos.totalFila}><Text>IVA ({documento.totales.ivaPorcentaje}%)</Text><Text>{moneda(documento.totales.iva, documento.moneda)}</Text></View>
          <View style={[estilos.totalFila, estilos.granTotal]}><Text>Total</Text><Text>{moneda(documento.totales.total, documento.moneda)}</Text></View>
        </View>
        {(documento.condicionesPago || documento.plazoComercial) ? <View style={estilos.condiciones}>
          {documento.condicionesPago ? <Text>Condiciones de pago: {documento.condicionesPago}</Text> : null}
          {documento.plazoComercial ? <Text>Plazo comercial: {documento.plazoComercial}</Text> : null}
        </View> : null}
        <View style={estilos.pie} fixed><Text>Documento comercial generado por ORCA MFG ERP</Text><Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} /></View>
      </Page>
    </Document>
  );
}

export async function generarPdfPropuestaProfesional(documento: DocumentoPropuesta): Promise<Buffer> {
  return Buffer.from(await renderToBuffer(<PropuestaPdf documento={documento} />));
}
