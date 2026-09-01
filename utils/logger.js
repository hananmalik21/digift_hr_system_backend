/**
 * Structured logger — implementation lives in @digifyhr/common.
 */
import { createLogger } from '@digifyhr/common';

export const logger = createLogger({ service: 'digify-erp' });
export default logger;
