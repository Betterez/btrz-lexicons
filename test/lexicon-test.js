const assert = require("node:assert/strict");
const {
  describe,
  it,
  beforeEach,
  afterEach,
  after
} = require("node:test");
const {
  Chance
} = require("chance");
const chance = new Chance();
const config = require("../config.js")(process.env);
const {
  SimpleDao
} = require("btrz-simple-dao");
const simpleDao = new SimpleDao(config);
const {
  allSupportedLanguages,
  allSupportedContexts,
  createOrUpdateMany,
  keyValueLangs,
  langToIso,
  langToName,
  insertMany,
  isoToName,
  updateMany,
  generateLexiconKey,
  getLanguagesISOCodeMap,
  getLanguagesISOEmptyObject,
  getLanguagesISONameMap

} = require("../index.js");
const accountId = SimpleDao.objectId().toHexString();

const {
  Lexicon,
  LexiconFixture
} = require("../models/index.js");
const lexiconCollectionName = Lexicon.collectionName();

function getValues() {
  const values = allSupportedLanguages().reduce((obj, lan) => {
    // eslint-disable-next-line no-param-reassign
    obj[lan] = chance.sentence();
    return obj;
  }, {});

  return values;
}

function getValidLexiconEntryRequest(overrides = {}) {
  const validLexiconEntry = {
    accountId,
    name: chance.word({
      length: 20
    }),
    values: getValues(),
    context: chance.pickset(allSupportedContexts(), chance.natural({
      min: 1, max: allSupportedContexts().length
    }))
  };

  return Object.assign(validLexiconEntry, overrides);
}

function getValidLexiconUpdateRequest(overrides = {}) {
  const validLexiconUpdate = {
    key: chance.word({
      length: 20
    }),
    values: getValues(),
    context: chance.pickset(allSupportedContexts(), chance.natural({
      min: 1, max: allSupportedContexts().length
    })),
    accountId
  };

  return Object.assign(validLexiconUpdate, overrides);
}

const {
  MongoFactory,
  createFixture
} = require("btrz-mongo-factory");
const fixturesFactoryOptions = {
  "loadFromModels": true,
  "fixtures": `${__dirname}/../models`,
  "db": config.db
};
const fixturesFactory = new MongoFactory(fixturesFactoryOptions);
const requiredLexiconEntryKeys = ["name", "values", "context"];


function fail() {
  throw new Error("Test failed");
}

