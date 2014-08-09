var fs = require("fs"),
    mkdirp = require("mkdirp"),
    Q = require("q");

module.exports = function(opts){
  if (!opts) opts = {};
  var c = new C (opts);
  c.paths = C.paths;
  return c;
}

function C (opts){
  var self = this;
  if (fs.existsSync(C.paths.settings)){
    fs.readFile(C.paths.settings + "settings.json", {encoding: "utf-8"}, function(err, raw){
      var data = JSON.parse(raw);

      self.token = data.token;
      self.language = data.language;
    });
  } 

  if (fs.existsSync(C.paths.currentChallenge)){
    fs.readFile(C.paths.currentChallenge, {encoding: "utf-8"}, function(err, raw){
      var data = JSON.parse(raw);

      self.challenge = data;
    });
  }

}

C.paths = {
  config: process.env.HOME + "/.config/",
  api: 'https://www.codewars.com/api/v1/code-challenges/',
  poll: 'https://www.codewars.com/api/v1/deferred/'
}

C.paths.settings = C.paths.config + "codewars/";
C.paths.challenges = C.paths.settings + "challenges/";
C.paths.currentChallenge = C.paths.challenges + "current.json";

C.prototype.save = function(){
  var self = this,
      challenge = this.challenge;

  fs.writeFile(C.paths.currentChallenge, JSON.stringify({
    slug: challenge.slug,
    projectId: challenge.projectId,
    solutionId: challenge.solutionId,
    language: self.language
  }));

  fs.writeFile(C.paths.challenges + challenge.slug + ".json", JSON.stringify(challenge));
}

C.prototype.done = function(){
  var currentChallenge = C.paths.currentChallenge;
  fs.unlink(currentChallenge);
}

C.prototype.setup = function(opts){
  this.token = opts.token || '';
  this.language = opts.language || '';

  var settings = {
    token: this.token,
    language: this.language
  }

  mkdirp(C.paths.challenges, {}, function(err, made){
    if (err) throw "Unable to create ~/.config/codewars";
    fs.writeFile(C.paths.settings + "settings.json", JSON.stringify(settings));
  });
}

C.prototype.validateLocalData = function(){
  var df = Q.defer();
  fs.readFile(C.paths.settings + "settings.json", {encoding: "utf-8"}, function(err, data){
    if (err) throw "Unable to read from ~/.config/codewars/settings.json. Does it exist?"
    var token = JSON.parse(data).token;

    if (!token) throw "Token not found, run 'codewars setup' first."
    var language = JSON.parse(data).language.toLowerCase();

    if (!language) throw "Language not found, run 'codewars setup' first."
    if (!/ruby|javascript/.test(language)) throw language + " is unsupported. Ruby and JS only."
    df.resolve({language: language, token: token});
  });

  return df.promise;
}

C.prototype.checkCurrentChallenge = function(){
  var df = Q.defer(),
      prompt = require("prompt"),
      currentChallenge = C.paths.currentChallenge;

  if (fs.existsSync(currentChallenge)){
    prompt.start();
    prompt.message = "";
    prompt.delimiter = "";
    prompt.get([{

      name: 'answer',
      message: 'Current challenge is in progress. Dismiss? [y/N]'.magenta

    }], function (err, result) {
      if (err) process.exit(1);

      var answer = result.answer;

      if (!result.answer) answer = 'n';
      answer = answer.trim().toLowerCase();

      if (/^n/.test(answer)) { 
        df.reject();
      }
      if (/^y/.test(answer)) {
        fs.unlink(currentChallenge);
        df.resolve();
      }
    });
  } else {
    df.resolve();
  }

  return df.promise;
}

C.prototype.fetch = function(){
  var df = Q.defer(),
      self = this,
      http = require('./http')(C);

  this.checkCurrentChallenge().
  then(this.validateLocalData).
  then(http.getChallenge.bind(this)).
  then(df.resolve.bind(this),
       df.reject.bind(this));

  return df.promise;
}

C.prototype.train = function(challenge){
  var df = Q.defer(),
    self = this,
    http = require('./http')(C);

  self.challenge = challenge;
  self.challenge.language = this.language;

  this.validateLocalData().then(function(args){
    args.challenge = challenge;
    return http.startChallenge(args);
  }).then(df.resolve.bind(this),
          df.reject.bind(this));

  return df.promise;
}

C.prototype.attempt = function(){
  var currentChallenge = C.paths.currentChallenge,
      df = Q.defer(),
      http = require('./http')(C);

  this.validateLocalData().then(function(args){
    if (fs.existsSync(currentChallenge)){
      fs.readFile(currentChallenge, {encoding: "utf-8"}, function(err, raw){
        if (err) throw err;
        args.challenge = JSON.parse(raw);

        return http.attempt(args).then(df.resolve.bind(this), df.reject.bind(this));
      });
    } else {
      df.reject();
    }
  });

  return df.promise;
}

C.prototype.finalize = function(){
  var currentChallenge = C.paths.currentChallenge,
      df = Q.defer(),
      http = require('./http')(C);

  this.validateLocalData().then(function(args){
    if (fs.existsSync(currentChallenge)){
      fs.readFile(currentChallenge, {encoding: "utf-8"}, function(err, raw){
        if (err) throw err;
        args.challenge = JSON.parse(raw);

        return http.finalize(args).then(df.resolve.bind(this), df.reject.bind(this));
      });
    } else {
      df.reject();
    }
  });

  return df.promise;
}

C.prototype.poll = function(id){
  var http = require('./http')(C);
  return http.poll({id: id, token: this.token});
}

C.prototype.test = function(){
  return this.fetch();
}
