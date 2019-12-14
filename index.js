
const { Keystone } = require('@keystonejs/keystone');
const { PasswordAuthStrategy } = require('@keystonejs/auth-password');
const { Text, Checkbox, Password, Select } = require('@keystonejs/fields');
const { GraphQLApp } = require('@keystonejs/app-graphql');
const { AdminUIApp } = require('@keystonejs/app-admin-ui');
const initialiseData = require('./initial-data');

const { MongooseAdapter: Adapter } = require('@keystonejs/adapter-mongoose');
const { FirebaseAdapter } = require('./fb/adapter-fb');

const PROJECT_NAME = "jubilee-dev";


const keystone = new Keystone({
  name: PROJECT_NAME,
  adapter: new FirebaseAdapter(),
  onConnect: initialiseData,
});

// Access control functions
const userIsAdmin = ({ authentication: { item: user } }) => Boolean(user && user.isAdmin);
const userOwnsItem = ({ authentication: { item: user } }) => {
  if (!user) {
    return false;
  }
  return { id: user.id };
};
const userIsAdminOrOwner = auth => {
  const isAdmin = access.userIsAdmin(auth);
  const isOwner = access.userOwnsItem(auth);
  return isAdmin ? isAdmin : isOwner;
};
const access = { userIsAdmin, userOwnsItem, userIsAdminOrOwner };

keystone.createList('User', {
  fields: {
    name: { type: Text },
    address: { type: Text },
    state: {
      type: Select,
      options: ['active', 'deactivated'],
      defaultValue: 'active',
    },
    isAdmin: { type: Checkbox, defaultValue: false },
    email: {
      type: Text,
      // 2. Only authenticated users can read/update their own email, not any other user's. Admins can read/update anyone's email.
      access: ({ existingItem, authentication }) => (
        authentication.item.isAdmin
        || existingItem.id === authentication.item.id
      ),
    },
    password: {
      type: Password,
      access: {
        // 3. Only admins can see if a password is set. No-one can read their own or other user's passwords.
        read: ({ authentication }) => authentication.item.isAdmin,
        // 4. Only authenticated users can update their own password. Admins can update anyone's password.
        update: ({ existingItem, authentication }) => (
          authentication.item.isAdmin
          || existingItem.id === authentication.item.id
        ),
      },
    },
  },
  access: {
    // 1. Only admins can read deactivated user accounts
    read: ({ authentication: { item } }) => {
      if (item.isAdmin) {
        return {}; // Don't filter any items for admins
      }
      // Approximately; users.filter(user => user.state !== 'deactivated');
      return {
        state_not: 'deactivated',
      };
    },
  },
});

const authStrategy = keystone.createAuthStrategy({
  type: PasswordAuthStrategy,
  list: 'User',
});

module.exports = {
  keystone,
  apps: [
    new GraphQLApp(),
    new AdminUIApp({
       enableDefaultRoute: true,
       authStrategy,
    }),
  ],
};
