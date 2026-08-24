import { brandText } from "../config/brand.js";import { Router } from 'express';
import { dashboardSummary } from '../repositories/dashboardRepository.js';

const router = Router();
router.get('/', async (req, res) => {
  try {
    const data = await dashboardSummary(req.query, req.access?.branchScope);
    res.setHeader('Cache-Control', 'private, max-age=10');
    res.json({ success: true, data });
  } catch (e) {
    console.error(brandText("[GMX Dashboard]"), e);
    res.status(500).json({ success: false, error: 'DASHBOARD_REQUEST_FAILED', message: e.message });
  }
});
export default router;
