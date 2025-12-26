/**
 * User Controller
 * Example controller demonstrating request handling
 */

import { User } from '@app/Models/User';
import { Logger } from '@config/logger';
import { IRequest } from '@http/Request';
import { IResponse } from '@http/Response';

/**
 * User Controller Interface
 */
export interface IUserController {
  index(req: IRequest, res: IResponse): Promise<void>;
  show(req: IRequest, res: IResponse): Promise<void>;
  create(req: IRequest, res: IResponse): Promise<void>;
  store(req: IRequest, res: IResponse): Promise<void>;
  edit(req: IRequest, res: IResponse): Promise<void>;
  update(req: IRequest, res: IResponse): Promise<void>;
  destroy(req: IRequest, res: IResponse): Promise<void>;
}

/**
 * User Controller Methods
 */
const userControllerMethods: IUserController = {
  /**
   * List all users
   * GET /users
   */
  async index(_req: IRequest, res: IResponse): Promise<void> {
    try {
      const users = await User.all();
      res.json({ data: users });
    } catch (error) {
      Logger.error('Error fetching users:', error);
      res.status(500).json({ error: 'Failed to fetch users' });
    }
  },

  /**
   * Show a specific user
   * GET /users/:id
   */
  async show(req: IRequest, res: IResponse): Promise<void> {
    try {
      const id = req.params['id'];
      const user = await User.find(id);
      if (user === null) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      res.json({ data: user });
    } catch (error) {
      Logger.error('Error fetching user:', error);
      res.status(500).json({ error: 'Failed to fetch user' });
    }
  },

  /**
   * Show create form
   * GET /users/create
   */
  async create(_req: IRequest, res: IResponse): Promise<void> {
    res.json({ form: 'Create User Form' });
  },

  /**
   * Store a new user
   * POST /users
   */
  async store(req: IRequest, res: IResponse): Promise<void> {
    try {
      const body = req.body;
      if (typeof body['name'] !== 'string' || !body['name']) {
        res.status(422).json({ error: 'Name is required' });
        return;
      }
      const user = User.create(body);
      res.status(201).json({ message: 'User created', user });
    } catch (error) {
      Logger.error('Error creating user:', error);
      res.status(500).json({ error: 'Failed to create user' });
    }
  },

  /**
   * Show edit form
   * GET /users/:id/edit
   */
  async edit(_req: IRequest, res: IResponse): Promise<void> {
    try {
      res.json({ form: 'Edit User Form' });
    } catch (error) {
      Logger.error('Error loading edit form:', error);
      res.status(500).json({ error: 'Failed to load edit form' });
    }
  },

  /**
   * Update a user
   * PUT /users/:id
   */
  async update(req: IRequest, res: IResponse): Promise<void> {
    try {
      const id = req.params['id'];
      const user = await User.find(id);
      if (user === null) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      const body = req.body;
      user.fill(body);
      await user.save();
      res.json({ message: 'User updated', user });
    } catch (error) {
      Logger.error('Error updating user:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  },

  /**
   * Delete a user
   * DELETE /users/:id
   */
  async destroy(req: IRequest, res: IResponse): Promise<void> {
    try {
      const id = req.params['id'];
      const user = await User.find(id);
      if (user === null) {
        res.status(404).json({ error: 'User not found' });
        return;
      }
      await user.delete();
      res.json({ message: 'User deleted' });
    } catch (error) {
      Logger.error('Error deleting user:', error);
      res.status(500).json({ error: 'Failed to delete user' });
    }
  },
};

/**
 * User Controller Factory
 */
export const UserController = {
  /**
   * Create a new user controller instance
   */
  create(): IUserController {
    return userControllerMethods;
  },
};

export default UserController;
