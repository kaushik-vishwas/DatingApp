import { Router } from 'express';
import { getAppUpdatePolicy } from '../controllers/appUpdateController';

const router = Router();

router.get('/update-policy', getAppUpdatePolicy);

export default router;
