import { isProduction, nodeEnv } from '@digifyhr/common';

export const IS_DEV_MODE = !isProduction();
export const IS_PROD_MODE = isProduction();
export const NODE_ENV = nodeEnv();
