/**
 * User Controller (compat)
 *
 * This file remains for backwards-compatibility. The actual implementation is
 * QueryBuilder-backed and lives in UserQueryBuilderController.
 */

export {
  UserQueryBuilderController as UserController,
  UserQueryBuilderController,
} from '@app/Controllers/UserQueryBuilderController';

export { UserQueryBuilderController as default } from '@app/Controllers/UserQueryBuilderController';
