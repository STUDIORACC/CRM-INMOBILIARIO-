/** Reemplaza marcadores {{nombre}}, {{propiedad}}… de las plantillas de mensajes. */
export function fillTemplate(body: string, vars: Record<string, string | null | undefined>): string {
  return body
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
      const v = vars[key];
      return v == null || v === "" ? match : v;
    })
    .replace(/[ \t]+\n/g, "\n")
    // Si quedó algún marcador sin valor se elimina junto a su espacio para no enviar "{{fecha}}" literal
    .replace(/\s?\{\{\s*\w+\s*\}\}/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}
