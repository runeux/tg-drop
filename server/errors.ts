export class HttpError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 413 | 429 | 503 | 507,
    message: string,
  ) {
    super(message);
  }
}
