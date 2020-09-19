const _ = require("lodash");
const assert = require("assert");
const uuid = require("uuid");
const {
  Lexicon
} = require("./models");

function generateLexiconKey(accountId, modelName, field) {
  return `${modelName}-${field}-${accountId}-${uuid.v4()}`;
}

function allSupportedContexts() {
  return [
    "app",
    "websales",
    "vue",
    "calendarwebsales"
  ];
}

function allSupportedLanguages() {
  return ["en-us", "fr-fr", "de-de", "nl-nl", "es-ar"];
}

function _findAll(simpleDao, propertiesToMatch) {
  return simpleDao.for(Lexicon)
    .find({
      $or: propertiesToMatch
    })
    .toArray();
}

async function insertMany(simpleDao, lexiconEntries) {
  lexiconEntries.forEach((entry) => {
    const requiredKeys = ["name", "values", "context"];
    const optionalKeys = ["accountId"];
    const keys = Object.keys(entry);
    const missingKeys = _.difference(requiredKeys, keys);
    const unknownKeys = _.without(keys, ...requiredKeys, ...optionalKeys);

    assert(missingKeys.length === 0,
      `lexicon entry with name ${entry.name} is missing the following required keys: ${missingKeys.join(", ")}`);
    assert(unknownKeys.length === 0,
      `lexicon entry with name ${entry.name} contains the following unknown keys: ${unknownKeys.join(", ")}`);
  });

  const db = await simpleDao.connect();
  const lexiconEntryNames = lexiconEntries.map(_.property("name"));
  const lexiconEntryKeys = lexiconEntries.map((entry) => {
    if (entry.accountId) {
      return generateLexiconKey(entry.name, entry.accountId);
    }

    return entry.name;
  });
  const namesToKeys = _.fromPairs(_.zip(lexiconEntryNames, lexiconEntryKeys));
  const dataToInsert = lexiconEntries.map((entry) => {
    return Object.assign({}, entry, {
      key: namesToKeys[entry.name]
    });
  }).map((entry) => {
    return _.omit(entry, ["name"]);
  });

  let succeededOperations = [];
  let failedOperations = [];

  try {
    const writeResult = await db.collection(Lexicon.collectionName()).insertMany(dataToInsert, {
      ordered: false
    });
    succeededOperations = writeResult.ops;
  } catch (err) {
    // err.writeErrors will exist when multiple inserts fail, but not when only one insert fails
    const writeErrors = err.writeErrors ? err.writeErrors.map(_.property("err")) : [err];

    writeErrors.forEach((writeError) => {
      if (!writeError.op) {
        // Unexpected error from Mongo that we do not know how to handle
        throw err;
      }
    });

    failedOperations = writeErrors.map((writeError) => {
      return Object.assign({
        message: writeError.errmsg
      }, writeError.op);
    });
    succeededOperations = dataToInsert.filter((entry) => {
      return !failedOperations.some((failedOperation) => {
        return failedOperation.key === entry.key;
      });
    });
  }

  return {
    successes: succeededOperations.map((operation) => {
      return {
        name: _.findKey(namesToKeys, (key) => {
          return key === operation.key;
        }),
        key: operation.key
      };
    }),
    failures: failedOperations.map((operation) => {
      return {
        name: _.findKey(namesToKeys, (key) => {
          return key === operation.key;
        }),
        message: operation.message
      };
    })
  };
}


async function updateMany(simpleDao, lexiconEntryUpdates) {
  assert(Array.isArray(lexiconEntryUpdates) && lexiconEntryUpdates.length > 0,
    "lexiconEntryUpdates must be an array with at least one item");

  const _lexiconEntryUpdates = lexiconEntryUpdates.map((entry) => {
    return Object.assign({}, entry, {
      accountId: entry.accountId || ""
    });
  });

  _lexiconEntryUpdates.forEach((entry) => {
    const requiredKeys = ["key"];
    const optionalKeys = ["values", "context", "accountId"];
    const keys = Object.keys(entry);
    const missingKeys = _.difference(requiredKeys, keys);
    const unknownKeys = _.without(keys, ...requiredKeys, ...optionalKeys);

    assert(missingKeys.length === 0, "lexicon update request is missing a \"key\"");
    assert(unknownKeys.length === 0,
      `lexicon update request with key ${entry.key} contains the following unknown properties: ${unknownKeys.join(", ")}`);
  });

  const lexiconEntryIdentifiers = _lexiconEntryUpdates.map((update) => {
    return _.pick(update, ["key", "accountId"]);
  });
  const findExistingLexiconEntries = _findAll(simpleDao, lexiconEntryIdentifiers);
  const getDbConnection = simpleDao.connect();
  const [existingLexiconEntries, db] = await Promise.all([findExistingLexiconEntries, getDbConnection]);
  const entriesNotFound = _lexiconEntryUpdates.filter((update) => {
    return !_.some(existingLexiconEntries, _.matches({
      key: update.key,
      accountId: update.accountId
    }));
  });
  const bulkUpdateOperation = db.collection(Lexicon.collectionName()).initializeUnorderedBulkOp();

  if (entriesNotFound.length > 0) {
    throw new Error(`The following lexicon entries do not exist: \n${JSON.stringify(
      entriesNotFound.map((entry) => {
        return {
          key: entry.key
        };
      }), null, 2
    )}`);
  }

  _lexiconEntryUpdates.forEach((entry) => {
    let updateInstructions = {
      ..._.mapKeys(entry.values, (_value, key) => {
        return `values.${key}`;
      }),
      context: entry.context
    };

    updateInstructions = _.omitBy(updateInstructions, _.isNil);
    bulkUpdateOperation.find({
      key: entry.key, accountId: entry.accountId
    }).updateOne({
      $set: updateInstructions
    });
  });

  const executionResult = await bulkUpdateOperation.execute();
  assert(executionResult.nMatched === _lexiconEntryUpdates.length,
    "Unexpected error: database operation did not match all requested lexicon entries");
  return _findAll(simpleDao, lexiconEntryIdentifiers);
}

async function find(simpleDao, key, accountIds = [], context = allSupportedContexts(), lexiconSuffix, accountOnly) {
  const query = {
    accountId: {
      $in: ["", ...accountIds]
    }
  };
  if (accountOnly) {
    query.accountId = {
      $in: accountIds
    };
  } else {
    query.context = {
      $in: context
    };
  }
  if (key) {
    query.key = key;
  }
  const lexicon = Lexicon.loadLexicon(lexiconSuffix);
  const lexicons = await simpleDao.for(lexicon)
    .find(query)
    .toArray();
  return {
    lexicons
  };
}


module.exports = {
  allSupportedContexts,
  allSupportedLanguages,
  find,
  generateLexiconKey,
  insertMany,
  updateMany
};
