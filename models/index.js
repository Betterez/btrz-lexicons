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

function getLangsDoc() {
  return allSupportedLanguages()
    .reduce((c, l) => {
      // eslint-disable-next-line no-param-reassign
      c[l] = {
        type: "string"
      };
      return c;
    }, {});
}

class Lexicon {
  static collectionName() {
    return "lexicon_buscompany";
  }

  static factory(literal) {
    const lexicon = new Lexicon();
    lexicon._id = literal._id;
    lexicon.key = literal.key;
    lexicon.values = literal.values;
    lexicon.context = literal.context;
    lexicon.accountId = literal.accountId;
    return lexicon;
  }

  static swaggerDefinition() {
    const models = {
      "Lexicon": {
        "id": "Lexicon",
        "required": ["key", "values"],
        "properties": {
          "_id": {
            "type": "string"
          },
          "key": {
            "type": "string"
          },
          "values": {
            "$ref": "LexiconValues"
          },
          "accountId": {
            "type": "string"
          },
          "context": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": allSupportedContexts()
            }
          }
        }
      },
      "LexiconValues": {
        "id": "LexiconValues",
        "type": "object",
        "description": "Translations for the word or phrase.  A minimum of one language must be specified.",
        "properties": getLangsDoc()
      }
    };
    return models;
  }
}
class LexiconFixture {
  /**
    * @returns {Object} The schema definition for the model used for db test
    * Ideally we just use it like this.
    */
  static schema() {
    const def = Lexicon.swaggerDefinition();
    return def;
  }

  static fixturesSchema() {
    const fixtures = new Map();
    const schema = LexiconFixture.schema().Lexicon;
    const schemaLexiconValues = LexiconFixture.schema().LexiconValues;
    schema.id = "http://json-schema.org/lexicon#";
    schemaLexiconValues.id = "http://json-schema.org/LexiconValues#";
    fixtures.set(Lexicon.collectionName(), schema);
    fixtures.set("LexiconValues", schemaLexiconValues);
    return fixtures;
  }

  /*
  *  in the code above override and setup the properties as you see fit.
  * overrides will be used to provide specific values
  * use chance for all other properties needed.
  * This mock doesn't need to be comprehensive since is only used for test purposes.
  */
  static getLexiconFixtureMock(chance, overrides = {}) {
    const model = {
      key: chance.word(),
      values: {
        "en-us": chance.sentence(),
        "fr-fr": chance.sentence(),
        "nl-nl": chance.sentence(),
        "de-de": chance.sentence(),
        "es-ar": chance.sentence()
      },
      context: [
        "app",
        "websales",
        "vue"
      ]
    };

    // this line use the overrides to provide specific values
    Object.assign(model, overrides);
    if (overrides.accountId && !overrides.key) {
      model.key = `${model.key}-${overrides.accountId}`;
    }
    return model;
  }

  static create(createFixture, SimpleDao, fixturesFactory, sectionMock1) {
    return createFixture(Lexicon.collectionName(), ["LexiconValues"], SimpleDao)(fixturesFactory, sectionMock1);
  }
}

module.exports = {
  allSupportedContexts,
  allSupportedLanguages,
  Lexicon,
  LexiconFixture
};