describe("Lexicon", () => {
  beforeEach(() => {
    return fixturesFactory.connection.then((db) => {
      // This index should match the index that exists in the production database
      return db.collection(lexiconCollectionName)
        .createIndex({
          key: 1
        }, {
          unique: true
        });
    });
  });

  afterEach(() => {
    return fixturesFactory.clearAll().then(() => {
      return simpleDao.dropCollection(lexiconCollectionName);
    });
  });

  after(async () => {
    const mongoClient = await simpleDao.getCurrentClient();
    await mongoClient.close();
  });

  describe("allSupportedLanguages", () => {
    it("should return all the supported languages", () => {
      const result = allSupportedLanguages();
      assert.deepEqual(result.length, 8);
      assert.ok(result.includes("en-us"));
      assert.ok(result.includes("fr-fr"));
      assert.ok(result.includes("nl-nl"));
      assert.ok(result.includes("de-de"));
      assert.ok(result.includes("es-ar"));
      assert.ok(result.includes("fr-ca"));
      assert.ok(result.includes("ar-ma"));
      assert.ok(result.includes("pt-br"));
      assert.ok(!result.includes("it-it"));
    });
  });

  describe("allSupportedContexts", () => {
    it("should return all the supported context", () => {
      const result = allSupportedContexts();
      assert.deepEqual(result.length, 4);
      assert.ok(result.includes("app"));
      assert.ok(result.includes("websales"));
      assert.ok(result.includes("vue"));
      assert.ok(result.includes("calendarwebsales"));
      assert.ok(!result.includes("mobile"));
    });
  });

  describe("generateLexiconKey", () => {
    it("should return a properly formatted key", () => {
      const key = generateLexiconKey("123", "something", "another");
      assert.ok(key.includes("-"));
      assert.ok(key.includes("123"));
      assert.ok(key.includes("something"));
      assert.ok(key.includes("another"));
      assert.deepEqual(key.split("-").length, 8);
    });
  });

  describe("keyValueLangs", () => {
    it("should return an array with keys for the iso lang and value as a string for values that are true", () => {
      const result = keyValueLangs({
        en: true, fr: true, es: false, nl: true, frca: true, arma: true, ptbr: true
      });
      assert.deepEqual(result.length, 6);
      assert.deepEqual(result[0], {
        key: "en-us", value: "english"
      });
      assert.deepEqual(result[1], {
        key: "fr-fr", value: "french"
      });
      assert.deepEqual(result[2], {
        key: "nl-nl", value: "dutch"
      });
      assert.deepEqual(result[3], {
        key: "fr-ca", value: "frenchCanada"
      });
      assert.deepEqual(result[4], {
        key: "ar-ma", value: "arabicMarocco"
      });
      assert.deepEqual(result[5], {
        key: "pt-br", value: "portugueseBrazil"
      });
    });
  });

  describe("langToIso", () => {
    it("should map two letters lang to the iso used in lexicons", () => {
      assert.deepEqual(langToIso("en"), "en-us");
      assert.deepEqual(langToIso("fr"), "fr-fr");
      assert.deepEqual(langToIso("nl"), "nl-nl");
      assert.deepEqual(langToIso("de"), "de-de");
      assert.deepEqual(langToIso("es"), "es-ar");
      assert.deepEqual(langToIso("frca"), "fr-ca");
      assert.deepEqual(langToIso("arma"), "ar-ma");
      assert.deepEqual(langToIso("ptbr"), "pt-br");
    });

    it("should default to english", () => {
      assert.deepEqual(langToIso(), "en-us");
    });
  });

  describe("langToName", () => {
    it("return english by default", () => {
      assert.deepEqual(langToName(), "english");
    });

    it("return the proper name", () => {
      assert.deepEqual(langToName("en"), "english");
      assert.deepEqual(langToName("fr"), "french");
      assert.deepEqual(langToName("de"), "german");
      assert.deepEqual(langToName("nl"), "dutch");
      assert.deepEqual(langToName("es"), "spanish");
      assert.deepEqual(langToName("frca"), "frenchCanada");
      assert.deepEqual(langToName("arma"), "arabicMarocco");
      assert.deepEqual(langToName("ptbr"), "portugueseBrazil");
      assert.deepEqual(langToName("kl"), "english");
    });
  });

  describe("isoToName", () => {
    it("return english by default", () => {
      assert.deepEqual(isoToName(), "english");
    });

    it("return the proper name", () => {
      assert.deepEqual(isoToName("en-us"), "english");
      assert.deepEqual(isoToName("fr-fr"), "french");
      assert.deepEqual(isoToName("de-de"), "german");
      assert.deepEqual(isoToName("nl-nl"), "dutch");
      assert.deepEqual(isoToName("es-ar"), "spanish");
      assert.deepEqual(isoToName("fr-ca"), "frenchCanada");
      assert.deepEqual(isoToName("ar-ma"), "arabicMarocco");
      assert.deepEqual(isoToName("pt-br"), "portugueseBrazil");
      assert.deepEqual(isoToName("kl"), "english");
    });
  });

  describe("#insertMany()", () => {
    requiredLexiconEntryKeys.forEach((key) => {
      it(`should reject if any of the provided lexicon entries is missing a "${key}"`, () => {
        const lexiconEntries = [getValidLexiconEntryRequest(), getValidLexiconEntryRequest()];
        Reflect.deleteProperty(lexiconEntries[1], key);

        return insertMany(simpleDao, lexiconEntries)
          .then(fail, (err) => {
            assert.strictEqual(err.message, `lexicon entry with name ${lexiconEntries[1].name} ` +
              `is missing the following required keys: ${key}`);
          });
      });
    });

    it("should reject if any of the provided lexicon entries contains an unknown property", () => {
      const lexiconEntries = [getValidLexiconEntryRequest(), getValidLexiconEntryRequest({
        unknownProperty: "someValue"
      })];

      return insertMany(simpleDao, lexiconEntries)
        .then(fail, (err) => {
          assert.strictEqual(err.message, `lexicon entry with name ${lexiconEntries[1].name} ` +
            "contains the following unknown keys: unknownProperty");
        });
    });

    it("should correctly save entries that don't specify an 'accountId'", () => {
      const iterations = chance.natural({
        min: 1, max: 10
      });
      const lexiconEntries = [];
      for (let i = 0; i < iterations; i++) {
        lexiconEntries.push(getValidLexiconEntryRequest());
      }
      let allReturnedKeys = null;

      lexiconEntries.forEach((entry) => {
        Reflect.deleteProperty(entry, "accountId");
      });

      return simpleDao.for(Lexicon)
        .find({
          key: {
            $in: lexiconEntries.map((l) => {
              return l.name;
            })
          }
        })
        .toArray()
        .then((existingEntries) => {
          assert.strictEqual(existingEntries.length, 0);
          return insertMany(simpleDao, lexiconEntries);
        })
        .then((result) => {
          allReturnedKeys = result.successes.map((s) => {
            return s.key;
          });

          assert.deepEqual(result, {
            successes: lexiconEntries.map((entry) => {
              return {
                name: entry.name,
                key: entry.name
              };
            }),
            failures: []
          });

          return simpleDao.for(Lexicon)
            .find({
              key: {
                $in: allReturnedKeys
              }
            })
            .toArray();
        })
        .then((insertedEntries) => {
          assert.strictEqual(insertedEntries.length, lexiconEntries.length);
        });
    });

    it("should correctly save entries that do specify an 'accountId'", () => {
      const iterations = chance.natural({
        min: 1, max: 10
      });
      const lexiconEntries = [];
      for (let i = 0; i < iterations; i++) {
        lexiconEntries.push(getValidLexiconEntryRequest());
      }

      let allReturnedKeys = null;

      return insertMany(simpleDao, lexiconEntries)
        .then((result) => {
          allReturnedKeys = result.successes.map((s) => {
            return s.key;
          });

          assert.deepEqual(result, {
            successes: lexiconEntries.map((entry) => {
              const keyForName = result.successes.find((successRecord) => {
                return successRecord.name === entry.name;
              }).key;

              return {
                name: entry.name,
                key: keyForName
              };
            }),
            failures: []
          });

          result.successes.forEach((successRecord) => {
            // When creating lexicon entries for an account, the key should include the account ID and a random uuid string
            assert.ok(successRecord.key.includes(successRecord.name));
            assert.ok(successRecord.key.includes(accountId));
          });

          return simpleDao.for(Lexicon)
            .find({
              key: {
                $in: allReturnedKeys
              }
            })
            .toArray();
        })
        .then((insertedEntries) => {
          assert.strictEqual(insertedEntries.length, lexiconEntries.length);
        });
    });

    it("should indicate a failure when a single new lexicon entry conflicts with an existing entry", () => {
      const lexiconEntries = [getValidLexiconEntryRequest()];

      lexiconEntries.forEach((entry) => {
        Reflect.deleteProperty(entry, "accountId");
      });

      return insertMany(simpleDao, lexiconEntries)
        .then(() => {
          return insertMany(simpleDao, lexiconEntries);
        })
        .then((result) => {
          assert.deepEqual(result.successes, []);
          assert.strictEqual(result.failures.length, lexiconEntries.length);

          result.failures.forEach((failure) => {
            const matchingLexiconEntry = lexiconEntries.find((e) => {
              return e.name === failure.name;
            });
            assert.ok(matchingLexiconEntry !== undefined && matchingLexiconEntry !== null);
            assert.deepEqual(failure.name, matchingLexiconEntry.name);
            assert.ok(failure.message.includes("E11000 duplicate key error"));
            assert.ok(failure.message.includes(`${matchingLexiconEntry.name}`));
          });
        });
    });

    it("should indicate a failure when multiple new lexicon entries conflict with existing entries", () => {
      const lexiconEntries = [getValidLexiconEntryRequest(), getValidLexiconEntryRequest()];

      lexiconEntries.forEach((entry) => {
        Reflect.deleteProperty(entry, "accountId");
      });

      return insertMany(simpleDao, lexiconEntries)
        .then(() => {
          return insertMany(simpleDao, lexiconEntries);
        })
        .then((result) => {
          assert.deepEqual(result.successes, []);
          assert.strictEqual(result.failures.length, lexiconEntries.length);

          result.failures.forEach((failure) => {
            const matchingLexiconEntry = lexiconEntries.find((e) => {
              return e.name === failure.name;
            });
            assert.ok(matchingLexiconEntry !== undefined && matchingLexiconEntry !== null);
            assert.deepEqual(failure.name, matchingLexiconEntry.name);
            assert.ok(failure.message.includes("E11000 duplicate key error"));
            assert.ok(failure.message.includes(`${matchingLexiconEntry.name}`));
          });
        });
    });

    // eslint-disable-next-line max-len
    it("should indicate which lexicon entries were inserted and which entries were not inserted when only some entries are successfully inserted", () => {
      const failedEntries = [getValidLexiconEntryRequest(), getValidLexiconEntryRequest()];
      let lexiconEntries1 = [];
      let lexiconEntries2 = [];
      for (let i = 0; i < 4; i++) {
        lexiconEntries1.push(getValidLexiconEntryRequest());
        lexiconEntries2.push(getValidLexiconEntryRequest());
      }
      lexiconEntries1 = lexiconEntries1.concat(failedEntries);
      lexiconEntries2 = lexiconEntries2.concat(failedEntries);

      [...lexiconEntries1, ...lexiconEntries2].forEach((entry) => {
        Reflect.deleteProperty(entry, "accountId");
      });

      return insertMany(simpleDao, lexiconEntries1)
        .then(() => {
          return insertMany(simpleDao, lexiconEntries2);
        })
        .then((result) => {
          assert.deepEqual(result.successes, lexiconEntries2.slice(0, 4).map((entry) => {
            return {
              name: entry.name,
              key: entry.name
            };
          }));

          assert.strictEqual(result.failures.length, failedEntries.length);

          result.failures.forEach((failure) => {
            const matchingLexiconEntry = failedEntries.find((e) => {
              return e.name === failure.name;
            });
            assert.ok(matchingLexiconEntry !== undefined && matchingLexiconEntry !== null);
            assert.deepEqual(failure.name, matchingLexiconEntry.name);
            assert.ok(failure.message.includes("E11000 duplicate key error"));
            assert.ok(failure.message.includes(`${matchingLexiconEntry.name}`));
          });
        });
    });

    it("should rethrow the error returned by the database when the database operation returns an unexpected error", async () => {
      const unexpectedDatabaseError = new Error("Unexpected database error");
      const mockDao = {
        connect() {
          return Promise.resolve({
            collection() {
              return {
                insertMany() {
                  return Promise.reject(unexpectedDatabaseError);
                }
              };
            }
          });
        }
      };

      return insertMany(mockDao, [getValidLexiconEntryRequest()])
        .then(fail, (err) => {
          assert.deepEqual(err, unexpectedDatabaseError);
        });
    });
  });

  describe("#updateMany()", () => {
    it("should reject if any of the provided lexicon entry updates is missing a \"key\"", async () => {
      const lexiconUpdateRequests = [getValidLexiconUpdateRequest(), getValidLexiconUpdateRequest()];
      Reflect.deleteProperty(lexiconUpdateRequests[1], "key");

      try {
        await updateMany(simpleDao, lexiconUpdateRequests);
        fail();
      } catch (err) {
        assert.strictEqual(err.message, "lexicon update request is missing a \"key\"");
      }
    });

    it("should reject if any of the provided lexicon entry updates contains an unknown property", async () => {
      const lexiconEntries = [getValidLexiconUpdateRequest(), getValidLexiconUpdateRequest({
        unknownProperty: "someValue"
      })];

      try {
        await updateMany(simpleDao, lexiconEntries);
        fail();
      } catch (err) {
        assert.strictEqual(err.message, `lexicon update request with key ${lexiconEntries[1].key} ` +
          "contains the following unknown properties: unknownProperty");
      }
    });

    it("should reject if provided with a zero-length array of lexicon entry updates", async () => {
      try {
        await updateMany(simpleDao, []);
        fail();
      } catch (err) {
        assert.strictEqual(err.message, "lexiconEntryUpdates must be an array with at least one item");
      }
    });

    it("should reject if provided with accountId and a key without the format: {key}-{accountId}", async () => {
      const updateEntries = [getValidLexiconUpdateRequest({
        key: chance.word()
      })];
      try {
        await updateMany(simpleDao, updateEntries);
        fail();
      } catch (err) {
        assert.strictEqual(err.message, `Incomplete lexicon keys: ${updateEntries[0].key}`);
      }
    });

    it("should reject with a meaningful ValidationError if any lexicon entry update specifies a non-existent lexicon key", async () => {
      const lexiconDbDocument = LexiconFixture.getLexiconFixtureMock(chance, {
        _id: SimpleDao.objectId(),
        accountId
      });
      const updateRequest = getValidLexiconUpdateRequest({
        key: `${chance.word()}-${accountId}`
      });
      await LexiconFixture.create(createFixture, SimpleDao, fixturesFactory, lexiconDbDocument);

      try {
        await updateMany(simpleDao, [updateRequest]);
      } catch (error) {
        assert.ok(error.message.includes("The following lexicon entries do not exist: "));
      }
    });

    // eslint-disable-next-line max-len
    it("should reject with a meaningful ValidationError if any lexicon entry update specifies a valid lexicon key but an incorrect accountId", async () => {
      const otherAccountId = chance.hash();
      const lexiconDbDocument = LexiconFixture.getLexiconFixtureMock(chance, {
        _id: SimpleDao.objectId(),
        accountId: otherAccountId
      });
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key
      });

      await LexiconFixture.create(createFixture, SimpleDao, fixturesFactory, lexiconDbDocument);
      try {
        await updateMany(simpleDao, [updateRequest]);
        fail();
      } catch (err) {
        assert.ok(err.message.includes("Incomplete lexicon keys: "));
      }
    });

    it("should update a lexicon entry in the global lexicon (no accountId specified)", async () => {
      const lexiconDbDocument = LexiconFixture.getLexiconFixtureMock(chance, {
        _id: SimpleDao.objectId(),
        accountId: ""
      });
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key
      });
      Reflect.deleteProperty(updateRequest, "accountId");

      await LexiconFixture.create(createFixture, SimpleDao, fixturesFactory, lexiconDbDocument);
      await updateMany(simpleDao, [updateRequest]);
      const [updatedDocument] = await simpleDao.for(Lexicon)
        .find({
          _id: lexiconDbDocument._id
        })
        .toArray();

      assert.deepEqual(updatedDocument.values, updateRequest.values);
      assert.deepEqual(updatedDocument.context, updateRequest.context);
      assert.strictEqual(updatedDocument.accountId, "");
    });

    it("should update the values contained in a single existing lexicon entry", async () => {
      const lexiconDbDocument = LexiconFixture.getLexiconFixtureMock(chance, {
        _id: SimpleDao.objectId(),
        accountId
      });
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key
      });

      await LexiconFixture.create(createFixture, SimpleDao, fixturesFactory, lexiconDbDocument);
      await updateMany(simpleDao, [updateRequest]);
      const [updatedDocument] = await simpleDao.for(Lexicon)
        .find({
          _id: lexiconDbDocument._id
        })
        .toArray();

      assert.deepEqual(updatedDocument.values, updateRequest.values);
    });

    it("should update the values contained in multiple existing lexicon entries", async () => {
      const lexiconDbDocuments = [
        LexiconFixture.getLexiconFixtureMock(chance, {
          _id: SimpleDao.objectId(),
          accountId
        }),
        LexiconFixture.getLexiconFixtureMock(chance, {
          _id: SimpleDao.objectId(),
          accountId
        })
      ];
      const updateRequests = [
        getValidLexiconUpdateRequest({
          key: lexiconDbDocuments[0].key
        }),
        getValidLexiconUpdateRequest({
          key: lexiconDbDocuments[1].key
        })
      ];

      await Promise.all(lexiconDbDocuments.map((fixture) => {
        return LexiconFixture.create(createFixture, SimpleDao, fixturesFactory, fixture);
      }));
      await updateMany(simpleDao, updateRequests);
      const updatedDocuments = await simpleDao.for(Lexicon)
        .find({
          _id: {
            $in: lexiconDbDocuments.map((d) => {
              return d._id;
            })
          }
        })
        .toArray();

      updateRequests.forEach((updateRequest) => {
        const updatedDocument = updatedDocuments.find((doc) => {
          return doc.key === updateRequest.key;
        });

        assert.ok(updatedDocument !== undefined && updatedDocument !== null);
        assert.deepEqual(updatedDocument.values, updateRequest.values);
      });
    });

    it("should only update the values for the languages specified in the update object", async () => {
      const lexiconDbDocument = LexiconFixture.getLexiconFixtureMock(chance, {
        _id: SimpleDao.objectId(),
        accountId
      });
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key,
        values: {
          [allSupportedLanguages()[0]]: chance.sentence()
        }
      });

      assert(Object.keys(lexiconDbDocument.values).length > 0,
        "Test is invalid if there is less than 2 values in the existing lexicon entry");

      await LexiconFixture.create(createFixture, SimpleDao, fixturesFactory, lexiconDbDocument);
      await updateMany(simpleDao, [updateRequest]);
      const [updatedDocument] = await simpleDao.for(Lexicon)
        .find({
          _id: lexiconDbDocument._id
        })
        .toArray();

      assert.deepEqual(updatedDocument.values, Object.assign({}, lexiconDbDocument.values, updateRequest.values));
    });

    it("should add a translation for a new language if the existing lexicon entry is missing that language", async () => {
      const existingLanguageIsoCode = allSupportedLanguages()[0];
      const newLanguageIsoCode = allSupportedLanguages()[1];
      const lexiconDbDocument = LexiconFixture.getLexiconFixtureMock(chance, {
        _id: SimpleDao.objectId(),
        values: {
          [existingLanguageIsoCode]: chance.sentence()
        },
        accountId
      });
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key,
        values: {
          [newLanguageIsoCode]: chance.sentence()
        }
      });

      assert(existingLanguageIsoCode !== newLanguageIsoCode, "Test is invalid if the existing and new languages are the same");
      assert(existingLanguageIsoCode && newLanguageIsoCode, "Test is invalid if one of the language codes is missing");

      await LexiconFixture.create(createFixture, SimpleDao, fixturesFactory, lexiconDbDocument);
      await updateMany(simpleDao, [updateRequest]);
      const [updatedDocument] = await simpleDao.for(Lexicon)
        .find({
          _id: lexiconDbDocument._id
        })
        .toArray();

      assert.deepEqual(updatedDocument.values, Object.assign({}, lexiconDbDocument.values, updateRequest.values));
    });

    it("should not update the values of a lexicon entry if the update object does not specify new values", async () => {
      const lexiconDbDocument = LexiconFixture.getLexiconFixtureMock(chance, {
        _id: SimpleDao.objectId(),
        accountId
      });
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key, values: undefined
      });

      await LexiconFixture.create(createFixture, SimpleDao, fixturesFactory, lexiconDbDocument);
      await updateMany(simpleDao, [updateRequest]);
      const [updatedDocument] = await simpleDao.for(Lexicon)
        .find({
          _id: lexiconDbDocument._id
        })
        .toArray();

      assert.deepEqual(updatedDocument.values, lexiconDbDocument.values);
    });

    it("should update the context of a single existing lexicon entry", async () => {
      const lexiconDbDocument = LexiconFixture.getLexiconFixtureMock(chance, {
        _id: SimpleDao.objectId(),
        accountId
      });
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key
      });

      await LexiconFixture.create(createFixture, SimpleDao, fixturesFactory, lexiconDbDocument);
      await updateMany(simpleDao, [updateRequest]);
      const [updatedDocument] = await simpleDao.for(Lexicon)
        .find({
          _id: lexiconDbDocument._id
        })
        .toArray();

      assert.deepEqual(updatedDocument.context, updateRequest.context);
    });

    it("should update the context of multiple existing lexicon entries", async () => {
      const lexiconDbDocuments = [LexiconFixture.getLexiconFixtureMock(chance, {
        _id: SimpleDao.objectId(),
        accountId
      }), LexiconFixture.getLexiconFixtureMock(chance, {
        _id: SimpleDao.objectId(),
        accountId
      })];
      const updateRequests = [
        getValidLexiconUpdateRequest({
          key: lexiconDbDocuments[0].key
        }),
        getValidLexiconUpdateRequest({
          key: lexiconDbDocuments[1].key
        })
      ];

      await Promise.all(lexiconDbDocuments.map((fixture) => {
        return LexiconFixture.create(createFixture, SimpleDao, fixturesFactory, fixture);
      }));
      await updateMany(simpleDao, updateRequests);
      const updatedDocuments = await simpleDao.for(Lexicon)
        .find({
          _id: {
            $in: lexiconDbDocuments.map((d) => {
              return d._id;
            })
          }
        })
        .toArray();

      updateRequests.forEach((updateRequest) => {
        const updatedDocument = updatedDocuments.find((doc) => {
          return doc.key === updateRequest.key;
        });

        assert.ok(updatedDocument !== undefined && updatedDocument !== null); //eslint-disable-line
        assert.deepEqual(updatedDocument.context, updateRequest.context);
      });
    });

    it("should not update the context of a lexicon entry if the update object does not specify new context", () => {
      const lexiconDbDocument = LexiconFixture.getLexiconFixtureMock(chance, {
        _id: SimpleDao.objectId(),
        accountId
      });
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key, context: undefined
      });

      return LexiconFixture.create(createFixture, SimpleDao, fixturesFactory, lexiconDbDocument)
        .then(() => {
          return updateMany(simpleDao, [updateRequest]);
        })
        .then(() => {
          return simpleDao.for(Lexicon)
            .find({
              _id: lexiconDbDocument._id
            })
            .toArray();
        })
        .then(([updatedDocument]) => {
          assert.deepEqual(updatedDocument.context, lexiconDbDocument.context);
        });
    });

    it("should not reject when the update sets properties to their pre-existing value (no properties change)", () => {
      const lexiconDbDocument = LexiconFixture.getLexiconFixtureMock(chance, {
        _id: SimpleDao.objectId(),
        accountId
      });
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key,
        values: lexiconDbDocument.values,
        context: lexiconDbDocument.context
      });

      return LexiconFixture.create(createFixture, SimpleDao, fixturesFactory, lexiconDbDocument)
        .then(() => {
          return updateMany(simpleDao, [updateRequest]);
        })
        .then(() => {
          return simpleDao.for(Lexicon)
            .find({
              _id: lexiconDbDocument._id
            })
            .toArray();
        })
        .then(([updatedDocument]) => {
          assert.deepEqual(updatedDocument.values, lexiconDbDocument.values);
        });
    });
  });

  describe("#createOrUpdateMany()", () => {
    it("should reject if any of the provided lexicon entry updates is missing a \"key\"", async () => {
      const lexiconUpdateRequests = [getValidLexiconUpdateRequest(), getValidLexiconUpdateRequest()];
      Reflect.deleteProperty(lexiconUpdateRequests[1], "key");

      try {
        await createOrUpdateMany(simpleDao, lexiconUpdateRequests);
        fail();
      } catch (err) {
        assert.strictEqual(err.message, "lexicon entry with key undefined is missing the following required keys: key");
      }
    });

    it("should reject if any of the provided lexicon entry updates contains an unknown property", async () => {
      const lexiconEntries = [getValidLexiconUpdateRequest(), getValidLexiconUpdateRequest({
        unknownProperty: "someValue"
      })];

      try {
        await createOrUpdateMany(simpleDao, lexiconEntries);
        fail();
      } catch (err) {
        assert.strictEqual(err.message, `lexicon entry with key ${lexiconEntries[1].key} ` +
          "contains the following unknown keys: unknownProperty");
      }
    });

    it("should reject if provided with a zero-length array of lexicon entry updates", async () => {
      try {
        await createOrUpdateMany(simpleDao, []);
        fail();
      } catch (err) {
        assert.strictEqual(err.message, "lexiconEntries must be an array with at least one item");
      }
    });

    it("should reject if provided with accountId and a key without the format: {key}-{accountId}", async () => {
      const updateEntries = [getValidLexiconUpdateRequest({
        key: chance.word()
      })];
      try {
        await createOrUpdateMany(simpleDao, updateEntries);
        fail();
      } catch (err) {
        assert.strictEqual(err.message, `Incomplete lexicon keys: ${updateEntries[0].key}`);
      }
    });

    it("should insert the values contained in a single existing lexicon entry", async () => {
      const lexiconDbDocument = LexiconFixture.getLexiconFixtureMock(chance, {
        _id: SimpleDao.objectId(),
        accountId
      });
      const newKey = `${chance.guid()}-${accountId}`;
      const updateRequest = getValidLexiconUpdateRequest({
        key: newKey
      });

      await LexiconFixture.create(createFixture, SimpleDao, fixturesFactory, lexiconDbDocument);
      await createOrUpdateMany(simpleDao, [updateRequest]);
      const [createdDocument] = await simpleDao.for(Lexicon)
        .find({
          key: newKey
        })
        .toArray();
      const [oldDocument] = await simpleDao.for(Lexicon)
        .find({
          _id: lexiconDbDocument._id
        })
        .toArray();

      assert.deepEqual(oldDocument.values, lexiconDbDocument.values);
      assert.deepEqual(updateRequest.values, createdDocument.values);
    });

    it("should insert new documents and update the values contained in multiple existing lexicon entries", async () => {
      const lexiconDbDocuments = [LexiconFixture.getLexiconFixtureMock(chance, {
        accountId
      }), LexiconFixture.getLexiconFixtureMock(chance, {
        accountId
      })];
      const newKey = chance.guid();
      const updateRequests = [
        getValidLexiconUpdateRequest({
          key: lexiconDbDocuments[0].key
        }),
        getValidLexiconUpdateRequest({
          key: `${newKey}-${accountId}`
        }),
        getValidLexiconUpdateRequest({
          key: lexiconDbDocuments[1].key
        })
      ];

      await Promise.all(lexiconDbDocuments.map((fixture) => {
        return LexiconFixture.create(createFixture, SimpleDao, fixturesFactory, fixture);
      }));
      await createOrUpdateMany(simpleDao, updateRequests);
      const updatedDocuments = await simpleDao.for(Lexicon)
        .find({
          key: {
            $in: updateRequests.map((d) => {
              return d.key;
            })
          }
        })
        .toArray();

      updateRequests.forEach((updateRequest) => {
        const updatedDocument = updatedDocuments.find((doc) => {
          return doc.key === updateRequest.key;
        });

        assert.ok(updatedDocument !== undefined && updatedDocument !== null);
        assert.deepEqual(updatedDocument.values, updateRequest.values);
      });
    });

    it("should update the values contained in a single existing lexicon entry", async () => {
      const lexiconDbDocument = LexiconFixture.getLexiconFixtureMock(chance, {
        _id: SimpleDao.objectId(),
        accountId
      });
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key
      });

      await LexiconFixture.create(createFixture, SimpleDao, fixturesFactory, lexiconDbDocument);
      await createOrUpdateMany(simpleDao, [updateRequest]);
      const [updatedDocument] = await simpleDao.for(Lexicon)
        .find({
          _id: lexiconDbDocument._id
        })
        .toArray();

      assert.deepEqual(updatedDocument.values, updateRequest.values);
    });

    it("should update the values contained in multiple existing lexicon entries", async () => {
      const lexiconDbDocuments = [LexiconFixture.getLexiconFixtureMock(chance, {
        _id: SimpleDao.objectId(),
        accountId
      }), LexiconFixture.getLexiconFixtureMock(chance, {
        _id: SimpleDao.objectId(),
        accountId
      })];
      const updateRequests = [
        getValidLexiconUpdateRequest({
          key: lexiconDbDocuments[0].key
        }),
        getValidLexiconUpdateRequest({
          key: lexiconDbDocuments[1].key
        })
      ];

      await Promise.all(lexiconDbDocuments.map((fixture) => {
        return LexiconFixture.create(createFixture, SimpleDao, fixturesFactory, fixture);
      }));
      await createOrUpdateMany(simpleDao, updateRequests);
      const updatedDocuments = await simpleDao.for(Lexicon)
        .find({
          _id: {
            $in: lexiconDbDocuments.map((d) => {
              return d._id;
            })
          }
        })
        .toArray();

      updateRequests.forEach((updateRequest) => {
        const updatedDocument = updatedDocuments.find((doc) => {
          return doc.key === updateRequest.key;
        });

        assert.ok(updatedDocument !== undefined && updatedDocument !== null);
        assert.deepEqual(updatedDocument.values, updateRequest.values);
      });
    });
  });

  describe("getLanguagesISOCodeMap", () => {
    it("should return an object with languages iso as keys and code as values", () => {
      const languages = allSupportedLanguages();
      const result = getLanguagesISOCodeMap();

      assert.deepEqual(Object.keys(result).length, languages.length);
      assert.deepEqual(languages[0], result.en);
      assert.deepEqual(languages[1], result.fr);
      assert.deepEqual(languages[2], result.de);
      assert.deepEqual(languages[3], result.nl);
      assert.deepEqual(languages[4], result.es);
      assert.deepEqual(languages[5], result.frca);
    });
  });

  describe("getLanguagesISOEmptyObject", () => {
    it("should return an object with languages iso as keys and empty strings as values", () => {
      const languages = allSupportedLanguages();
      const result = getLanguagesISOEmptyObject();

      assert.deepEqual(Object.keys(result).length, languages.length);
      assert.deepEqual(languages[0], Object.keys(result)[0]);
      assert.deepEqual(languages[1], Object.keys(result)[1]);
      assert.deepEqual(languages[2], Object.keys(result)[2]);
      assert.deepEqual(languages[3], Object.keys(result)[3]);
      assert.deepEqual(languages[4], Object.keys(result)[4]);
      assert.deepEqual(languages[5], Object.keys(result)[5]);
    });
  });

  describe("getLanguagesISONameMap", () => {
    it("should return an object with languages iso as keys and name as values", () => {
      const languages = allSupportedLanguages();
      const result = getLanguagesISONameMap();

      assert.deepEqual(Object.keys(result).length, languages.length);
      assert.deepEqual(result[languages[0]], "english");
      assert.deepEqual(result[languages[1]], "french");
      assert.deepEqual(result[languages[2]], "german");
      assert.deepEqual(result[languages[3]], "dutch");
      assert.deepEqual(result[languages[4]], "spanish");
      assert.deepEqual(result[languages[5]], "frenchCanada");
    });
  });
});
