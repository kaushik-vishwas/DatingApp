import { Router } from 'express';
import { adminProtect } from '../middleware/adminAuth';
import {
  createAdminEarningsWithdrawal,
  getAdminEarningsDashboard,
  updateAdminEarningsPayoutDetails,
} from '../controllers/adminEarningsController';

const router = Router();

router.get('/', adminProtect, getAdminEarningsDashboard);
router.patch('/payout-details', adminProtect, updateAdminEarningsPayoutDetails);
router.post('/withdraw', adminProtect, createAdminEarningsWithdrawal);

export default router;
