import type { Principal } from './modules/auth/policy';
declare global {
  namespace Express {
    interface Request {
      principal: Principal;
      requestId: string;
    }
  }
}
export {};
