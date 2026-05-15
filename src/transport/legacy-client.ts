import axios from "axios";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const FormDataLib = require("form-data") as typeof import("form-data");
import { XMLParser } from "fast-xml-parser";
import type { SendResult, StatusQueryResult, DteStatusQueryResult } from "../types/transport.types.js";
import { SiiEnvironment } from "../types/transport.types.js";
import { SiiSendError, SiiError } from "../errors/sii-errors.js";
import { parseSendStatus, parseDteStatus } from "../states/index.js";

const UPLOAD_ENDPOINTS: Record<SiiEnvironment, string> = {
  [SiiEnvironment.Certificacion]: "https://maullin.sii.cl/cgi_dte/UPL/DTEUpload",
  [SiiEnvironment.Produccion]: "https://palena.sii.cl/cgi_dte/UPL/DTEUpload",
};

const STATUS_ENDPOINTS: Record<SiiEnvironment, string> = {
  [SiiEnvironment.Certificacion]: "https://maullin.sii.cl/cgi_dte/UPL/EDTEDeck.php",
  [SiiEnvironment.Produccion]: "https://palena.sii.cl/cgi_dte/UPL/EDTEDeck.php",
};

const DTE_STATUS_ENDPOINTS: Record<SiiEnvironment, string> = {
  [SiiEnvironment.Certificacion]: "https://ws1.sii.cl/BSDTE/dtews/QueryEstDte.jws",
  [SiiEnvironment.Produccion]: "https://ws1.sii.cl/BSDTE/dtews/QueryEstDte.jws",
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  trimValues: true,
});

export interface LegacySendOptions {
  rutSender: string;
  dvSender: string;
  rutCompany: string;
  dvCompany: string;
  token: string;
  environment: SiiEnvironment;
}

export async function sendDte(
  envioDteXml: string,
  options: LegacySendOptions
): Promise<SendResult> {
  const url = UPLOAD_ENDPOINTS[options.environment];
  const form = new FormDataLib();
  form.append("rutSender", options.rutSender);
  form.append("dvSender", options.dvSender);
  form.append("rutCompany", options.rutCompany);
  form.append("dvCompany", options.dvCompany);
  form.append("archivo", Buffer.from(envioDteXml, "utf-8"), {
    filename: "EnvioDTE.xml",
    contentType: "text/xml",
  });

  let responseData: string;
  try {
    const res = await axios.post(url, form, {
      headers: {
        ...form.getHeaders(),
        Cookie: `TOKEN=${options.token}`,
      },
      timeout: 60000,
    });
    responseData = res.data as string;
  } catch (err) {
    throw new SiiSendError("SEND_FAILED", "Error de red al enviar el DTE al SII", {
      cause: err as Error,
    });
  }

  return parseSendResponse(responseData);
}

function parseSendResponse(rawResponse: string): SendResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(rawResponse) as Record<string, unknown>;
  } catch {
    throw new SiiSendError("SEND_FAILED", "No se pudo parsear la respuesta del SII al enviar", {
      rawResponse,
    });
  }

  const respuesta = parsed?.["RESPUESTA"] as Record<string, unknown> | undefined;
  const resp = respuesta?.["RESP_HDR"] as Record<string, unknown> | undefined;

  if (!resp) {
    throw new SiiSendError("SEND_FAILED", "Respuesta inesperada del SII al enviar DTE", {
      rawResponse,
    });
  }

  const estado = String(resp["ESTADO"] ?? "");
  const trackId = String(resp["TRACKID"] ?? resp["TRACK_ID"] ?? "");

  if (estado === "RSC") {
    throw new SiiSendError("SEND_SCHEMA_REJECTED", "El sobre fue rechazado por el SII (error de schema)", {
      rawResponse,
    });
  }

  if (estado === "RCT") {
    throw new SiiSendError("SEND_CONTENT_REJECTED", "El sobre fue rechazado por el SII (error de contenido)", {
      rawResponse,
    });
  }

  return {
    trackId,
    status: parseSendStatus(estado),
    rawResponse,
  };
}

export interface StatusQueryOptions {
  rutEmpresa: string;
  dvEmpresa: string;
  trackId: string;
  token: string;
  environment: SiiEnvironment;
}

export async function querySendStatus(
  options: StatusQueryOptions
): Promise<StatusQueryResult> {
  const url = STATUS_ENDPOINTS[options.environment];

  let responseData: string;
  try {
    const res = await axios.get(url, {
      params: {
        rutEmpresa: options.rutEmpresa,
        dvEmpresa: options.dvEmpresa,
        TrackId: options.trackId,
      },
      headers: {
        Cookie: `TOKEN=${options.token}`,
      },
      timeout: 30000,
    });
    responseData = res.data as string;
  } catch (err) {
    throw new SiiError("QUERY_FAILED", "Error de red al consultar estado de envío", {
      cause: err as Error,
    });
  }

  return parseStatusResponse(options.trackId, responseData);
}

