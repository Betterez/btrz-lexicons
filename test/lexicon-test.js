const _ = require("lodash");
const assert = require("assert");
const {
  expect
} = require("chai");
const {
  Chance
} = require("chance");
const chance = new Chance();
const config = require("../config")(process.env);
const {
  SimpleDao
} = require("btrz-simple-dao");
const simpleDao = new SimpleDao(config);
const {
  allSupportedLanguages,
  allSupportedContexts,
  insertMany,
  updateMany
} = require("../service");
const accountId = SimpleDao.objectId().toHexString();

const {
  Lexicon
} = require("../models");
const lexiconCollectionName = Lexicon.collectionName();
const uuid = require("uuid");

function getValidLexiconDbDocument(overrides = {}) {
  const validLexiconDbDocument = {
    _id: SimpleDao.objectId(),
    key: `${chance.word({
      length: 20
    })}-${accountId}-${uuid.v4()}`,
    values: _.zipObject(allSupportedLanguages(), _.times(allSupportedLanguages().length, () => {
      return chance.sentence();
    })),
    context: chance.pickset(allSupportedContexts(), chance.natural({
      min: 1, max: allSupportedContexts().length
    })),
    accountId
  };

  return Object.assign(validLexiconDbDocument, overrides);
}

function getValidLexiconEntryRequest(overrides = {}) {
  const validLexiconEntry = {
    accountId,
    name: chance.word({
      length: 20
    }),
    values: _.zipObject(allSupportedLanguages(), _.times(allSupportedLanguages().length, () => {
      return chance.sentence();
    })),
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
    values: _.zipObject(allSupportedLanguages(), _.times(allSupportedLanguages().length, () => {
      return chance.sentence();
    })),
    context: chance.pickset(allSupportedContexts(), chance.natural({
      min: 1, max: allSupportedContexts().length
    })),
    accountId
  };

  return Object.assign(validLexiconUpdate, overrides);
}

function createFixture(modelName, refNames, fixturesFactory, fixture) {
  if (fixture._id) {
    assert(_.get(fixture, "_id.constructor.name") === "ObjectID", "createFixture: _id must be an ObjectID");
  }

  const _id = fixture._id || SimpleDao.objectId();
  const fixtureData = Object.assign({}, fixture, {
    _id
  });
  const refs = refNames.map((name) => {
    return fixturesFactory.fixtures(name);
  });

  return fixturesFactory.createList(modelName, 1, [fixtureData], refs)
    .then(() => {
      return _id.toString();
    });
}

const createLexiconFixture = _.partial(createFixture, Lexicon.collectionName(), []);

