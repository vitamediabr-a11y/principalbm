export class AppError extends Error {
  constructor(
    public readonly status: 401 | 403 | 404 | 409 | 422 | 500,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function publicErrorMessage(error: unknown) {
  if (error instanceof AppError) return error.message;
  console.error(error);
  return "Não foi possível concluir a operação. Tente novamente.";
}
