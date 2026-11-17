# Cobro y cierre

```json
[
  {
    "paso": "login",
    "resultado": "ok",
    "detalle": null
  },
  {
    "paso": "cobro",
    "resultado": "ok",
    "detalle": {
      "estado": "INVCNC-0000033 O-1126_07 Taller QA QA1711 Estado de cuenta 17/12/2026 $128,470.00 $128,470.00 Cerrada Pendiente Historial Factura Promesa Cobrar",
      "rec": null,
      "cola": "CNC-0000033 O-1126_07 Taller QA QA1711 Estado de cuenta 17/12/2026 $128,470.00 $128,470.00 Cerrada Pendiente Historial Factura Promesa Cobrar INVCNC-0000031 O-1126_05 Carso Estado de cuenta Por entregar $17,400.00 $17,400.00 Planificada No cobrable Pendiente Historial Factura Promesa Cobrar INVCNC-0000029 O-1126_03 APN Manufacturing Estado de cuenta Por entregar $57,782.50 $57,782.50 En producción No cobrable Pendiente Historial Factura Promesa Cobrar Factura de INVCNC-0000033 Taller QA QA1711 · O-1126_07 · $128,470.00. La cuenta ya está vinculada a esta orden; aquí se registra su número fiscal. Número de factura o remisión Fecha de vencimiento Cancelar Guardando… Guardar y registrar abono ×"
    }
  },
  {
    "paso": "cierre-administrativo",
    "resultado": "ok",
    "detalle": {
      "detalle": "Cierre O-1126_07\n\nTaller QA QA1711 · 17 de noviembre de 2026\n\nCOSTO ESTIMADO\n$5,450.13\nCOSTO REAL\n$3,523.13\nDESVIACIÓN\n-35,4 %\nMARGEN\n+96,8 %\nHORAS COTIZADAS\n6.3 h\nHORAS REALES\n0.0 h\nENTREGADO\n75.00 de 75.00\nRETRABAJO\n0.0 h · $0.00\n\nCotizaste 6.3 h y usaste 0.0 h: estás cotizando 100 % de más en tiempo.\n\nPor ítem\nÍTEM\tCANT.\tPRODUCIDO\tENTREGADO\tHORAS EST./REAL\tCOSTO EST./REAL\tΔ\nIT01\nSoporte metálico SM-2026-02\n\t50.00\t50.00\t50.00\t4.3 h / 0.0 h\t$2,178.13 / $3,203.13\t+47,1 %\nIT02\nPanel decorativo MDF-12\n\t25.00\t25.00\t25.00\t2.0 h / 0.0 h\t$1,700.00 / $320.00\t-81,2 %\nPor proceso\nCNC ROUTER\n2.0 h / 0.0 h · -100,0 %\nCorte laser\n2.5 h / 0.0 h · -99,6 %\nDOBLADO_CNC\n1.8 h / 0.0 h · -100,0 %\nCosto\nMano de obra\n$3,878.13 → $5.13 (-99,9 %)\nMaterial\n$1,250.00 → $3,518.00 (+181,4 %)\nOtros\n$322.00 → $0.00 (-100,0 %)\nMaterial real\nCRS-14 · Acero al carbón calibre 14\n5.200 m2 · $3,198.00\nMDF-12 · MDF 12 mm\n1.000 m2 · $320.00\nPuntos críticos\nTiempo: 0.0 h reales contra 6.3 h cotizadas (100 % menos; estás cotizando de más).\nMaterial: gastaste $3,518.00 contra $1,250.00 estimados (181 % más).\nMargen real: 96.8 % sobre la venta.\nCerrar\n×",
      "botones": [
        "Cerrar",
        "×"
      ],
      "habia": false
    }
  },
  {
    "paso": "modificar-nota-entrega",
    "resultado": "ok",
    "detalle": {
      "habia": false
    }
  }
]
```
