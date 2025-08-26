export function createApiKeyAuth(apiKey) {
  return (req, res, next) => {
    const providedKey = req.headers['x-api-key'];
    
    if (!providedKey) {
      return res.status(401).json({
        code: 'unauthorized',
        message: 'API key required. Provide x-api-key header.'
      });
    }
    
    if (providedKey !== apiKey) {
      return res.status(401).json({
        code: 'unauthorized',
        message: 'Invalid API key'
      });
    }
    
    next();
  };
}