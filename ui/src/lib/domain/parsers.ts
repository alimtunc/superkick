export function extractFormError(err: unknown): string | null {
  if (!err) return null;
  if (typeof err === "string") return err;
  return (err as { form?: string }).form ?? null;
}

export function parseAnswer(json: unknown): { action?: string; note?: string } | null {
  if (json == null || typeof json !== "object") return null;
  const obj = json as Record<string, unknown>;
  return {
    action: typeof obj.action === "string" ? obj.action : undefined,
    note: typeof obj.note === "string" ? obj.note : undefined,
  };
}
