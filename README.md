# sii-engine

Motor de Facturación Electrónica SII para Chile — librería TypeScript modular.

Construida según el RFC "Motor propio de Facturación Electrónica SII directo" para ser usada de forma embebida en proyectos NestJS u otros backends Node.js, sin depender de servicios intermedios.

---

## Características

- **Tipos TypeScript completos** para todos los dominios fiscales
- **Constructores XML** para DTE (33, 39, 56, 61), TED, EnvioDTE, EnvioBOLETA, RVD y RespuestaDTE
- **Firma XMLDSig** conforme al estándar del SII (SHA1withRSA)
- **Firma TED** con clave privada del CAF
- **Carga de certificados** desde P12 (.pfx) y PEM
- **Autenticación SII** automática (semilla → token) con caché
- **Gestión de CAF y folios** con FolioManager
- **Transporte separado** por familia técnica SII: DTE legacy (SOAP/multipart) y Boleta REST
- **Taxonomía completa de estados**: RSC, SOK, CRT, RCT, EPR, RFR, PRD (envío) y DOK, DNK, FAU, FNA, FAN, EMP, TMD, TMC, MMD, NNC, AND, ANC (DTE)
- **Jerarquía de errores tipados**: `SiiCafError`, `SiiCertError`, `SiiSignError`, `SiiSendError`

### DTEs soportados (MVP)

| Tipo | Descripción |
|------|-------------|
| 33   | Factura Electrónica |
| 39   | Boleta Electrónica |
| 56   | Nota de Débito |
| 61   | Nota de Crédito |

---

## Instalación

### Opción A — Desde paquete local (desarrollo)

```bash
# 1. Clonar o copiar la librería en tu máquina
git clone https://github.com/TESBrunoBRM/sii-engine.git
cd sii-engine

# 2. Instalar dependencias y compilar
npm install   # o pnpm install
npm run build # genera la carpeta dist/

# 3. En tu proyecto NestJS, instalar desde la ruta local
cd tu-proyecto-nestjs
npm install /ruta/absoluta/a/sii-engine
# o con pnpm:
pnpm add /ruta/absoluta/a/sii-engine
```

### Opción B — Desde tarball (sin publicar en npm)

```bash
# En el directorio del repo sii-engine:
npm run build
npm pack
# Genera: sii-engine-0.1.0.tgz

# En tu proyecto NestJS:
npm install ./sii-engine-0.1.0.tgz
# o con pnpm:
pnpm add ./sii-engine-0.1.0.tgz
```

### Opción C — Publicar en npm (registry público o privado)

```bash
# Publicar en npm público
npm run build
npm publish

# Publicar en npm registry privado (empresa)
npm run build
npm publish --registry https://tu-registry.empresa.com

# Instalar en el proyecto NestJS
npm install sii-engine
```

### Opción D — Usar como workspace de pnpm (monorepo)

Si tu proyecto NestJS ya usa pnpm workspaces, puedes agregar `sii-engine` como paquete local:

```yaml
# pnpm-workspace.yaml de tu monorepo
packages:
  - apps/*
  - packages/*
  - sii-engine  # ← agrega esta línea apuntando al directorio
```

```json
// package.json de tu app NestJS
{
  "dependencies": {
    "sii-engine": "workspace:*"
  }
}
```

---

## Requisitos

- **Node.js** >= 18 (recomendado 20+)
- **TypeScript** >= 5.0 (para proyectos TS)
- **Dependencias de peer**: ninguna (todas incluidas en el bundle)

---

## Uso rápido

### 1. Importar la librería

```typescript
import {
  TipoDTE,
  SiiEnvironment,
  FolioManager,
  parseCaf,
  loadCertificateFromP12,
  SiiTokenManager,
  LegacySiiClient,
  BoletaSiiClient,
  buildDteXml,
  buildTedXml,
  signTed,
  signDteDocument,
  buildEnvioDteXml,
  buildEnvioBoletaXml,
  validateDteDocument,
  type DteDocument,
  type CertificateMaterial,
} from 'sii-engine';
```

### 2. Cargar el certificado de firma

```typescript
import fs from 'fs';

const p12Buffer = fs.readFileSync('ruta/a/certificado.pfx');
const certMaterial = loadCertificateFromP12(p12Buffer, 'password_del_certificado');

console.log('Firmante:', certMaterial.rutFirmante);
console.log('Expira:', certMaterial.expiresAt);
```

También puedes cargar desde PEM:

