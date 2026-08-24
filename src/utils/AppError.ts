export class AppError extends Error {
  public statusCode: number;
  public code: string;
  public details: Record<string, unknown>;

  constructor(statusCode: number,message: string,code: string,details: Record<string, unknown> = {}) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
  
}