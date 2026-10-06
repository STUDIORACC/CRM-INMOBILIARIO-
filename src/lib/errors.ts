/** Error de negocio con mensaje apto para el usuario final. */
export class AppError extends Error {
  constructor(
    message: string,
    public fieldErrors?: Record<string, string[]>,
    /** Código de negocio que la UI puede interpretar (p. ej. "duplicate"). */
    public code?: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export class ForbiddenError extends Error {
  constructor(message = "No tienes permiso para realizar esta acción.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
