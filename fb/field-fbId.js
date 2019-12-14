import { Text } from '@keystonejs/fields';
import { importView } from '@keystonejs/build-field-types';
import { KnexFieldAdapter } from '@keystonejs/adapter-knex';

import { FirebaseFieldAdapter } from './adapter-fb';

export class FbIdImplementation extends Implementation {
  gqlOutputFields() {
    return [`${this.path}: ID`];
  }
  gqlOutputFieldResolvers() {
    return { [`${this.path}`]: item => item[this.path] };
  }
  gqlQueryInputFields() {
    return [...this.equalityInputFields('ID'), ...this.inInputFields('ID')];
  }
  get gqlUpdateInputFields() {
    return [`${this.path}: ID`];
  }
  get gqlCreateInputFields() {
    return [`${this.path}: ID`];
  }
}

const validator = a => (a ? /^[0-9a-fA-F]{24}$/.test(a.toString()) : true);
const normaliseValue = a => (a ? a.toString().toLowerCase() : null);

export class FbMongoIdInterface extends FirebaseFieldAdapter {
  addToMongooseSchema(schema, mongoose) {
    // If this field is the primary key we actually don't have to add it; it's implicit
    if (this.field.isPrimaryKey) return;

    const schemaOptions = {
      type: String,
      validate: {
        validator: this.buildValidator(validator),
        message: '{VALUE} is not a valid Mongo ObjectId',
      },
    };
    schema.add({
      [this.field.isPrimaryKey ? '_id' : this.path]: this.mergeSchemaOptions(
        schemaOptions,
        this.config
      ),
    });
  }

  setupHooks({ addPreSaveHook, addPostReadHook }) {
    if (!this.field.isPrimaryKey) return;

    addPreSaveHook(item => {
      if (item.id) {
        item._id = item.id;
        delete item.id;
      }
      return item;
    });
    addPostReadHook(itemOrModel => {
      // Sometimes this is called with a mongoose model, sometimes with an object and sometimes with null
      // I do no know why
      const item = itemOrModel && itemOrModel.toObject ? itemOrModel.toObject() : itemOrModel;

      if (item && item._id) {
        item.id = item._id.toString();
        delete item._id;
      }
      return item;
    });
  }

  getQueryConditions(dbPath) {
    const mongoose = this.listAdapter.parentAdapter.mongoose;
    return {
      ...this.equalityConditions(this.field.isPrimaryKey ? '_id' : dbPath, mongoose.Types.ObjectId),
      ...this.inConditions(this.field.isPrimaryKey ? '_id' : dbPath, mongoose.Types.ObjectId),
    };
  }
}

export class KnexMongoIdInterface extends KnexFieldAdapter {
  constructor() {
    super(...arguments);
    this.isUnique = !!this.config.isUnique;
    this.isIndexed = !!this.config.isIndexed && !this.config.isUnique;
  }

  addToTableSchema(table) {
    const column = table.string(this.path, 24);
    if (this.isUnique) column.unique();
    else if (this.isIndexed) column.index();
    if (this.isNotNullable) column.notNullable();
    if (this.defaultTo) column.defaultTo(this.defaultTo);
  }

  setupHooks({ addPreSaveHook, addPostReadHook }) {
    addPreSaveHook(item => {
      const valType = typeof item[this.path];

      if (item[this.path] && valType === 'string') {
        item[this.path] = normaliseValue(item[this.path]);
      } else if (!item[this.path] || valType === 'undefined') {
        delete item[this.path];
      } else {
        // Should have been caught by the validator??
        throw `Invalid value given for '${this.path}'`;
      }

      return item;
    });
    addPostReadHook(item => {
      if (item[this.path]) {
        item[this.path] = normaliseValue(item[this.path]);
      }
      return item;
    });
  }

  getQueryConditions(dbPath) {
    return {
      ...this.equalityConditions(dbPath, normaliseValue),
      ...this.inConditions(dbPath, normaliseValue),
    };
  }
}

export const FirebaseId = {
  type: 'MongoId',
  implementation: FbIdImplementation,
  views: {
    Controller: importView('./views/Controller'),
    Field: Text.views.Field,
    Filter: importView('./views/Filter'),
  },
  adapters: {
    // knex: KnexMongoIdInterface,
    admin: FbId,
  },

  primaryKeyDefaults: {
    knex: {
      getConfig: () => {
        throw `The Uuid field type doesn't provide a default primary key field configuration for knex. ` +
        `You'll need to supply your own 'id' field for each list or use a different field type for your ` +
        `ids (eg '@keystonejs/fields-auto-increment').`;
      },
    },
    mongoose: {
      getConfig: () => ({ type: MongoId }),
    },
  },
};
