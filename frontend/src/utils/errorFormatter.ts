/**
 * Utility to extract human-readable error messages from diverse API failure shapes:
 * - Plain string errors: "Invalid email or password"
 * - FastAPI validation error details: array of { loc: [...], msg: "..." }
 * - Object errors with { detail: ... } or { message: ... }
 * - Network failures and unhandled runtime exceptions
 * Prevents raw [object Object] from ever being rendered to users.
 */
export function formatApiErrorMessage(err: unknown, fallback: string = 'An unexpected error occurred'): string {
  if (!err) return fallback;

  if (typeof err === 'string') {
    return err.trim() || fallback;
  }

  // Handle standard Error instance
  if (err instanceof Error) {
    // If err.message is a JSON string (from throw new Error(JSON.stringify(data))), parse it
    try {
      const parsed = JSON.parse(err.message);
      return formatApiErrorMessage(parsed, err.message);
    } catch {
      return err.message.trim() || fallback;
    }
  }

  // If object with 'detail'
  if (typeof err === 'object') {
    const obj = err as Record<string, any>;

    // FastAPI HTTPException often has { detail: "string" } or { detail: [{ loc: [...], msg: "..." }] }
    if (obj.detail) {
      if (typeof obj.detail === 'string') {
        return obj.detail.trim();
      }
      if (Array.isArray(obj.detail)) {
        // FastAPI Pydantic validation error list
        const messages = obj.detail
          .map((item: any) => {
            if (typeof item === 'string') return item;
            if (item && typeof item === 'object') {
              const field = Array.isArray(item.loc) ? item.loc[item.loc.length - 1] : '';
              const prefix = field && field !== '__root__' && field !== 'body' ? `${field}: ` : '';
              return `${prefix}${item.msg || item.message || JSON.stringify(item)}`;
            }
            return String(item);
          })
          .filter(Boolean);

        if (messages.length > 0) {
          return messages.join('; ');
        }
      }
      if (typeof obj.detail === 'object') {
        return formatApiErrorMessage(obj.detail, fallback);
      }
    }

    if (typeof obj.message === 'string' && obj.message) {
      return obj.message.trim();
    }

    if (typeof obj.error === 'string' && obj.error) {
      return obj.error.trim();
    }
  }

  try {
    return JSON.stringify(err);
  } catch {
    return fallback;
  }
}
