// Load environment variables from .env file
import 'dotenv/config';

import express from 'express';
import cors from 'cors';
import { createPool, closePool } from './config/db.js';
import companyController from './feature/companies/controller/companyController.js';
import divisionController from './feature/divisions/controller/divisionController.js';
import businessUnitController from './feature/business_units/controller/businessUnitController.js';
import departmentController from './feature/departments/controller/departmentController.js';
import hrOrgHierarchyLevelController from './feature/hr_org_hierarchy_levels/controller/hrOrgHierarchyLevelController.js';
import hrOrgStructureController from './feature/hr_org_structures/controller/hrOrgStructureController.js';
import orgUnitController from './feature/org_units/controller/orgUnitController.js';
import structureLevelController from './feature/structure_levels/controller/structureLevelController.js';
import enterpriseController from './feature/enterprises/controller/enterpriseController.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Company routes
app.use('/api/companies', companyController);

// Division routes
app.use('/api/divisions', divisionController);

// Business Unit routes
app.use('/api/business-units', businessUnitController);

// Department routes
app.use('/api/departments', departmentController);

// Enterprise routes
app.use('/api/enterprises', enterpriseController);

// HR Organization Hierarchy Level routes
app.use('/api/hr-org-hierarchy-levels', hrOrgHierarchyLevelController);

// HR Organization Structure routes (mounted first so specific routes like /active/levels match before parameterized routes)
app.use('/api/hr-org-structures', hrOrgStructureController);

// Org Units routes (structure-centric, mounted after structure routes)
// Routes: /api/hr-org-structures/:structureId, /api/hr-org-structures/:structureId/levels, etc.
app.use('/api/hr-org-structures', orgUnitController);

// Structure Level routes
app.use('/api/structure-levels', structureLevelController);

// Enterprise-scoped HR Organization Hierarchy Level routes
// Mount at root to access /enterprises/:enterpriseId/org-structures/:structureId/levels
app.use('/', hrOrgHierarchyLevelController);

// Initialize database pool on startup
await createPool();
console.log('✅ Database pool initialized');

// ==========================================
// 📌 HEALTH CHECK ENDPOINT
// ==========================================
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'API Server is running',
    timestamp: new Date().toISOString()
  });
});


// ==========================================
// 📌 404 HANDLER
// ==========================================
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found',
    path: req.path,
    availableEndpoints: [
      'GET    /health',
      'GET    /api/companies',
      'GET    /api/companies/:id',
      'POST   /api/companies',
      'PUT    /api/companies/:id',
      'PATCH  /api/companies/:id',
      'DELETE /api/companies/:id',
      'GET    /api/divisions',
      'GET    /api/divisions/:id',
      'POST   /api/divisions',
      'PUT    /api/divisions/:id',
      'PATCH  /api/divisions/:id',
      'DELETE /api/divisions/:id',
      'GET    /api/business-units',
      'GET    /api/business-units/:id',
      'POST   /api/business-units',
      'PUT    /api/business-units/:id',
      'PATCH  /api/business-units/:id',
      'DELETE /api/business-units/:id',
      'GET    /api/departments',
      'GET    /api/departments/:id',
      'POST   /api/departments',
      'PUT    /api/departments/:id',
      'PATCH  /api/departments/:id',
      'DELETE /api/departments/:id',
      'GET    /api/enterprises',
      'GET    /api/enterprises/:id',
      'POST   /api/enterprises',
      'PUT    /api/enterprises/:id',
      'PATCH  /api/enterprises/:id',
      'DELETE /api/enterprises/:id',
      'GET    /api/hr-org-hierarchy-levels',
      'GET    /api/hr-org-hierarchy-levels/:id',
      'POST   /api/hr-org-hierarchy-levels',
      'POST   /api/hr-org-hierarchy-levels/bulk',
      'PUT    /api/hr-org-hierarchy-levels/:id',
      'PATCH  /api/hr-org-hierarchy-levels/:id',
      'DELETE /api/hr-org-hierarchy-levels/:id',
      'GET    /api/hr-org-structures',
      'GET    /api/hr-org-structures/:id',
      'GET    /api/hr-org-structures/active/levels',
      'POST   /api/hr-org-structures',
      'PUT    /api/hr-org-structures/:id',
      'PATCH  /api/hr-org-structures/:id',
      'DELETE /api/hr-org-structures/:id',
      'GET    /api/hr-org-structures/:structureId',
      'GET    /api/hr-org-structures/:structureId/levels',
      'GET    /api/hr-org-structures/:structureId/org-units',
      'GET    /api/hr-org-structures/:structureId/org-units/parents',
      'POST   /api/hr-org-structures/:structureId/org-units',
      'PUT    /api/hr-org-structures/:structureId/org-units/:orgUnitId',
      'GET    /api/hr-org-structures/:structureId/org-units/tree',
      'GET    /api/structure-levels',
      'GET    /api/structure-levels/:id',
      'POST   /api/structure-levels',
      'PUT    /api/structure-levels/:id',
      'PATCH  /api/structure-levels/:id',
      'DELETE /api/structure-levels/:id',
      'GET    /enterprises/:enterpriseId/org-structures/:structureId/levels',
      'PUT    /enterprises/:enterpriseId/org-structures/:structureId/levels/reorder',
      'POST   /org-structures/onboard-enterprise-hierarchy'
    ]
  });
});

// ==========================================
// 📌 START SERVER
// ==========================================
const server = app.listen(PORT, () => {
  console.log('\n🚀 Oracle Database API Server Started!');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log('\n📚 Available API Endpoints:');
});

// ==========================================
// 📌 GRACEFUL SHUTDOWN
// ==========================================
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down gracefully...');
  server.close(async () => {
    console.log('📡 HTTP server closed');
    await closePool();
    console.log('✅ Shutdown complete');
    process.exit(0);
  });
});
