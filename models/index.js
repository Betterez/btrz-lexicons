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
}

exports.Lexicon = Lexicon;
