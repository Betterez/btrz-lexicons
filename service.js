const assert = require("assert");
const uuid = require("uuid");
const {
  allSupportedContexts,
  allSupportedLanguages,
  Lexicon
} = require("./models");

function generateLexiconKey(accountId, modelName, field) {
  return `${modelName}-${field}-${accountId}-${uuid.v4()}`;
}

function _findAll(simpleDao, propertiesToMatch) {
  return simpleDao.for(Lexicon)
    .find({
      $or: propertiesToMatch
    })
    .toArray();
}

function difference(requiredKeys, keys) {
  return requiredKeys.filter((x) => {
    return !keys.includes(x);
  });
}

function findKeyFromValue(obj, value) {
  const keys = Object.keys(obj);
  const values = Object.values(obj);
  const index = values.indexOf(value);
  return keys[index];
}

function checkInvalidEntries(lexiconEntries) {
  const invalidEntries = lexiconEntries.filter((entry) => {
    return entry.key && entry.accountId && entry.accountId.length > 0 && !entry.key.split("-").find((part) => {
      return entry.accountId === part;
    });
  });

  if (invalidEntries.length > 0) {
    throw new Error(`Incomplete lexicon keys: ${invalidEntries.map((entry) => {
      return entry.key;
    }).join(", ")}`);
  }
}

async function createOrUpdateMany(simpleDao, lexiconEntries) {
  assert(Array.isArray(lexiconEntries) && lexiconEntries.length > 0,
    "lexiconEntries must be an array with at least one item");

  lexiconEntries.forEach((entry) => {
    const requiredKeys = ["key", "values", "context"];
    const optionalKeys = ["accountId"];
    const keys = Object.keys(entry);
    const missingKeys = difference(requiredKeys, keys);
    const unknownKeys = difference(keys, requiredKeys.concat(optionalKeys));

    assert(missingKeys.length === 0,
      `lexicon entry with key ${entry.key} is missing the following required keys: ${missingKeys.join(", ")}`);
    assert(unknownKeys.length === 0,
      `lexicon entry with key ${entry.key} contains the following unknown keys: ${unknownKeys.join(", ")}`);
  });

  checkInvalidEntries(lexiconEntries);

  const db = await simpleDao.connect();
  const promises = lexiconEntries.map((entry) => {
    const query = {
      key: entry.key,
      accountId: entry.accountId
    };
    return db.collection(Lexicon.collectionName())
      .update(
        query,
        entry,
        {
          upsert: true
        }
      );
  });
  const results = Promise.allSettled(promises);
  return results;
}

