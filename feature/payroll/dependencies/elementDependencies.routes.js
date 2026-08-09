/**
 * Element dependency routes.
 * Mounted at /api/payroll → /element-dependencies
 */

import express from 'express';
import {
  getDependencyHandler,
  listDependenciesHandler,
  refreshDependenciesHandler,
  rejectDependencyCrudHandler,
  validateDependenciesHandler
} from './elementDependencies.controller.js';

const router = express.Router();
const dependenciesRouter = express.Router({ mergeParams: true });

// Static paths before :dependencyGuid
dependenciesRouter.post('/validate', validateDependenciesHandler);
dependenciesRouter.post('/refresh', refreshDependenciesHandler);

dependenciesRouter.get('/', listDependenciesHandler);
dependenciesRouter.post('/', rejectDependencyCrudHandler);
dependenciesRouter.get('/:dependencyGuid', getDependencyHandler);
dependenciesRouter.put('/:dependencyGuid', rejectDependencyCrudHandler);
dependenciesRouter.delete('/:dependencyGuid', rejectDependencyCrudHandler);

router.use('/element-dependencies', dependenciesRouter);

export default router;
