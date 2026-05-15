export interface CertificateMaterial {
  privateKeyPem: string;
  certificatePem: string;
  rutFirmante: string;
  nombre: string;
  expiresAt: Date;
}

export interface SigningProvider {
  getSigningMaterial(context: SigningContext): Promise<CertificateMaterial>;
}

export interface SigningContext {
  rutEmisor: string;
  tipoDTE?: number;
  environment?: string;
  branchId?: string;
  tenantId?: string;
}

export interface CafSigningKey {
  privateKeyDer: string;
}

export interface XmlSignatureOptions {
  referenceId: string;
  includeKeyInfo?: boolean;
}

export interface TedSignatureResult {
  frma: string;
  algorithm: "SHA1withRSA";
}

export interface DocumentSignatureResult {
  signatureXml: string;
  digestValue: string;
  signatureValue: string;
}
