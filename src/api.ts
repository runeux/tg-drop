import { z } from 'zod';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  const data: unknown = await response.json();
  if (!response.ok) {
    const parsed = z.object({ error: z.string() }).safeParse(data);
    throw new ApiError(
      parsed.success ? parsed.data.error : 'Something went wrong. Try again.',
      response.status,
    );
  }
  return schema.parse(data);
}

export const okSchema = z.object({ ok: z.boolean() });
export const sessionSchema = z.object({
  authenticated: z.boolean(),
  maxFileBytes: z.number(),
});
export function message(error: unknown) {
  return error instanceof Error ? error.message : 'Connection lost. Try again.';
}
