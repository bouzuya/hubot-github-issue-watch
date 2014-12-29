# Description
#   A Hubot script to watch GitHub issue comments
#
# Configuration:
#   HUBOT_GITHUB_ISSUE_WATCH_INTERVAL
#   HUBOT_GITHUB_ISSUE_WATCH_ROOM
#   HUBOT_GITHUB_ISSUE_WATCH_GOOGLE_EMAIL
#   HUBOT_GITHUB_ISSUE_WATCH_GOOGLE_KEY
#   HUBOT_GITHUB_ISSUE_WATCH_GOOGLE_SHEET_KEY
#
# Commands:
#   None
#
# Author:
#   bouzuya <m@bouzuya.net>
#
GitHub = require 'github'
loadCells = require '../google-sheet'
parseConfig = require 'hubot-config'
{Promise} = require 'es6-promise'

config = parseConfig 'github-issue-watch',
  interval: 60000
  room: null
  googleEmail: null
  googleKey: null
  googleSheetKey: null

loadRepos = (config) ->
  loadCells
    credentials:
      email: config.googleEmail
      key: config.googleKey
    spreadsheetKey: config.googleSheetKey
  .then (cells) ->
    cells
      .filter (i) -> i.title.match(/^A/)
      .filter (i) -> i.content.match(/([^\/]+)\/([^\/]+)/)
      .map (i) -> i.content.match(/([^\/]+)\/([^\/]+)/)
      .map (i) -> user: i[1], repo: i[2]

fetchComments = (user, repo) ->
  new Promise (resolve, reject) ->
    github = new GitHub(version: '3.0.0')
    github.issues.repoComments
      user: user
      repo: repo
      sort: 'created'
      direction: 'desc'
    , (err, data) ->
      if err? then reject(err) else resolve(data)

module.exports = (robot) ->
  repos = []

  loadRepos(config).then (r) ->
    reposString = r.map((i) -> "#{i.user}/#{i.repo}").join(',')
    robot.logger.info 'hubot-github-issue-watch: load repos ' + reposString
    repos = r
  .catch (e) ->
    robot.logger.error e

  watch = ->
    reposString = repos.map((i) -> "#{i.user}/#{i.repo}").join(',')
    robot.logger.info 'hubot-github-issue-watch: watch repos ' + reposString
    setTimeout ->
      promises = repos.map (i) ->
        fetchComments(i.user, i.repo)
        .then (data) ->
          data = data.filter (j) -> !i.createdAt? or i.createdAt < j.created_at
          return if data.length is 0
          unless i.createdAt?
            i.createdAt = data[0].created_at
            return
          i.createdAt = data[0].created_at
          message = data.map (i) ->
            "#{i.user.login}: #{i.body} (#{i.html_url})"
          .join '\n'
          robot.messageRoom config.room, message
      Promise.all(promises)
      .catch (e) ->
        robot.logger.error e
      .then watch, watch
    , parseInt(config.interval, 10)

  watch()
