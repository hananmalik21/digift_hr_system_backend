/**
 * Default admin users — same in every environment (local, Docker, production).
 *
 * See scripts/SEED_ADMINS.md for full documentation.
 */
export default {
  enabled: true,
  enterpriseId: 1,
  password: 'Admin!ChangeMe',
  skipIfUserExists: true,

  enterpriseAdmin: {
    user: {
      userCode: 'enterprise_admin',
      username: 'enterprise_admin',
      primaryEmail: 'enterprise_admin@localhost.local',
      firstName: 'Enterprise',
      lastName: 'Admin'
    }
  },

  superAdmin: {
    user: {
      userCode: 'super_admin',
      username: 'super_admin',
      primaryEmail: 'super_admin@localhost.local',
      firstName: 'Super',
      lastName: 'Admin'
    }
  }
};
