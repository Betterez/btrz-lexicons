const {
  allSupportedContexts,
  allSupportedLanguages,
  createOrUpdateMany,
  find,
  generateLexiconKey,
  insertMany,
  isoToName,
  keyValueLangs,
  langToIso,
  langToName,
  updateMany
} = require("./service");

const {
  Lexicon
} = require("./models");

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
  langToName,
  updateMany,
  Lexicon
};
