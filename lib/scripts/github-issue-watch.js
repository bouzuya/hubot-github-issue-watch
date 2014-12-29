// Description
//   A Hubot script to watch GitHub issue comments
//
// Configuration:
//   HUBOT_GITHUB_ISSUE_WATCH_INTERVAL
//   HUBOT_GITHUB_ISSUE_WATCH_ROOM
//   HUBOT_GITHUB_ISSUE_WATCH_GOOGLE_EMAIL
//   HUBOT_GITHUB_ISSUE_WATCH_GOOGLE_KEY
//   HUBOT_GITHUB_ISSUE_WATCH_GOOGLE_SHEET_KEY
//
// Commands:
//   None
//
// Author:
//   bouzuya <m@bouzuya.net>
//
var GitHub, Promise, config, fetchComments, loadCells, loadRepos, parseConfig;

GitHub = require('github');

loadCells = require('../google-sheet');

parseConfig = require('hubot-config');

Promise = require('es6-promise').Promise;

config = parseConfig('github-issue-watch', {
  interval: 60000,
  room: null,
  googleEmail: null,
  googleKey: null,
  googleSheetKey: null
});

loadRepos = function(config) {
  return loadCells({
    credentials: {
      email: config.googleEmail,
      key: config.googleKey
    },
    spreadsheetKey: config.googleSheetKey
  }).then(function(cells) {
    return cells.filter(function(i) {
      return i.title.match(/^A/);
    }).filter(function(i) {
      return i.content.match(/([^\/]+)\/([^\/]+)/);
    }).map(function(i) {
      return i.content.match(/([^\/]+)\/([^\/]+)/);
    }).map(function(i) {
      return {
        user: i[1],
        repo: i[2]
      };
    });
  });
};

fetchComments = function(user, repo) {
  return new Promise(function(resolve, reject) {
    var github;
    github = new GitHub({
      version: '3.0.0'
    });
    return github.issues.repoComments({
      user: user,
      repo: repo,
      sort: 'created',
      direction: 'desc'
    }, function(err, data) {
      if (err != null) {
        return reject(err);
      } else {
        return resolve(data);
      }
    });
  });
};

module.exports = function(robot) {
  var repos, watch;
  repos = [];
  loadRepos(config).then(function(r) {
    var reposString;
    reposString = r.map(function(i) {
      return "" + i.user + "/" + i.repo;
    }).join(',');
    robot.logger.info('hubot-github-issue-watch: load repos ' + reposString);
    return repos = r;
  })["catch"](function(e) {
    return robot.logger.error(e);
  });
  watch = function() {
    var reposString;
    reposString = repos.map(function(i) {
      return "" + i.user + "/" + i.repo;
    }).join(',');
    robot.logger.info('hubot-github-issue-watch: watch repos ' + reposString);
    return setTimeout(function() {
      var promises;
      promises = repos.map(function(i) {
        return fetchComments(i.user, i.repo).then(function(data) {
          var message;
          data = data.filter(function(j) {
            return (i.createdAt == null) || i.createdAt < j.created_at;
          });
          if (data.length === 0) {
            return;
          }
          if (i.createdAt == null) {
            i.createdAt = data[0].created_at;
            return;
          }
          i.createdAt = data[0].created_at;
          message = data.map(function(i) {
            return "" + i.user.login + ": " + i.body + " (" + i.html_url + ")";
          }).join('\n');
          return robot.messageRoom(config.room, message);
        });
      });
      return Promise.all(promises)["catch"](function(e) {
        return robot.logger.error(e);
      }).then(watch, watch);
    }, parseInt(config.interval, 10));
  };
  return watch();
};
