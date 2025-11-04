export function normalizePhone(input: string | null | undefined): string | null {
  if (!input) return null;

  const digits = input.replace(/\D/g, "");
  const withCountry = digits.startsWith("55") ? digits : `55${digits}`;

  if (withCountry.length < 12 || withCountry.length > 13) {
    return null;
  }

  return withCountry;
}