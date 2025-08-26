export class DomainError extends Error {
  constructor(message, code = 'DOMAIN_ERROR') {
    super(message);
    this.name = 'DomainError';
    this.code = code;
  }
}

export class ValidationError extends DomainError {
  constructor(message, details = null) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class AdapterError extends Error {
  constructor(message, adapter, originalError = null) {
    super(message);
    this.name = 'AdapterError';
    this.adapter = adapter;
    this.originalError = originalError;
  }
}