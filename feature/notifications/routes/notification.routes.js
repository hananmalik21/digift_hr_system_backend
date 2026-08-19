import express from 'express';
import {
  clearNotifications,
  clearOneNotification,
  createNotification,
  deactivateDevice,
  deactivateDeviceByTarget,
  getUnreadCount,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  registerDevice
} from '../controllers/notification.controller.js';

const router = express.Router();

router.get('/unread-count', getUnreadCount);
router.patch('/read-all', markAllNotificationsRead);

router.post('/devices', registerDevice);
router.delete('/devices', deactivateDeviceByTarget);
router.delete('/devices/:deviceGuid', deactivateDevice);

router.get('/', listNotifications);
router.post('/', createNotification);
router.delete('/', clearNotifications);

router.patch('/:recipientGuid/read', markNotificationRead);
router.delete('/:recipientGuid', clearOneNotification);

export default router;
