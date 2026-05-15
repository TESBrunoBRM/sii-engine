import type { TipoDTE } from "./dte.types.js";

export interface CafRsaPk {
  modulus: string;
  exponent: string;
}

export interface CafDa {
  rutEmisor: string;
  razonSocial: string;
  tipoDTE: TipoDTE;
  rangeStart: number;
  rangeEnd: number;
  fechaAutorizacion: string;
  rsaPk: CafRsaPk;
  idk: string;
}

export interface CafData {
  da: CafDa;
  frma: string;
  rsask: string;
  rsapubk: string;
  rawXml: string;
}

export interface FolioAssignment {
  folio: number;
  caf: CafData;
  assignedAt: Date;
}

export interface FolioRange {
  start: number;
  end: number;
  current: number;
  tipoDTE: TipoDTE;
}

export type CafStatus =
  | "active"
  | "exhausted"
  | "expiring_soon"
  | "expired"
  | "invalid";

export interface CafWithStatus {
  caf: CafData;
  status: CafStatus;
  remaining: number;
}
