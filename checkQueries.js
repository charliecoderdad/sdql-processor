var request = require('request');
var fs = require('fs');
var sleep = require('sleep-promise');
var argv = require('yargs')
    .usage('Usage: node $0 [options]')
    .option('season', { alias: 's', describe: 'Check a specific season', default: null})
    .option('month', { alias: 'm', describe: 'Check a specific month', default: null})
    .option('date', { alias: 'd', describe: 'Check a specific date (YYYYMMDD)', default: null})
    .option('custom', { alias: 'c', describe: 'Add custom string (%3D is "=", + is "space", i.e. "+and+season>2014")', default: null})
    .option('file', { alias: 'f', describe: 'File that contains the original queries', demandOption: true})
    .option('delay', { describe: 'Delay between each REST api call in ms', default: 2500 })
    .help('h')
    .argv;

var apiKey = "p11nF2a3dAk254au"; //can also set to guest
// var apiKey = "guest";
var myPromises = [];
var overallWins = 0;
var overallLosses = 0;
var overallPushes = 0;

if (argv.season !== null) { console.log("Season: " + argv.season);}
if (argv.month !== null) { console.log("Month: " + argv.month); }
if (argv.date !== null) { console.log("Date: " + argv.date); }
if (argv.custom !== null) { console.log("Custom query string: " + argv.custom); }
console.log("");

// Code to read queries from file and store the URLs into an array
var originalUrls = fs.readFileSync(argv.file).toString().split("\n");
// Remove last one if empty string (due to line feeds added to queries text file when saving)
if (originalUrls[originalUrls.length-1].length === 0) {
  originalUrls.pop();
}

for (var i = 0; i < originalUrls.length; i++) {

  var promise = new Promise(function(resolve, reject) {
    var betString = originalUrls[i].split('|');
    var betType = betString[0];
    var options = {
      queryNumber: i,
      theQuery: null,
      url: null,
      port: 80,
      comments: null,
      method: 'GET'
    };

    // We have optional comments in the query file.. if we have a comment we need to handle differently
    if (betString.length === 3) {
      options.theQuery = betString[2];
      options.url = buildRequestUrl(betString[2]);
      options.comments = betString[1];
    } else {
      options.theQuery = betString[1];
      options.url = buildRequestUrl(betString[1]);
    }

    sleep(i * argv.delay).then(function() {
      request(options, function(error, response, body) {
        if (!error && response.statusCode == 200) {
          var jsonResponse = response.body;

          var qNum = options.queryNumber + 1;

          // If no records found from query then quit and resolve this promise
          if (jsonResponse.indexOf("json_callback(null)") > -1) {
            console.log(qNum + ". No matches");
            resolve("No records found");
            return;
          }

          // A match was found.  Convert repsonse to JSON
          jsonResponse = jsonResponse.substr(jsonResponse.indexOf("{"), jsonResponse.length);
          jsonResponse = jsonResponse.substr(0, jsonResponse.lastIndexOf("}") + 1);
          jsonResponse = jsonResponse.replace(new RegExp("\'", 'g'), "\"");
          jsonResponse = JSON.parse(jsonResponse);
          // End conversion of response to JSON

          // If api call is bad syntax or there is a timeout waiting for result
          // console.log("JSON: " + JSON.stringify(jsonResponse,0,3));
          if (jsonResponse.html) {
            console.log("Problem found retrieving the JSON results from the query");
            console.log(qNum + ". WARNING: Problem found with this query: " + options.theQuery);
            resolve("No records found");
            return;
          }

          // Look for the team and add it to the teams object
          var queryWins = 0;
          var queryLosses = 0
          var queryPushes = 0;
          var pointsForArray = jsonResponse.groups[0].columns[0];
          var pointsAgainstArray = jsonResponse.groups[0].columns[1];
          var linesArray = jsonResponse.groups[0].columns[2];
          var totalsArray = jsonResponse.groups[0].columns[3];
          // console.log(qNum + ". Query found teams to bet: " + teamsArray + " " + options.theQuery);
          for (var j = 0; j < pointsForArray.length; j++) {
            var margin = pointsForArray[j] - pointsAgainstArray[j];
            var line = linesArray[j];
            var finalTotal = pointsForArray[j] + pointsAgainstArray[j];
            if (pointsForArray[j] !== null && linesArray[j] !== null) {
              if (betType === 'A') {
                if (margin + line > 0) {
                  queryWins++;
                  overallWins++;
                } else if (margin + line < 0) {
                  queryLosses++;
                  overallLosses++;
                } else {
                  queryPushes++;
                  overallPushes++;
                }
              }
              if (betType === 'O' && totalsArray[j] !== null) {
                if (finalTotal > totalsArray[j]) {
                  queryWins++;
                  overallWins++;
                } else if (finalTotal < totalsArray[j]) {
                  queryLosses++;
                  overallLosses++;
                } else {
                  queryPushes++;
                  overallPushes++;
                }
              }
              if (betType === 'U' && totalsArray[j] !== null) {
                if (finalTotal < totalsArray[j]) {
                  queryWins++;
                  overallWins++;
                } else if (finalTotal > totalsArray[j]) {
                  queryLosses++;
                  overallLosses++;
                } else {
                  queryPushes++;
                  overallPushes++;
                }
              }
            }

          }
          var winPercent = (queryWins / (queryWins + queryLosses)) * 100;
          console.log(qNum + ". Win percent: " + Number(winPercent).toFixed(1) + "% (" + queryWins + "-" + queryLosses + "-" + queryPushes + ")");
          // End counting the pick to the teamsToAdd

          resolve("pass");
        } else {
          console.log(qNum + ". ERROR running the GET: " + options.url);
          resolve("Error found: " + error);
        }
      });
    });
  });
  myPromises.push(promise);

} //end loop to create array of promises

// After promises have been added to the array execute steps afterwards
Promise.all(myPromises).then(function(results){
    var overallWinPercent = (overallWins / (overallWins+overallLosses))*100;
    console.log("");
    console.log("Overall results: " + Number(overallWinPercent).toFixed(1) + "% (" + overallWins + "-" + overallLosses + "-" + overallPushes + ")");
});

// Converts original SDQL http URL into the API url that returns JSON
function buildRequestUrl(origUrl) {
    origUrl = origUrl.toString().trim();
    var query = origUrl.substr(origUrl.indexOf("sdql=")+5, origUrl.length);
    var sport = null;
    if (origUrl.toLowerCase().includes("nba/query")) {
      sport = "nba";
    }
    if (origUrl.toLowerCase().includes('ncaabb/query')) {
      sport = "ncaabb";
    }
    if (origUrl.toLowerCase().includes('ncaafb/query')) {
      sport = "ncaafb";
    }
    if (origUrl.toLowerCase().includes('nfl/query')) {
      sport = "nfl";
    }
    if (origUrl.toLowerCase().includes('nhl/query')) {
      sport = "nhl";
    }

    var returnUrl = " http://api.sportsdatabase.com/" + sport + "/query.json?sdql=points%2Co%3Apoints%2Cline%2Ctotal%40";
    returnUrl+=query;
    if (argv.custom) {
        returnUrl+= argv.custom;
    }
    if (argv.season !== null) {
        returnUrl+="+and+season%3D" + argv.season;
    }
    if (argv.month !== null) {
        returnUrl+= "+and+month%3D" + argv.month;
    }
    if (argv.date !== null) {
        returnUrl+= "+and+date%3D" + argv.date;
    }
    returnUrl+="&output=json&api_key=" + apiKey;
    // console.log("DEBUG:RETURNURL : " + returnUrl);
    return returnUrl;
}
