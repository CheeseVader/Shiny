export function requireApiKey(req, res, next) {
  const expected = process.env.GMX_API_KEY;
  const received = req.get('x-gmx-api-key');

  if (!expected) {
    return res.status(500).json({
      success: false,
      error: 'GMX_API_KEY_NOT_CONFIGURED'
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
