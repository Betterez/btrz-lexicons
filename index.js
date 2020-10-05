const {
  allSupportedContexts,
  allSupportedLanguages,
  find,
  generateLexiconKey,
  insertMany,
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
  updateMany,
  Lexicon
};
