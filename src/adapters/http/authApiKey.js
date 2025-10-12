export function authApiKey(req, res, next) {
  const providedKey = req.headers['x-api-key'];
  const expectedKey = process.env.API_KEY;

  if (!providedKey || providedKey !== expectedKey) {
    return res.status(401).json({
      code: 'unauthorized',
      message: 'API key required or invalid'
    });
  }

  next();
}