```typescript
import { loadCertificateFromPem } from 'sii-engine';

const certPem = fs.readFileSync('cert.pem', 'utf-8');
const keyPem  = fs.readFileSync('key.pem', 'utf-8');
const certMaterial = loadCertificateFromPem(certPem, keyPem);
```

### 3. Cargar un CAF y gestionar folios

```typescript
import { parseCaf, FolioManager, TipoDTE } from 'sii-engine';

const cafXml = fs.readFileSync('caf_33.xml', 'utf-8');
const caf = parseCaf(cafXml);

const folioManager = new FolioManager();
folioManager.addCaf(caf);

// Consultar estado de folios disponibles
const status = folioManager.getStatus(TipoDTE.FacturaElectronica);
console.log('Folios disponibles:', status[0].remaining);

// Obtener el siguiente folio
const assignment = folioManager.getNextFolio(TipoDTE.FacturaElectronica);
console.log('Folio asignado:', assignment.folio);
```

### 4. Obtener token de autenticación SII

```typescript
import { SiiTokenManager, SiiEnvironment } from 'sii-engine';

const tokenManager = new SiiTokenManager();

// Obtiene token nuevo o usa el caché si aún es válido (~50 min)
const authToken = await tokenManager.getToken(SiiEnvironment.Certificacion, certMaterial);
console.log('Token SII:', authToken.token);
```

### 5. Construir y firmar una Factura Electrónica (DTE 33)

```typescript
import {
  TipoDTE, FormaPago,
  buildDteXml, buildTedXml, signTed, signDteDocument,
  validateDteDocument,
  type DteDocument,
} from 'sii-engine';

const documento: DteDocument = {
  idDoc: {
    tipoDTE: TipoDTE.FacturaElectronica,
    folio: assignment.folio,
    fechaEmision: '2026-05-15',
    formaPago: FormaPago.Contado,
  },
  emisor: {
    rutEmisor: '76212345-6',
    rznSoc: 'Mi Empresa S.A.',
    giroEmis: 'Servicios de Tecnología',
    acteco: 620900,
    dirOrigen: 'Av. Providencia 1234',
    cmnaOrigen: 'Providencia',
    ciudadOrigen: 'Santiago',
    correoEmisor: 'dte@miempresa.cl',
  },
  receptor: {
    rutRecep: '12345678-9',
    rznSocRecep: 'Cliente S.A.',
    giroRecep: 'Comercio al por mayor',
    dirRecep: 'Calle Los Leones 456',
    cmnaRecep: 'Las Condes',
    ciudadRecep: 'Santiago',
    correoRecep: 'compras@cliente.cl',
  },
  detalles: [
    {
      nroLinDet: 1,
      nmbItem: 'Desarrollo de software',
      qtyItem: 1,
      prcItem: 500000,
      montoItem: 500000,
    },
    {
      nroLinDet: 2,
      nmbItem: 'Soporte técnico mensual',
      qtyItem: 3,
      unmdItem: 'MES',
      prcItem: 100000,
      montoItem: 300000,
    },
  ],
  totales: {
    mntNeto: 800000,
    tasaIVA: 19,
    iva: 152000,
    mntTotal: 952000,
  },
};

// Validar antes de construir
validateDteDocument(documento);

// 1. Firmar el TED con la clave del CAF
const frma = signTed(documento, assignment.caf);

// 2. Construir el XML del TED
const tedXml = buildTedXml(documento, assignment.caf, frma);

// 3. Construir el XML del DTE completo
const dteXml = buildDteXml(documento, tedXml);

// 4. Firmar el documento con el certificado (XMLDSig)
const signedDteXml = signDteDocument(dteXml, documento, certMaterial);

console.log('DTE firmado correctamente');
```

### 6. Construir una Boleta Electrónica (DTE 39)

```typescript
const boleta: DteDocument = {
  idDoc: {
    tipoDTE: TipoDTE.BoletaElectronica,
    folio: boletaAssignment.folio,
    fechaEmision: '2026-05-15',
  },
  emisor: {
    rutEmisor: '76212345-6',
    rznSoc: 'Mi Empresa S.A.',
    giroEmis: 'Restaurant',
    acteco: 561000,
    dirOrigen: 'Av. Italia 789',
    cmnaOrigen: 'Ñuñoa',
  },
  receptor: {
    // Para consumidor final se puede omitir o usar RUT genérico
    rutRecep: '66666666-6',
    rznSocRecep: 'SIN INFORMACION',
  },
  detalles: [
    {
      nroLinDet: 1,
      nmbItem: 'Almuerzo ejecutivo',
      qtyItem: 2,
      prcItem: 9500,
      montoItem: 19000,
    },
  ],
  totales: {
    mntBruto: 19000,
    mntTotal: 19000,
  },
};

const frmaB = signTed(boleta, boletaAssignment.caf);
const tedB  = buildTedXml(boleta, boletaAssignment.caf, frmaB);
const dteB  = buildDteXml(boleta, tedB);
const signedBoleta = signDteDocument(dteB, boleta, certMaterial);
```

