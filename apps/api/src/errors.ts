/** Fachlicher Fehler mit HTTP-Status; wird zentral in eine JSON-Antwort übersetzt. */
export class ApiError extends Error {
  constructor(
    public status: 400 | 401 | 403 | 404 | 409 | 410 | 422 | 429,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ApiError(404, 'not_found', `${what} nicht gefunden`);
export const conflict = (code: string, message: string) => new ApiError(409, code, message);
export const invalid = (message: string) => new ApiError(422, 'invalid', message);
