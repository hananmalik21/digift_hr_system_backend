import { ValidationError } from '../../../utils/errors/index.js';

export function resolveNotificationScope({ enterpriseId, userId }) {
  if (!enterpriseId || !userId) {
    throw new ValidationError('Authenticated enterprise and user are required');
  }

  return { enterpriseId, userId };
}

export function resolveEnterpriseScope(enterpriseId) {
  if (!enterpriseId) {
    throw new ValidationError('Enterprise context is required');
  }

  return { enterpriseId: Number(enterpriseId) };
}
