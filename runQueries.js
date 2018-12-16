var helper = require('./helperModules/runQueriesHelper.js');
var displayResults = require('./helperModules/displayResults.js');
var syncRequest = require('sync-request');
var fs = require('fs');
var sleep = require('sleep-promise');
var argv = require('yargs')
    .usage('Usage: node $0 [options]')
    .option('file', { alias: 'f', describe: 'File that contains the original queries', demand: true })
    .option('date', { alias: 'd', describe: 'Date that query should look to find teams (Format: YYYYMMDD)'})
    .option('delay', { alias: 's', describe: 'Delay between each REST api call in ms', default: 2500 })
    .option('mail', { alias: 'm', describe: 'Send email of picks to specified email address', default: null})
    .option('checkFromdaysAgo', { alias: 'n', describe: 'How many days since to check queries results', default: null})
    .option('checkSeason', { alias: 'c', describe: 'Check queries performance for the current season', type: 'boolean', default: 'false'})
    .help()
    .argv;

var date = argv.date;
var teamsToBet = { "picks": [] };
var myPromises = [];

// If no date specified as an option then set it to todays date
if (date === undefined) { date = helper.getTodaysDate(); }
console.log("Running queries for date: " + date);
if (argv.checkFromdaysAgo && argv.checkSeason) {
  console.log("Cannot check query performance for both 'days ago' and 'current season'");
  process.exit(1);
}
if (argv.checkFromdaysAgo !== null) {
  var checkDate = helper.getDateNDaysAgo(argv.checkFromdaysAgo);
  console.log("Checking query performance for past " + argv.checkFromdaysAgo + " days (" + checkDate + ")");
}
if (argv.checkSeason) {
  console.log("Checking query performance for this season");
}
console.log();

// Code to read queries from file and store the URLs into an array
var originalUrls = fs.readFileSync(argv.file).toString().split("\n");
// Remove last one if empty string (due to line feeds added to queries text file when saving)
if (originalUrls[originalUrls.length-1].length === 0) {
  originalUrls.pop();
}

var sportBeingAnalyzed = helper.getSportBeingAnalysed(originalUrls[0]);

for (var i = 0; i < originalUrls.length; i++) {
  var queryOptionsArray = originalUrls[i].split('|');
  var options = {
    queryNumber: i + 1,
    theQuery: null,
    queryWins: null,
    queryLosses: null,
    url: null,
    comments: null,
    retry: true,
    retryDelay: 7000,
    maxRetries: 15
  };

  // We have optional comments in the query file.. if we have a comment we need to handle differently
  if (queryOptionsArray.length === 3) {
    options.theQuery = queryOptionsArray[2];
    options.url = helper.buildQueryMatchRequestUrl(queryOptionsArray[2], date);
    options.comments = queryOptionsArray[1];
  } else {
    options.theQuery = queryOptionsArray[1];
    options.url = helper.buildQueryMatchRequestUrl(queryOptionsArray[1], date);
  }

  // console.log("DEBUG: " + options.url);
  var res = syncRequest("GET", options.url, options);

  if (res.statusCode !== 200) {
    console.log("Error Status code " + res.statusCode + " when making the request.");
    process.exit(1);
  }

  if (res.body.html) {
    console.log("Problem found retrieving the JSON results from the query");
    console.log(options.queryNumber + ". WARNING: Problem found with this query: " + options.theQuery);
  }

  if (!res.body.includes("json_callback(null)")) {
    //Found games that match the query.  We need to process here.

    //Are we checking historical record of query? If so we do it here!
    if (checkDate) {
      var queryResults = helper.getQueryPerformance(options.theQuery, queryOptionsArray[0], checkDate, null);
    }

    var jsonResponse = helper.stripJsonCallbackWrapper(res.body.toString());
    // console.log(options.queryNumber + ". JSON: " + JSON.stringify(jsonResponse));
    var teamsArray = jsonResponse.groups[0].columns[0];
    var linesArray = jsonResponse.groups[0].columns[1];
    var opponentsArray = jsonResponse.groups[0].columns[2];
    var totalsArray = jsonResponse.groups[0].columns[3];
    console.log(options.queryNumber + ". Query found a bet to make: " + teamsArray);
    if (queryResults) {
      console.log("   - Query #" + options.queryNumber + " performance: " + queryResults.perfString);
    }
    for (var j = 0; j < teamsArray.length; j++) {
      var picksEntry = {
        "team": teamsArray[j],
        "betType": queryOptionsArray[0],
        "line": linesArray[j],
        "total": totalsArray[j],
        "opponent": opponentsArray[j],
        "hits": 1,
        "matchedQuery": ["#" + options.queryNumber],
        "queryComments": [null],
        "queryURL": [options.theQuery]
      }
      if (queryResults) {
        picksEntry.matchedQuery = ["#" + options.queryNumber];
        picksEntry.queryResults = [queryResults];
      }
      if (options.comments !== null) {
        picksEntry.queryComments = ["#" + options.queryNumber + " " + options.comments];
      } else {
        picksEntry.queryComments.push(null);
      }

      // Check if team already in array, if so add to hit, otherwise add new picks entry
      var foundExistingPick = false;
      for (var x = 0; x < teamsToBet.picks.length; x++) {
        // If over/under then check for duplicates differently
        if (picksEntry.betType === 'U' || picksEntry.betType === 'O') {
          if (teamsToBet.picks[x].betType === picksEntry.betType) {
            if (teamsToBet.picks[x].team.toUpperCase() === picksEntry.team.toUpperCase() || teamsToBet.picks[x].team.toUpperCase() === picksEntry.opponent.toUpperCase()) {
              teamsToBet.picks[x].hits++;
              if (queryResults) {
                teamsToBet.picks[x].matchedQuery.push("#" + options.queryNumber);
                teamsToBet.picks[x].queryResults.push(queryResults);
              } else {
                teamsToBet.picks[x].matchedQuery.push("#" + options.queryNumber);
              }
              if (options.comments !== null) {
                teamsToBet.picks[x].queryComments.push("#" + options.queryNumber + " " + options.comments);
              }
              teamsToBet.picks[x].queryURL.push(options.theQuery);
              foundExistingPick = true;
            }
          }
        } else {
          // If ATS or monelyine bet check for duplicates
          if (teamsToBet.picks[x].team === picksEntry.team && teamsToBet.picks[x].betType === queryOptionsArray[0]) {
            teamsToBet.picks[x].hits++;
            if (queryResults) {
              teamsToBet.picks[x].matchedQuery.push("#" + options.queryNumber);
              teamsToBet.picks[x].queryResults.push(queryResults);
            } else {
              teamsToBet.picks[x].matchedQuery.push("#" + options.queryNumber);
            }
            if (options.comments !== null) {
              teamsToBet.picks[x].queryComments.push("#" + options.queryNumber + " " + options.comments);
            }
            teamsToBet.picks[x].queryURL.push(options.theQuery);
            foundExistingPick = true;
          }
        }

      }
      if (!foundExistingPick) {
        teamsToBet.picks.push(picksEntry);
      }
    }
  } else {
    //No matches found for query
    console.log(options.queryNumber + ". No matches found.");
  }


} //end of for loop iterating through each query


console.log("");
displayResults.printTeamsToBet(teamsToBet);
if (argv.mail != null) {
  var properties = {
    sportBeingAnalyzed: sportBeingAnalyzed,
    emailAddress: argv.mail,
    checkDate: checkDate,
    checkFromdaysAgo: argv.checkFromdaysAgo,
    checkDate: checkDate
  }
  displayResults.emailTeamsToBet(teamsToBet, properties);
}