### 7. Construir una Nota de Crédito (DTE 61)

```typescript
import { TipoReferencia } from 'sii-engine';

const notaCredito: DteDocument = {
  idDoc: {
    tipoDTE: TipoDTE.NotaCredito,
    folio: ncAssignment.folio,
    fechaEmision: '2026-05-15',
  },
  emisor: { /* igual que la factura original */ },
  receptor: {
    rutRecep: '12345678-9',
    rznSocRecep: 'Cliente S.A.',
  },
  detalles: [
    {
      nroLinDet: 1,
      nmbItem: 'Anulación total factura 1234',
      prcItem: 952000,
      montoItem: 952000,
    },
  ],
  referencias: [
    {
      nroLinRef: 1,
      tipoDTERef: TipoDTE.FacturaElectronica,
      folioRef: 1234,
      fechaRef: '2026-05-10',
      codRef: TipoReferencia.AnulaDocumento,
      razonRef: 'Anulación por error en montos',
    },
  ],
  totales: {
    mntNeto: 800000,
    tasaIVA: 19,
    iva: 152000,
    mntTotal: 952000,
  },
};
```

### 8. Enviar al SII (Facturas/Notas — canal legacy)

```typescript
import {
  buildEnvioDteXml,
  signEnvelope,
  LegacySiiClient,
  SiiEnvironment,
  type EnvioDTECaratula,
  type DteFirmado,
} from 'sii-engine';

// Armar los objetos DteFirmado
const dtesFirmados: DteFirmado[] = [
  {
    document: documento,
    tedXml,
    signedXml: signedDteXml,
  },
];

// Construir la carátula del sobre
const caratula: EnvioDTECaratula = {
  rutEmisor: '76212345-6',
  rutEnvia: certMaterial.rutFirmante,
  fechaResolucion: '2014-08-22',  // fecha resolución SII
  nroResolucion: 80,
  tiposDTE: [TipoDTE.FacturaElectronica],
  fechaFirmaEnvio: new Date().toISOString().replace(/\.\d{3}Z$/, ''),
};

// Construir y firmar el sobre
const envioDteXml = buildEnvioDteXml(dtesFirmados, caratula);
const envioDteSigned = signEnvelope(envioDteXml, certMaterial);

// Enviar al SII
const client = new LegacySiiClient(
  SiiEnvironment.Certificacion,
  '76212345',  // RUT sin DV
  '6'          // DV
);

const result = await client.send(envioDteSigned, authToken.token);
console.log('TrackID:', result.trackId);
console.log('Estado:', result.status);  // SOK, EPR, etc.
```

### 9. Enviar Boleta al SII + RVD diario

```typescript
import {
  BoletaSiiClient,
  buildEnvioBoletaXml,
  buildResumenVentasDiariasXml,
  signEnvelope,
} from 'sii-engine';

const boletaClient = new BoletaSiiClient(
  SiiEnvironment.Certificacion,
  '76212345',
  '6'
);

// Enviar boleta
const envioBoletaXml = buildEnvioBoletaXml([{ document: boleta, tedXml: tedB, signedXml: signedBoleta }], caratula);
const envioBoletaSigned = signEnvelope(envioBoletaXml, certMaterial);
const resultBoleta = await boletaClient.send(envioBoletaSigned, authToken.token);

// Enviar Resumen de Ventas Diarias (obligatorio todos los días, incluso sin ventas)
const rvdXml = buildResumenVentasDiariasXml(
  '76212345-6',
  certMaterial.rutFirmante,
  '2026-05-15',
  80,           // nroResolucion
  '2014-08-22', // fechaResolucion
  1,            // secEnvio (incremental diario)
  [
    {
      tipoDTE: TipoDTE.BoletaElectronica,
      cantidad: 1,
      montoTotal: 19000,
      montoIVA: 0,
    },
  ]
);

const rvdSigned = signEnvelope(rvdXml, certMaterial);
const resultRvd = await boletaClient.sendRvd(rvdSigned, authToken.token);
```

