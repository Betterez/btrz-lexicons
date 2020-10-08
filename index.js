const {
  allSupportedContexts,
  allSupportedLanguages,
  find,
  generateLexiconKey,
  insertMany,
  keyValueLangs,
  langToIso,
  updateMany
} = require("./service");

const {
  Lexicon
} = require("./models");

module.exports = {
  allSupportedContexts,
  allSupportedLanguages,
  find,
  generateLexiconKey,
  insertMany,
  keyValueLangs,
  langToIso,
  updateMany,
  Lexicon
};