function parseStatusResponse(trackId: string, rawResponse: string): StatusQueryResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(rawResponse) as Record<string, unknown>;
  } catch {
    throw new SiiError("QUERY_FAILED", "No se pudo parsear la respuesta de estado del SII", {
      rawResponse,
    });
  }

  const respuesta = parsed?.["RESULTADO_ENVIO"] as Record<string, unknown> | undefined;
  const caratula = respuesta?.["RESP_HDR"] as Record<string, unknown> | undefined;
  const estadisticas = respuesta?.["RESP_BODY"] as Record<string, unknown> | undefined;

  const estado = String(caratula?.["ESTADO"] ?? "");

  return {
    trackId,
    status: parseSendStatus(estado),
    detail: String(caratula?.["DETAIL"] ?? ""),
    estadisticas: estadisticas
      ? {
          aceptados: Number(estadisticas["ACEPTADOS"] ?? 0),
          rechazados: Number(estadisticas["RECHAZADOS"] ?? 0),
          reparos: Number(estadisticas["REPAROS"] ?? 0),
        }
      : undefined,
    rawResponse,
  };
}

export interface DteStatusQueryOptions {
  rutEmisor: string;
  dvEmisor: string;
  tipoDTE: number;
  folio: number;
  fechaEmision: string;
  montoTotal: number;
  rutReceptor: string;
  dvReceptor: string;
  token: string;
  environment: SiiEnvironment;
}

export async function queryDteStatus(
  options: DteStatusQueryOptions
): Promise<DteStatusQueryResult> {
  const url = DTE_STATUS_ENDPOINTS[options.environment];

  const soapBody = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/">
  <soapenv:Header/>
  <soapenv:Body>
    <QueryEstDte>
      <RutEmisor>${options.rutEmisor}</RutEmisor>
      <DvEmisor>${options.dvEmisor}</DvEmisor>
      <TipoDte>${options.tipoDTE}</TipoDte>
      <Folio>${options.folio}</Folio>
      <FchEmis>${options.fechaEmision}</FchEmis>
      <RutReceptor>${options.rutReceptor}</RutReceptor>
      <DvReceptor>${options.dvReceptor}</DvReceptor>
      <MntTotal>${options.montoTotal}</MntTotal>
      <token>${options.token}</token>
    </QueryEstDte>
  </soapenv:Body>
</soapenv:Envelope>`;

  let responseData: string;
  try {
    const res = await axios.post(url, soapBody, {
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        SOAPAction: "",
        Cookie: `TOKEN=${options.token}`,
      },
      timeout: 30000,
    });
    responseData = res.data as string;
  } catch (err) {
    throw new SiiError("QUERY_FAILED", "Error de red al consultar estado del DTE", {
      cause: err as Error,
    });
  }

  return parseDteStatusResponse(options.tipoDTE, options.folio, options.rutEmisor, responseData);
}

function parseDteStatusResponse(
  tipoDTE: number,
  folio: number,
  rutEmisor: string,
  rawResponse: string
): DteStatusQueryResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = xmlParser.parse(rawResponse) as Record<string, unknown>;
  } catch {
    throw new SiiError("QUERY_FAILED", "No se pudo parsear la respuesta de estado del DTE", {
      rawResponse,
    });
  }

  const p = parsed as Record<string, Record<string, Record<string, Record<string, unknown>>>>;
  const body =
    p?.["soapenv:Envelope"]?.["soapenv:Body"]?.["QueryEstDteResponse"]?.["QueryEstDteReturn"] ??
    p?.["Envelope"]?.["Body"]?.["QueryEstDteResponse"]?.["QueryEstDteReturn"];

  const bodyRecord = body as Record<string, unknown> | undefined;
  const estadoRaw = String(bodyRecord?.["estado"] ?? bodyRecord?.["ESTADO"] ?? "UNKNOWN");
  const glosa = String(bodyRecord?.["glosa"] ?? bodyRecord?.["GLOSA"] ?? "");

  return {
    tipoDTE,
    folio,
    rutEmisor,
    status: parseDteStatus(estadoRaw),
    glosa,
    rawResponse,
  };
}

export class LegacySiiClient {
  constructor(
    private readonly environment: SiiEnvironment,
    private readonly rutEmpresa: string,
    private readonly dvEmpresa: string
  ) {}

  async send(
    envioDteXml: string,
    token: string,
    rutSender?: string,
    dvSender?: string
  ): Promise<SendResult> {
    const [rut, dv] = (rutSender ?? this.rutEmpresa).split("-");
    return sendDte(envioDteXml, {
      rutSender: rut ?? this.rutEmpresa,
      dvSender: dv ?? this.dvEmpresa,
      rutCompany: this.rutEmpresa,
      dvCompany: this.dvEmpresa,
      token,
      environment: this.environment,
    });
  }

  async queryStatus(trackId: string, token: string): Promise<StatusQueryResult> {
    return querySendStatus({
      rutEmpresa: this.rutEmpresa,
      dvEmpresa: this.dvEmpresa,
      trackId,
      token,
      environment: this.environment,
    });
  }

  async queryDteStatus(
    opts: Omit<DteStatusQueryOptions, "environment" | "rutEmisor" | "dvEmisor">,
    token: string
  ): Promise<DteStatusQueryResult> {
    return queryDteStatus({
      ...opts,
      rutEmisor: this.rutEmpresa,
      dvEmisor: this.dvEmpresa,
      token,
      environment: this.environment,
    });
  }
}
