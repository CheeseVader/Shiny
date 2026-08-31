export function requireApiKey(req, res, next) {
  const expected = process.env.SHINY_API_KEY;
  const received = req.get('x-shiny-api-key');

  if (!expected) {
    return res.status(500).json({
      success: false,
      error: 'SHINY_API_KEY_NOT_CONFIGURED'
    });
  }

  if (!received || received !== expected) {
    return res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED'
    });
  }

  next();
}
