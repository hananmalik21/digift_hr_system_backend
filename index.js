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
import jobFamilyController from './feature/job_families/controller/jobFamilyController.js';
import gradeController from './feature/grades/controller/grades_controller.js';
import jobLevelsController from './feature/job_levels/controller/job_levels_controller.js';
import positionsController from './feature/positions/controller/positions_controller.js';
import shiftController from './feature/shifts/controller/shiftController.js';
import workPatternController from './feature/work_patterns/controller/workPatternController.js';
import workScheduleController from './feature/work_schedules/controller/workScheduleController.js';
import scheduleAssignmentController from './feature/tm_schedule_assignments/controller/scheduleAssignmentController.js';
import holidayController from './feature/holidays/controller/holidayController.js';
import { errorMiddleware, notFoundHandler } from './middleware/errorMiddleware.js';




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

app.use('/', hrOrgHierarchyLevelController);


app.use('/api/grades', gradeController);


app.use('/api/job-families', jobFamilyController);


app.use('/api/job-levels', jobLevelsController);


app.use('/api/positions', positionsController);

// Shifts routes
app.use('/api/tm/shifts', shiftController);

// Work Patterns routes
app.use('/api/tm/work-patterns', workPatternController);

// Work Schedules routes
app.use('/api/tm/work-schedules', workScheduleController);

// Schedule Assignments routes
app.use('/api/tm/schedule-assignments', scheduleAssignmentController);

// Holidays routes
app.use('/api/holidays', holidayController);




// Initialize database pool on startup
await createPool();
console.log('✅ Database pool initialized');

// ==========================================
// 📌 HEALTH CHECK ENDPOINT
// ==========================================
import { sendSuccess } from './utils/response.js';

app.get('/health', (req, res) => {
  sendSuccess(res, {
    message: 'API Server is running',
    data: {
      status: 'OK',
      timestamp: new Date().toISOString()
    }
  });
});


// ==========================================
// 📌 404 HANDLER (must be before error middleware)
// ==========================================
app.use(notFoundHandler);

// ==========================================
// 📌 ERROR HANDLING MIDDLEWARE (must be last)
// ==========================================
app.use(errorMiddleware);

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
