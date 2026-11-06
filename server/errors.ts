export class HttpError extends Error {
  constructor(
    public status:
      400 | 401 | 403 | 404 | 409 | 413 | 415 | 416 | 429 | 503 | 507,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}
