import type { IRequest, IResponse } from '@zintrust/core';

export type JsonRecord = Record<string, unknown>;

export type LoginBody = {
  email: string;
  password: string;
};

export type RegisterBody = {
  name: string;
  email: string;
  password: string;
};

export type UserRow = {
  id?: unknown;
  name?: unknown;
  email?: unknown;
  password?: unknown;
};
export type AuthControllerApi = {
  login(req: IRequest, res: IResponse): Promise<void>;
  register(req: IRequest, res: IResponse): Promise<void>;
  logout(req: IRequest, res: IResponse): Promise<void>;
  refresh(req: IRequest, res: IResponse): Promise<void>;
};

export type ValidationErrorLike = {
  name?: unknown;
  toObject?: () => Record<string, string[]>;
};

/**
 * User Controller Interface
 */
export interface IUserController {
  index(req: IRequest, res: IResponse): Promise<void>;
  show(req: IRequest, res: IResponse): Promise<void>;
  create(req: IRequest, res: IResponse): Promise<void>;
  store(req: IRequest, res: IResponse): Promise<void>;
  fill(req: IRequest, res: IResponse): Promise<void>;
  edit(req: IRequest, res: IResponse): Promise<void>;
  update(req: IRequest, res: IResponse): Promise<void>;
  destroy(req: IRequest, res: IResponse): Promise<void>;
}
