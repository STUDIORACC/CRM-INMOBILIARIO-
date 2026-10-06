const DEFAULT_COUNTRY = process.env.NEXT_PUBLIC_DEFAULT_COUNTRY_CODE ?? "51";

/** Normaliza a dígitos con código de país. Debe coincidir con public.normalize_phone() en SQL. */
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let d = raw.replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("00")) d = d.slice(2);
  if (d.length === 9 && d.startsWith("9")) d = DEFAULT_COUNTRY + d;
  return d;
}

export function formatPhone(raw: string | null | undefined): string {
  const n = normalizePhone(raw);
  if (!n) return "";
  if (n.startsWith(DEFAULT_COUNTRY) && n.length === DEFAULT_COUNTRY.length + 9) {
    const local = n.slice(DEFAULT_COUNTRY.length);
    return `+${DEFAULT_COUNTRY} ${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
  }
  return `+${n}`;
}

/** Enlace de WhatsApp (wa.me) con mensaje prellenado opcional. */
export function whatsappLink(phone: string | null | undefined, message?: string): string | null {
  const n = normalizePhone(phone);
  if (!n) return null;
  return `https://wa.me/${n}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

export function telLink(phone: string | null | undefined): string | null {
  const n = normalizePhone(phone);
  return n ? `tel:+${n}` : null;
}

export function mailtoLink(email: string | null | undefined, subject?: string, body?: string): string | null {
  if (!email) return null;
  const params = new URLSearchParams();
  if (subject) params.set("subject", subject);
  if (body) params.set("body", body);
  const q = params.toString().replace(/\+/g, "%20");
  return `mailto:${email}${q ? `?${q}` : ""}`;
}
