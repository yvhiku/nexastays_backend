import { Request } from 'express';

export interface AdminRequestUser {
  userId?: string;
  email?: string;
  role?: string;
  roles?: string[];
}

export type AdminRequest = Request & { user?: AdminRequestUser };
