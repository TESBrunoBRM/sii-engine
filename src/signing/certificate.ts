import forge from "node-forge";
import type { CertificateMaterial } from "../types/signing.types.js";
import { SiiCertError } from "../errors/sii-errors.js";

export function loadCertificateFromP12(
  p12Buffer: Buffer,
  password: string
): CertificateMaterial {
  let p12: forge.pkcs12.Pkcs12Pfx;
  try {
    const p12Der = forge.util.createBuffer(p12Buffer.toString("binary"));
    const p12Asn1 = forge.asn1.fromDer(p12Der);
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
  } catch (err) {
    throw new SiiCertError(
      "CERT_LOAD_ERROR",
      "No se pudo cargar el certificado P12. Verifique el archivo y la contraseña.",
      { cause: err as Error }
    );
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag });
  const keyBags = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });

  const certBag = Object.values(certBags).flat()[0];
  const keyBag = Object.values(keyBags).flat()[0];

  if (!certBag?.cert) {
    throw new SiiCertError("CERT_LOAD_ERROR", "No se encontró el certificado en el archivo P12");
  }
  if (!keyBag?.key) {
    throw new SiiCertError("CERT_LOAD_ERROR", "No se encontró la clave privada en el archivo P12");
  }

  const cert = certBag.cert;
  const privateKey = keyBag.key;

  const expiresAt = new Date(cert.validity.notAfter);
  if (expiresAt < new Date()) {
    throw new SiiCertError(
      "CERT_EXPIRED",
      `El certificado expiró el ${expiresAt.toISOString()}`
    );
  }

  const privateKeyPem = forge.pki.privateKeyToPem(privateKey as forge.pki.rsa.PrivateKey);
  const certificatePem = forge.pki.certificateToPem(cert);

  const subjectRut = extractRutFromCert(cert);
  const subjectName = extractNameFromCert(cert);

  return {
    privateKeyPem,
    certificatePem,
    rutFirmante: subjectRut,
    nombre: subjectName,
    expiresAt,
  };
}

export function loadCertificateFromPem(
  certificatePem: string,
  privateKeyPem: string
): CertificateMaterial {
  let cert: forge.pki.Certificate;
  try {
    cert = forge.pki.certificateFromPem(certificatePem);
  } catch (err) {
    throw new SiiCertError("CERT_LOAD_ERROR", "No se pudo parsear el certificado PEM", {
      cause: err as Error,
    });
  }

  try {
    forge.pki.privateKeyFromPem(privateKeyPem);
  } catch (err) {
    throw new SiiCertError("CERT_LOAD_ERROR", "No se pudo parsear la clave privada PEM", {
      cause: err as Error,
    });
  }

  const expiresAt = new Date(cert.validity.notAfter);
  if (expiresAt < new Date()) {
    throw new SiiCertError(
      "CERT_EXPIRED",
      `El certificado expiró el ${expiresAt.toISOString()}`
    );
  }

  const subjectRut = extractRutFromCert(cert);
  const subjectName = extractNameFromCert(cert);

  return {
    privateKeyPem,
    certificatePem,
    rutFirmante: subjectRut,
    nombre: subjectName,
    expiresAt,
  };
}

export function getCertificateBase64(certificatePem: string): string {
  return certificatePem
    .replace("-----BEGIN CERTIFICATE-----", "")
    .replace("-----END CERTIFICATE-----", "")
    .replace(/\s/g, "");
}

export function getRsaModulusAndExponent(certificatePem: string): {
  modulus: string;
  exponent: string;
} {
  const cert = forge.pki.certificateFromPem(certificatePem);
  const publicKey = cert.publicKey as forge.pki.rsa.PublicKey;
  const modulus = forge.util.encode64(
    forge.util.hexToBytes(publicKey.n.toString(16))
  );
  const exponent = forge.util.encode64(
    forge.util.hexToBytes(publicKey.e.toString(16))
  );
  return { modulus, exponent };
}

function extractRutFromCert(cert: forge.pki.Certificate): string {
  const attrs = cert.subject.attributes;
  for (const attr of attrs) {
    if (attr.name === "serialName" || attr.shortName === "SN") {
      const val = String(attr.value ?? "");
      if (val.match(/\d+-[\dkK]/)) return val;
    }
    if (attr.name === "commonName" || attr.shortName === "CN") {
      const val = String(attr.value ?? "");
      const match = val.match(/(\d{1,2}\.\d{3}\.\d{3}-[\dkK]|\d+-[\dkK])/);
      if (match) return match[1].replace(/\./g, "");
    }
  }
  const emailAttr = attrs.find((a) => a.name === "emailAddress");
  if (emailAttr) return String(emailAttr.value ?? "");
  return "";
}

function extractNameFromCert(cert: forge.pki.Certificate): string {
  const cn = cert.subject.getField("CN");
  if (cn) return String(cn.value);
  const o = cert.subject.getField("O");
  if (o) return String(o.value);
  return "";
}

export function loadCafPrivateKey(rsaskBase64: string): forge.pki.rsa.PrivateKey {
  try {
    const der = forge.util.decode64(rsaskBase64);
    const asn1 = forge.asn1.fromDer(der);
    return forge.pki.privateKeyFromAsn1(asn1) as forge.pki.rsa.PrivateKey;
  } catch (err) {
    throw new SiiCertError("CERT_LOAD_ERROR", "No se pudo cargar la clave privada del CAF", {
      cause: err as Error,
    });
  }
}
