function getMongoOptions() {
  return {
    "database": "lexicons_test",
    "username": "",
    "password": ""
  };
}

function getMongoDbUris() {
  return ["127.0.0.1:27017"];
}

function getDbConfig() {
  return {
    "options": getMongoOptions(),
    "uris": getMongoDbUris()
  };
}


module.exports = function _default(env) {
  const config = {
    db: getDbConfig(env)
  };

  return config;
};