const {
  MongoFactory
  // eslint-disable-next-line import/no-extraneous-dependencies
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


describe("Lexicon Service", () => {
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

  describe("#insertMany()", () => {
    requiredLexiconEntryKeys.forEach((key) => {
      it(`should reject if any of the provided lexicon entries is missing a "${key}"`, () => {
        const lexiconEntries = [getValidLexiconEntryRequest(), getValidLexiconEntryRequest()];
        Reflect.deleteProperty(lexiconEntries[1], key);

        return insertMany(simpleDao, lexiconEntries)
          .then(fail, (err) => {
            expect(err.message).to.equal(`lexicon entry with name ${lexiconEntries[1].name} ` +
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
          expect(err.message).to.equal(`lexicon entry with name ${lexiconEntries[1].name} ` +
            "contains the following unknown keys: unknownProperty");
        });
    });

    it("should correctly save entries that don't specify an 'accountId'", () => {
      const lexiconEntries = _.times(chance.natural({
        min: 1, max: 10
      }), () => {
        return getValidLexiconEntryRequest();
      });
      let allReturnedKeys = null;

      lexiconEntries.forEach((entry) => {
        Reflect.deleteProperty(entry, "accountId");
      });

      return simpleDao.for(Lexicon)
        .find({
          key: {
            $in: lexiconEntries.map(_.property("name"))
          }
        })
        .toArray()
        .then((existingEntries) => {
          expect(existingEntries).to.have.length(0);
          return insertMany(simpleDao, lexiconEntries);
        })
        .then((result) => {
          allReturnedKeys = result.successes.map(_.property("key"));

          expect(result).to.deep.equal({
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
          expect(insertedEntries).to.have.length(lexiconEntries.length);
          // Check that the database contains all of the keys that were returned by the service call
          expect(_.xor(insertedEntries.map(_.property("key")), allReturnedKeys)).to.have.length(0);
        });
    });

    it("should correctly save entries that do specify an 'accountId'", () => {
      const lexiconEntries = _.times(chance.natural({
        min: 1, max: 10
      }), () => {
        return getValidLexiconEntryRequest();
      });
      let allReturnedKeys = null;

      return insertMany(simpleDao, lexiconEntries)
        .then((result) => {
          allReturnedKeys = result.successes.map(_.property("key"));

          expect(result).to.deep.equal({
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
            expect(successRecord.key).to.include(successRecord.name);
            expect(successRecord.key).to.include(accountId);
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
          expect(insertedEntries).to.have.length(lexiconEntries.length);
          // Check that the database contains all of the keys that were returned by the service call
          expect(_.xor(insertedEntries.map(_.property("key")), allReturnedKeys)).to.have.length(0);
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
          expect(result.successes).to.deep.equal([]);
          expect(result.failures).to.have.length(lexiconEntries.length);

          result.failures.forEach((failure) => {
            const matchingLexiconEntry = _.find(lexiconEntries, _.matches({
              name: failure.name
            }));
            expect(matchingLexiconEntry).to.exist;
            expect(failure.name).to.eql(matchingLexiconEntry.name);
            expect(failure.message).to.include("E11000 duplicate key error");
            expect(failure.message).to.include(`${matchingLexiconEntry.name}`);
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
          expect(result.successes).to.deep.equal([]);
          expect(result.failures).to.have.length(lexiconEntries.length);

          result.failures.forEach((failure) => {
            const matchingLexiconEntry = _.find(lexiconEntries, _.matches({
              name: failure.name
            }));
            expect(matchingLexiconEntry).to.exist;
            expect(failure.name).to.eql(matchingLexiconEntry.name);
            expect(failure.message).to.include("E11000 duplicate key error");
            expect(failure.message).to.include(`${matchingLexiconEntry.name}`);
          });
        });
    });

    // eslint-disable-next-line max-len
    it("should indicate which lexicon entries were inserted and which entries were not inserted when only some entries are successfully inserted", () => {
      const failedEntries = [getValidLexiconEntryRequest(), getValidLexiconEntryRequest()];
      const lexiconEntries1 = _.times(4, () => {
        return getValidLexiconEntryRequest();
      }).concat(failedEntries);
      const lexiconEntries2 = _.times(4, () => {
        return getValidLexiconEntryRequest();
      }).concat(failedEntries);

      [...lexiconEntries1, ...lexiconEntries2].forEach((entry) => {
        Reflect.deleteProperty(entry, "accountId");
      });

      return insertMany(simpleDao, lexiconEntries1)
        .then(() => {
          return insertMany(simpleDao, lexiconEntries2);
        })
        .then((result) => {
          expect(result.successes).to.deep.equal(lexiconEntries2.slice(0, 4).map((entry) => {
            return {
              name: entry.name,
              key: entry.name
            };
          }));

          expect(result.failures).to.have.length(failedEntries.length);

          result.failures.forEach((failure) => {
            const matchingLexiconEntry = _.find(failedEntries, _.matches({
              name: failure.name
            }));
            expect(matchingLexiconEntry).to.exist;
            expect(failure.name).to.eql(matchingLexiconEntry.name);
            expect(failure.message).to.include("E11000 duplicate key error");
            expect(failure.message).to.include(`${matchingLexiconEntry.name}`);
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
          expect(err).to.deep.equal(unexpectedDatabaseError);
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
        expect(err.message).to.equal("lexicon update request is missing a \"key\"");
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
        expect(err.message).to.equal(`lexicon update request with key ${lexiconEntries[1].key} ` +
          "contains the following unknown properties: unknownProperty");
      }
    });

    it("should reject if provided with a zero-length array of lexicon entry updates", async () => {
      try {
        await updateMany(simpleDao, []);
        fail();
      } catch (err) {
        expect(err.message).to.equal("lexiconEntryUpdates must be an array with at least one item");
      }
    });

    it("should reject with a meaningful ValidationError if any lexicon entry update specifies a non-existent lexicon key", async () => {
      const lexiconDbDocument = getValidLexiconDbDocument();
      const updateRequest = getValidLexiconUpdateRequest();

      await createLexiconFixture(fixturesFactory, lexiconDbDocument);

      try {
        await updateMany(simpleDao, [updateRequest]);
      } catch (error) {
        expect(error.message).to.equal("The following lexicon entries do not exist: " +
          `\n${JSON.stringify([_.pick(updateRequest, ["key"])], null, 2)}`);
      }
    });

    // eslint-disable-next-line max-len
    it("should reject with a meaningful ValidationError if any lexicon entry update specifies a valid lexicon key but an incorrect accountId", async () => {
      const otherAccountId = chance.hash();
      const lexiconDbDocument = getValidLexiconDbDocument({
        accountId: otherAccountId
      });
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key
      });

      await createLexiconFixture(fixturesFactory, lexiconDbDocument);
      try {
        await updateMany(simpleDao, [updateRequest]);
        fail();
      } catch (err) {
        expect(err.message).to.equal("The following lexicon entries do not exist: " +
          `\n${JSON.stringify([_.pick(updateRequest, ["key", ""])], null, 2)}`);
      }
    });

    it("should update a lexicon entry in the global lexicon (no accountId specified)", async () => {
      const lexiconDbDocument = getValidLexiconDbDocument({
        accountId: ""
      });
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key
      });
      Reflect.deleteProperty(updateRequest, "accountId");

      await createLexiconFixture(fixturesFactory, lexiconDbDocument);
      await updateMany(simpleDao, [updateRequest]);
      const [updatedDocument] = await simpleDao.for(Lexicon)                                                //eslint-disable-line
        .find({
          _id: lexiconDbDocument._id
        })
        .toArray();

      expect(updatedDocument.values).to.deep.eql(updateRequest.values);
      expect(updatedDocument.context).to.deep.eql(updateRequest.context);
      expect(updatedDocument.accountId).to.equal("");                                                                 //eslint-disable-line
    });

    it("should update the values contained in a single existing lexicon entry", async () => {
      const lexiconDbDocument = getValidLexiconDbDocument();
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key
      });

      await createLexiconFixture(fixturesFactory, lexiconDbDocument);
      await updateMany(simpleDao, [updateRequest]);
      const [updatedDocument] = await simpleDao.for(Lexicon)                                                //eslint-disable-line
        .find({
          _id: lexiconDbDocument._id
        })
        .toArray();

      expect(updatedDocument.values).to.deep.eql(updateRequest.values);
    });

    it("should update the values contained in multiple existing lexicon entries", async () => {
      const lexiconDbDocuments = [getValidLexiconDbDocument(), getValidLexiconDbDocument()];
      const updateRequests = [
        getValidLexiconUpdateRequest({
          key: lexiconDbDocuments[0].key
        }),
        getValidLexiconUpdateRequest({
          key: lexiconDbDocuments[1].key
        })
      ];

      await Promise.all(lexiconDbDocuments.map((fixture) => {
        return createLexiconFixture(fixturesFactory, fixture);
      }));
      await updateMany(simpleDao, updateRequests);
      const updatedDocuments = await simpleDao.for(Lexicon)                                                 //eslint-disable-line
        .find({
          _id: {
            $in: lexiconDbDocuments.map(_.property("_id"))
          }
        })
        .toArray();

      updateRequests.forEach((updateRequest) => {
        const updatedDocument = updatedDocuments.find((doc) => {
          return doc.key === updateRequest.key;
        });

        expect(updatedDocument).to.exist;                                                                             //eslint-disable-line
        expect(updatedDocument.values).to.deep.eql(updateRequest.values);
      });
    });

    it("should only update the values for the languages specified in the update object", async () => {
      const lexiconDbDocument = getValidLexiconDbDocument();
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key,
        values: {
          [allSupportedLanguages()[0]]: chance.sentence()
        }
      });

      assert(Object.keys(lexiconDbDocument.values).length > 0,
        "Test is invalid if there is less than 2 values in the existing lexicon entry");

      await createLexiconFixture(fixturesFactory, lexiconDbDocument);
      await updateMany(simpleDao, [updateRequest]);
      const [updatedDocument] = await simpleDao.for(Lexicon)                                                //eslint-disable-line
        .find({
          _id: lexiconDbDocument._id
        })
        .toArray();

      expect(updatedDocument.values).to.deep.eql(Object.assign({}, lexiconDbDocument.values, updateRequest.values));
    });

    it("should add a translation for a new language if the existing lexicon entry is missing that language", async () => {
      const existingLanguageIsoCode = allSupportedLanguages()[0];
      const newLanguageIsoCode = allSupportedLanguages()[1];
      const lexiconDbDocument = getValidLexiconDbDocument({
        values: {
          [existingLanguageIsoCode]: chance.sentence()
        }
      });
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key,
        values: {
          [newLanguageIsoCode]: chance.sentence()
        }
      });

      assert(existingLanguageIsoCode !== newLanguageIsoCode, "Test is invalid if the existing and new languages are the same");
      assert(existingLanguageIsoCode && newLanguageIsoCode, "Test is invalid if one of the language codes is missing");

      await createLexiconFixture(fixturesFactory, lexiconDbDocument);
      await updateMany(simpleDao, [updateRequest]);
      const [updatedDocument] = await simpleDao.for(Lexicon)                                                //eslint-disable-line
        .find({
          _id: lexiconDbDocument._id
        })
        .toArray();

      expect(updatedDocument.values).to.deep.eql(Object.assign({}, lexiconDbDocument.values, updateRequest.values));
    });

    it("should not update the values of a lexicon entry if the update object does not specify new values", async () => {
      const lexiconDbDocument = getValidLexiconDbDocument();
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key, values: undefined
      });

      await createLexiconFixture(fixturesFactory, lexiconDbDocument);
      await updateMany(simpleDao, [updateRequest]);
      const [updatedDocument] = await simpleDao.for(Lexicon)                                                //eslint-disable-line
        .find({
          _id: lexiconDbDocument._id
        })
        .toArray();

      expect(updatedDocument.values).to.deep.eql(lexiconDbDocument.values);
    });

    it("should update the context of a single existing lexicon entry", async () => {
      const lexiconDbDocument = getValidLexiconDbDocument();
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key
      });

      await createLexiconFixture(fixturesFactory, lexiconDbDocument);
      await updateMany(simpleDao, [updateRequest]);
      const [updatedDocument] = await simpleDao.for(Lexicon)                                                //eslint-disable-line
        .find({
          _id: lexiconDbDocument._id
        })
        .toArray();

      expect(updatedDocument.context).to.deep.eql(updateRequest.context);
    });

    it("should update the context of multiple existing lexicon entries", async () => {
      const lexiconDbDocuments = [getValidLexiconDbDocument(), getValidLexiconDbDocument()];
      const updateRequests = [
        getValidLexiconUpdateRequest({
          key: lexiconDbDocuments[0].key
        }),
        getValidLexiconUpdateRequest({
          key: lexiconDbDocuments[1].key
        })
      ];

      await Promise.all(lexiconDbDocuments.map((fixture) => {
        return createLexiconFixture(fixturesFactory, fixture);
      }));
      await updateMany(simpleDao, updateRequests);
      const updatedDocuments = await simpleDao.for(Lexicon)                                                 //eslint-disable-line
        .find({
          _id: {
            $in: lexiconDbDocuments.map(_.property("_id"))
          }
        })
        .toArray();

      updateRequests.forEach((updateRequest) => {
        const updatedDocument = updatedDocuments.find((doc) => {
          return doc.key === updateRequest.key;
        });

        expect(updatedDocument).to.exist;                                                                             //eslint-disable-line
        expect(updatedDocument.context).to.deep.eql(updateRequest.context);
      });
    });

    it("should not update the context of a lexicon entry if the update object does not specify new context", () => {
      const lexiconDbDocument = getValidLexiconDbDocument();
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key, context: undefined
      });

      return createLexiconFixture(fixturesFactory, lexiconDbDocument)
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
          expect(updatedDocument.context).to.deep.eql(lexiconDbDocument.context);
        });
    });

    it("should not reject when the update sets properties to their pre-existing value (no properties change)", () => {
      const lexiconDbDocument = getValidLexiconDbDocument();
      const updateRequest = getValidLexiconUpdateRequest({
        key: lexiconDbDocument.key,
        values: lexiconDbDocument.values,
        context: lexiconDbDocument.context
      });

      return createLexiconFixture(fixturesFactory, lexiconDbDocument)
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
          expect(updatedDocument.values).to.deep.eql(lexiconDbDocument.values);
        });
    });
  });
});