### 10. Consultar estado de envío

```typescript
// Consultar estado del sobre enviado (por TrackID)
const statusResult = await client.queryStatus(result.trackId, authToken.token);
console.log('Estado envío:', statusResult.status);
// PRD = Procesado Definitivo, EPR = En Proceso, RSC = Rechazado, etc.

if (statusResult.estadisticas) {
  console.log('Aceptados:', statusResult.estadisticas.aceptados);
  console.log('Rechazados:', statusResult.estadisticas.rechazados);
}

// Consultar estado específico de un DTE
const dteStatus = await client.queryDteStatus(
  {
    tipoDTE: TipoDTE.FacturaElectronica,
    folio: 1,
    fechaEmision: '2026-05-15',
    montoTotal: 952000,
    rutReceptor: '12345678',
    dvReceptor: '9',
    token: authToken.token,
  },
  authToken.token
);
console.log('Estado DTE:', dteStatus.status); // DOK, FAU, DNK, etc.
```

---

## Manejo de errores

```typescript
import {
  isSiiError,
  SiiCafError,
  SiiCertError,
  SiiSignError,
  SiiSendError,
  SiiAuthError,
} from 'sii-engine';

try {
  const assignment = folioManager.getNextFolio(TipoDTE.FacturaElectronica);
} catch (err) {
  if (err instanceof SiiCafError) {
    switch (err.code) {
      case 'CAF_EXHAUSTED':
        console.error('Se agotaron los folios — solicitar nuevo CAF al SII');
        break;
      case 'CAF_EXPIRED':
        console.error('El CAF expiró — solicitar nuevo CAF al SII');
        break;
    }
  }
}

try {
  const result = await client.send(envioDteXml, token);
} catch (err) {
  if (err instanceof SiiSendError) {
    console.error(`Error de envío [${err.code}]:`, err.message);
    console.error('Respuesta cruda SII:', err.rawResponse);
  }
}
```

---

## Uso en NestJS

### Módulo de inyección de dependencias

```typescript
// sii.module.ts
import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  loadCertificateFromP12,
  FolioManager,
  parseCaf,
  SiiTokenManager,
  LegacySiiClient,
  BoletaSiiClient,
  SiiEnvironment,
} from 'sii-engine';
import fs from 'fs';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: 'SII_CERT',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const p12Path = config.get<string>('SII_CERT_PATH')!;
        const password = config.get<string>('SII_CERT_PASSWORD')!;
        return loadCertificateFromP12(fs.readFileSync(p12Path), password);
      },
    },
    {
      provide: FolioManager,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const manager = new FolioManager();
        const cafDir = config.get<string>('SII_CAF_DIR')!;
        for (const file of fs.readdirSync(cafDir)) {
          if (file.endsWith('.xml')) {
            const xml = fs.readFileSync(`${cafDir}/${file}`, 'utf-8');
            manager.addCaf(parseCaf(xml));
          }
        }
        return manager;
      },
    },
    {
      provide: SiiTokenManager,
      useClass: SiiTokenManager,
    },
    {
      provide: LegacySiiClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new LegacySiiClient(
          config.get('SII_ENV') === 'PRODUCCION'
            ? SiiEnvironment.Produccion
            : SiiEnvironment.Certificacion,
          config.get<string>('SII_RUT')!,
          config.get<string>('SII_DV')!,
        ),
    },
    {
      provide: BoletaSiiClient,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new BoletaSiiClient(
          config.get('SII_ENV') === 'PRODUCCION'
            ? SiiEnvironment.Produccion
            : SiiEnvironment.Certificacion,
          config.get<string>('SII_RUT')!,
          config.get<string>('SII_DV')!,
        ),
    },
  ],
  exports: ['SII_CERT', FolioManager, SiiTokenManager, LegacySiiClient, BoletaSiiClient],
})
export class SiiModule {}
```

### Servicio de emisión

