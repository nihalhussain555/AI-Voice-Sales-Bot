// Terminal middleware: unmatched routes answer JSON, unexpected throws never
// leak a stack trace or an HTML page to the client.

export function notFound(req, res) {
  res.status(404).json({ error: `Not found: ${req.method} ${req.originalUrl}` });
}

// Controllers keep their own try/catch (each has a specific status contract);
// this only catches anything that escapes them.
export function apiError(err, req, res, next) {
  if (res.headersSent) return next(err);
  const status = Number.isInteger(err.status) ? err.status
    : err.name === 'GroqError' ? 502
    : err.name === 'MulterError' ? 400
    : 500;
  console.error(`[${status}] ${req.method} ${req.originalUrl}:`, err.message || err);
  res.status(status).json({ error: err.message || 'Internal server error' });
}
