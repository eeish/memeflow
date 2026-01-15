const TEXT_ENCODER = new TextEncoder();

function toBase36(value: number): string {
  if (value < 0) {
    throw new Error('Length must be non-negative');
  }
  return value.toString(36);
}

function byteLength(value: string): number {
  return TEXT_ENCODER.encode(value).length;
}

function getPublicDomains(): string[] {
  const domains: string[] = [];
  const envDomain = import.meta.env.VITE_R2_PUBLIC_DOMAIN as string | undefined;
  const envBase = import.meta.env.VITE_R2_PUBLIC_BASE as string | undefined;

  if (envDomain) {
    domains.push(envDomain);
  }
  if (envBase) {
    try {
      const parsed = new URL(envBase);
      domains.push(parsed.host);
    } catch {
      // Ignore invalid base URL
    }
  }

  return domains;
}

function extractKeyFromUrl(url: string): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url);
    const allowedDomains = getPublicDomains();
    if (!allowedDomains.length) return null;

    if (allowedDomains.includes(parsed.host)) {
      return parsed.pathname.replace(/^\/+/, '');
    }
  } catch {
    return null;
  }

  return null;
}

export function encodePostContent(text: string, url?: string): string {
  const safeText = text ?? '';
  const safeUrl = url ?? '';

  const urlKey = extractKeyFromUrl(safeUrl);
  const mode = urlKey ? '1' : '0';
  const urlField = urlKey ?? safeUrl;

  const textLen = toBase36(byteLength(safeText));
  const urlLen = toBase36(byteLength(urlField));

  return `mf1|${mode}|${textLen}|${safeText}${urlLen}|${urlField}`;
}