```typescript
// invoice.service.ts
import { Injectable, Inject } from '@nestjs/common';
import {
  FolioManager, SiiTokenManager, LegacySiiClient,
  buildDteXml, buildTedXml, signTed, signDteDocument,
  buildEnvioDteXml, signEnvelope,
  TipoDTE, SiiEnvironment,
  type DteDocument, type CertificateMaterial, type EnvioDTECaratula,
} from 'sii-engine';

@Injectable()
export class InvoiceService {
  constructor(
    @Inject('SII_CERT') private readonly cert: CertificateMaterial,
    private readonly folioManager: FolioManager,
    private readonly tokenManager: SiiTokenManager,
    private readonly siiClient: LegacySiiClient,
  ) {}

  async emitirFactura(doc: DteDocument): Promise<{ trackId: string }> {
    const assignment = this.folioManager.getNextFolio(TipoDTE.FacturaElectronica);
    doc.idDoc.folio = assignment.folio;

    const frma       = signTed(doc, assignment.caf);
    const tedXml     = buildTedXml(doc, assignment.caf, frma);
    const dteXml     = buildDteXml(doc, tedXml);
    const signedDte  = signDteDocument(dteXml, doc, this.cert);

    const caratula: EnvioDTECaratula = {
      rutEmisor: doc.emisor.rutEmisor,
      rutEnvia: this.cert.rutFirmante,
      fechaResolucion: process.env.SII_FECHA_RESOLUCION!,
      nroResolucion: Number(process.env.SII_NRO_RESOLUCION),
      tiposDTE: [TipoDTE.FacturaElectronica],
      fechaFirmaEnvio: new Date().toISOString().replace(/\.\d{3}Z$/, ''),
    };

    const sobre       = buildEnvioDteXml([{ document: doc, tedXml, signedXml: signedDte }], caratula);
    const sobreFirmado = signEnvelope(sobre, this.cert);

    const authToken = await this.tokenManager.getToken(SiiEnvironment.Certificacion, this.cert);
    const result    = await this.siiClient.send(sobreFirmado, authToken.token);

    return { trackId: result.trackId };
  }
}
```

---

## Variables de entorno recomendadas

```env
# Ambiente SII
SII_ENV=CERTIFICACION            # CERTIFICACION | PRODUCCION

# Datos del emisor
SII_RUT=76212345                 # RUT sin DV y sin puntos
SII_DV=6                         # DV del RUT

# Resolución SII del emisor
SII_NRO_RESOLUCION=80
SII_FECHA_RESOLUCION=2014-08-22

# Certificado digital
SII_CERT_PATH=/secrets/cert.pfx
SII_CERT_PASSWORD=password_aqui

# Directorio de CAFs por tipo DTE
SII_CAF_DIR=/secrets/cafs
```

---

## Arquitectura de la librería

```
sii-engine/
├── src/
│   ├── types/          ← Tipos TypeScript del dominio fiscal
│   ├── errors/         ← Jerarquía de errores tipados
│   ├── states/         ← Taxonomía de estados SII (envío y DTE)
│   ├── caf/            ← Parser de CAF XML + FolioManager
│   ├── xml/            ← Constructores XML (DTE, TED, EnvioDTE, RVD, etc.)
│   ├── signing/        ← Firma TED, XMLDSig, autenticación SII
│   └── transport/      ← Clientes HTTP al SII (legacy y boleta)
└── dist/
    ├── index.js        ← ESM bundle
    ├── index.cjs       ← CommonJS bundle (compatible NestJS)
    └── index.d.ts      ← Tipos TypeScript
```

### Decisiones de diseño

- **Library-first**: el motor no es una API, es un core embebible directamente en `business_app_back`
- **Dos familias de transporte**: `LegacySiiClient` para DTE 33/56/61 (SOAP multipart + autenticación automática) y `BoletaSiiClient` para DTE 39 (plataforma dedicada + RVD diario)
- **Tres capas de firma**: TED firmado con clave privada del CAF, documento firmado con certificado contribuyente (XMLDSig), sobre firmado con certificado contribuyente
- **`SigningProvider` como contrato abstracto**: los certificados nunca quedan en la librería, se inyectan en runtime desde el host
- **Estado como dominio**: los estados SII son entidades con semántica, no strings libres

---

## Notas importantes del SII

- Los **CAF tienen vigencia de 6 meses** desde la fecha de autorización. Usar `folioManager.getStatus()` para monitorear.
- El **token SII tiene TTL de ~50 minutos**. `SiiTokenManager` maneja el caché automáticamente.
- La **boleta electrónica requiere RVD diario** (Resumen de Ventas Diarias), incluso los días sin ventas.
- El **TED se firma con la clave privada del CAF** (`RSASK`), no con el certificado del contribuyente.
- Los estados `RCH` (rechazado) y `RPR` (aceptado con reparos) tienen flujos de remediación distintos — no son lo mismo.
- El modo **CERTIFICACION** usa los servidores `maullin.sii.cl`, y **PRODUCCION** usa `palena.sii.cl`.

---

## Licencia

MIT