async function insertMany(simpleDao, lexiconEntries) {
  lexiconEntries.forEach((entry) => {
    const requiredKeys = ["name", "values", "context"];
    const optionalKeys = ["accountId"];
    const keys = Object.keys(entry);
    const missingKeys = difference(requiredKeys, keys);
    const unknownKeys = difference(keys, requiredKeys.concat(optionalKeys));

    assert(missingKeys.length === 0,
      `lexicon entry with name ${entry.name} is missing the following required keys: ${missingKeys.join(", ")}`);
    assert(unknownKeys.length === 0,
      `lexicon entry with name ${entry.name} contains the following unknown keys: ${unknownKeys.join(", ")}`);
  });

  const db = await simpleDao.connect();
  const lexiconEntryNames = lexiconEntries.map((e) => {
    return e.name;
  });
  const lexiconEntryKeys = lexiconEntries.map((entry) => {
    if (entry.accountId) {
      return generateLexiconKey(entry.name, entry.accountId);
    }

    return entry.name;
  });

  const namesToKeys = lexiconEntryNames.reduce((ntk, len, index) => {
    // eslint-disable-next-line no-param-reassign
    ntk[len] = lexiconEntryKeys[index];
    return ntk;
  }, {});
  const dataToInsert = lexiconEntries.map((entry) => {
    const obj = Object.assign({}, entry, {
      key: namesToKeys[entry.name]
    });
    delete obj.name;
    return obj;
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
    const writeErrors = err.writeErrors ? err.writeErrors.map((e) => {
      return e.err;
    }) : [err];
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
        name: findKeyFromValue(namesToKeys, operation.key),
        key: operation.key
      };
    }),
    failures: failedOperations.map((operation) => {
      return {
        name: findKeyFromValue(namesToKeys, operation.key),
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
    const missingKeys = difference(requiredKeys, keys);
    const unknownKeys = difference(keys, requiredKeys.concat(optionalKeys));


    assert(missingKeys.length === 0, "lexicon update request is missing a \"key\"");
    assert(unknownKeys.length === 0,
      `lexicon update request with key ${entry.key} contains the following unknown properties: ${unknownKeys.join(", ")}`);
  });

  const lexiconEntryIdentifiers = _lexiconEntryUpdates.map((update) => {
    return {
      key: update.key,
      accountId: update.accountId
    };
  });

  checkInvalidEntries(lexiconEntryIdentifiers);

  const findExistingLexiconEntries = _findAll(simpleDao, lexiconEntryIdentifiers);
  const getDbConnection = simpleDao.connect();
  const [existingLexiconEntries, db] = await Promise.all([findExistingLexiconEntries, getDbConnection]);

  const entriesNotFound = _lexiconEntryUpdates.filter((update) => {
    return !existingLexiconEntries.some((e) => {
      return e.key === update.key && e.accountId === update.accountId;
    });
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
    const updateInstructions = Object.keys(entry.values || {})
      .reduce((obj, key) => {
        if (entry.values[key]) {
          // eslint-disable-next-line no-param-reassign
          obj[`values.${key}`] = entry.values[key];
        }
        return obj;
      }, {});
    if (entry.context) {
      updateInstructions.context = entry.context;
    }
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

function filterLexiconValuesByLanguage(values, languages) {
  let result = {};
  languages.forEach((language) => {
    if (values[language] !== undefined) {
      result = Object.assign(result, {[language]: values[language]});
    }
  });
  return result;
}

// eslint-disable-next-line max-params
async function find(simpleDao, key, accountIds = [], context = allSupportedContexts(), accountOnly, keys, language, languages) {
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
  } else if (keys) {
    query.key = {
      $in: keys
    };
  }

  let lexicons = await simpleDao.for(Lexicon)
    .find(query)
    .toArray();

  let langs = [];
  if (language) {
    langs = [language];
  }
  if (languages) { 
    langs = languages;
  }
  langs = langs.filter((lang) => {
    return allSupportedLanguages().includes(lang);
  });
  if (langs.length > 0) {
    lexicons = lexicons.map((lex) => {
      return Object.assign(lex, {values: filterLexiconValuesByLanguage(lex.values, langs)});
    });
  }

  return {
    lexicons
  };
}

function langToKeyValue(lang) {
  switch (lang) {
    case "en":
      return {
        key: "en-us",
        value: "english"
      };
    case "fr":
      return {
        key: "fr-fr",
        value: "french"
      };
    case "nl":
      return {
        key: "nl-nl",
        value: "dutch"
      };
    case "de":
      return {
        key: "de-de",
        value: "german"
      };
    case "es":
      return {
        key: "es-ar",
        value: "spanish"
      };
    case "frca":
      return {
        key: "fr-ca",
        value: "frenchCanada"
      };
    default:
      return {
        key: "en-us",
        value: "english"
      };
  }
}

function langToIso(lang) {
  switch (lang) {
    case "en":
      return "en-us";
    case "fr":
      return "fr-fr";
    case "nl":
      return "nl-nl";
    case "de":
      return "de-de";
    case "es":
      return "es-ar";
    case "frca":
      return "fr-ca";
    default:
      return "en-us";
  }
}

function isoToLang(iso) {
  switch (iso) {
    case "en-us":
      return "en";
    case "fr-fr":
      return "fr";
    case "nl-nl":
      return "nl";
    case "de-de":
      return "de";
    case "es-ar":
      return "es";
    case "fr-ca":
      return "frca";
    default:
      return "en";
  }
}

function langToName(lang) {
  switch (lang) {
    case "en":
      return "english";
    case "fr":
      return "french";
    case "nl":
      return "dutch";
    case "de":
      return "german";
    case "es":
      return "spanish";
    case "frca":
      return "frenchCanada";
    default:
      return "english";
  }
}

function isoToName(iso) {
  switch (iso) {
    case "en-us":
      return "english";
    case "fr-fr":
      return "french";
    case "nl-nl":
      return "dutch";
    case "de-de":
      return "german";
    case "es-ar":
      return "spanish";
    case "fr-ca":
      return "frenchCanada";
    default:
      return "english";
  }
}

function keyValueLangs(langPreferences) {
  const langs = langPreferences || {};
  return Object.keys(langs).reduce((acc, k) => {
    if (langs[k]) {
      acc.push(langToKeyValue(k));
    }
    return acc;
  }, []);
}

function getLanguagesISOCodeMap() {
  const languages = allSupportedLanguages();
  const languageISOCodeMap = languages.reduce((acc, lang) => {
    const languageIso = isoToLang(lang);
    if (languageIso) {
      if (Object.keys(acc).length < 1) {
        return {[languageIso]: lang};
      }
      return {...acc, [languageIso]: lang};
    }
    console.error(`Invalid language name for ISO code ${lang}`);
    return acc;
  }, {});
  return languageISOCodeMap;
}

function getLanguagesISOEmptyObject() {
  const languages = allSupportedLanguages();
  const languageISOEmptyObject = languages.reduce((acc, lang) => {
    if (lang) {
      if (Object.keys(acc).length < 1) {
        return {[lang]: ""};
      }
      return {...acc, [lang]: ""};
    }
    console.error(`Invalid language name for ISO code ${lang}`);
    return acc;
  }, {});
  return languageISOEmptyObject;
}

function getLanguagesISONameMap() {
  const languages = allSupportedLanguages();
  const languageISONameMap = languages.reduce((acc, lang) => {
    const languageName = isoToName(lang);
    if (lang) {
      if (Object.keys(acc).length < 1) {
        return {[lang]: languageName};
      }
      return {...acc, [lang]: languageName};
    }
    console.error(`Invalid language name for ISO code ${lang}`);
    return acc;
  }, {});
  return languageISONameMap;
}

module.exports = {
  allSupportedContexts,
  allSupportedLanguages,
  createOrUpdateMany,
  find,
  generateLexiconKey,
  insertMany,
  isoToName,
  keyValueLangs,
  langToIso,
  isoToLang,
  langToName,
  updateMany,
  getLanguagesISOCodeMap,
  getLanguagesISOEmptyObject,
  getLanguagesISONameMap
};
