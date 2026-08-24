import { Router } from 'express';
import { lookupMexicanPostalCode } from '../repositories/geoRepository.js';

const router = Router();

router.get('/mx/cp/:cp', async (req, res) => {
  const cp = String(req.params.cp || '').trim();

  if (!/^\d{5}$/.test(cp)) {
    return res.status(400).json({
      success: false,
      error: 'INVALID_CP'
    });
  }

  try {
    const result = await lookupMexicanPostalCode(cp);

    res.json({
      success: true,
      data: result.rows,
      count: result.rowCount,
      ms: result.ms
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'GEO_LOOKUP_FAILED',
      message: error.message
    });
  }
});

export default router;
