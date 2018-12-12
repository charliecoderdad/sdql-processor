var syncRequest = require('sync-request');

module.exports = {

  //Return perf object containing a query wins and losses based on criteria of days ago or current season
  getQueryPerformance: function(options, checkDate, season) {
    var perf = {
      wins: 0,
      losses: 0,
      pushes: 0,
      winPercent: null
    };
    if (checkDate !== null) {
      var url = buildCheckQueryRequestUrl(options.theQuery, checkDate, null);
      // console.log("Generated checkUrl: " + url);
      var requestOptions = {
        retry: true,
        retryDelay: 7000,
        maxRetries: 15
      }
      var checkJsonResults = this.stripJsonCallbackWrapper(syncRequest("GET", url, requestOptions).body.toString());
      // console.log("Check RESULTS: " + JSON.stringify(checkJsonResults));
      // Look for the team and add it to the teams object
      var pointsForArray = checkJsonResults.groups[0].columns[0];
      var pointsAgainstArray = checkJsonResults.groups[0].columns[1];
      var linesArray = checkJsonResults.groups[0].columns[2];
      var totalsArray = checkJsonResults.groups[0].columns[3];
      // console.log(qNum + ". Query found teams to bet: " + teamsArray + " " + options.theQuery);
      for (var j = 0; j < pointsForArray.length; j++) {
        var margin = pointsForArray[j] - pointsAgainstArray[j];
        var line = linesArray[j];
        var finalTotal = pointsForArray[j] + pointsAgainstArray[j];
        if (pointsForArray[j] !== null && linesArray[j] !== null) {
          if (options.betType === 'A') {
            if (margin + line > 0) {
              perf.wins++;
            } else if (margin + line < 0) {
              perf.losses++;
            } else {
              perf.pushes++;
            }
          }
          if (options.betType === 'O' && totalsArray[j] !== null) {
            if (finalTotal > totalsArray[j]) {
              perf.wins++;
            } else if (finalTotal < totalsArray[j]) {
              perf.losses++;
            } else {
              perf.pushes++;
            }
          }
          if (options.betType === 'U' && totalsArray[j] !== null) {
            if (finalTotal < totalsArray[j]) {
              perf.wins++;
            } else if (finalTotal > totalsArray[j]) {
              perf.losses++;
            } else {
              perf.pushes++;
            }
          }
        }

      }
      perf.winPercent = (perf.wins / (perf.wins + perf.losses)) * 100;
      // console.log(options.queryNumber + ". Performance: " + Number(perf.winPercent).toFixed(1) + "% (" + perf.wins + "-" + perf.losses + "-" + perf.pushes + ")");

    } else if (season !== null) {
      console.log("!!!Season check son");
      //TODO: Figure out how to get season variable
      var url = buildCheckQueryRequestUrl(query, null, season);
    }
    return perf;
  },


  //Returns the date from number of 'days' ago in format of YYYYMMDD
  getDateNDaysAgo: function(days) {
    var date = new Date();
    var last = new Date(date.getTime() - (days * 24 * 60 * 60 * 1000));
    var day = last.getDate();
    var month = last.getMonth() + 1;
    var year = last.getFullYear();
    var returnDate = year.toString();
    if (month < 10) {
      returnDate += "0" + month;
    } else {
      returnDate += month;
    }
    if (day < 10) {
      returnDate += "0" + day;
    } else {
      returnDate += day;
    }
    return returnDate;
  },

  //The SDQL Api returns json but wrapped in a "json_callback()" wrapper which must be removed to use response as true json
  stripJsonCallbackWrapper: function(jsonResponse) {
    jsonResponse = jsonResponse.substr(jsonResponse.indexOf("{"), jsonResponse.length);
    jsonResponse = jsonResponse.substr(0, jsonResponse.lastIndexOf("}") + 1);
    jsonResponse = jsonResponse.replace(new RegExp("\'", 'g'), "\"");
    return JSON.parse(jsonResponse);
  },

  // Build todays date and returns it formatted as YYYYMMDD
  getTodaysDate: function() {
      var date = new Date();
      var yyyymmdd = date.getFullYear().toString();
      var month = date.getMonth()+1;
      var day = date.getDate();
      if (month < 10) { month = '0' + month; }
      if (day < 10) { day = '0' + day; }
      yyyymmdd += month.toString() + day.toString();
      return yyyymmdd;
  },

  // Converts original SDQL http URL into the API url that returns JSON
  buildQueryMatchRequestUrl: function(origUrl, date) {
      origUrl = origUrl.toString().trim();
      var query = origUrl.substr(origUrl.indexOf("sdql=")+5, origUrl.length);
      // console.log("Original URL: " + origUrl);
      // console.log("query found: |" + query + "|");
      var sport = null;
      if (origUrl.toLowerCase().includes("nba/query")) {
        sport = "nba";
        sportBeingAnalyzed = "NBA";
      }
      if (origUrl.toLowerCase().includes('ncaabb/query')) {
        sport = "ncaabb";
        sportBeingAnalyzed = "College Hoops";
      }
      if (origUrl.toLowerCase().includes('ncaafb/query')) {
        sport = "ncaafb";
        sportBeingAnalyzed = "College Football";
      }
      if (origUrl.toLowerCase().includes('nfl/query')) {
        sportBeingAnalyzed = "NFL";
        sport = "nfl";
      }
      if (origUrl.toLowerCase().includes('mlb/query')) {
        sportBeingAnalyzed = "MLB";
        sport = "mlb";
      }
      if (origUrl.toLowerCase().includes('nhl/query')) {
        sportBeingAnalyzed = "NHL";
        sport = "nhl";
      }

      var returnUrl = "http://api.sportsdatabase.com/" + sport + "/query.json?sdql=team%2Cline%2Co%3Ateam%2Ctotal%40";
      returnUrl += query.toString();
      returnUrl += "+and+date%3D" + date;
      returnUrl += "&output=json&api_key=guest";
      return returnUrl;
  }

}

// Converts original SDQL http URL into the API url that returns JSON
function buildCheckQueryRequestUrl(origUrl, checkDate, season) {
  origUrl = origUrl.toString().trim();
  var query = origUrl.substr(origUrl.indexOf("sdql=") + 5, origUrl.length);
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
  returnUrl += query;

  if (season !== null) {
    returnUrl += "+and+season%3D" + season;
  }
  if (checkDate !== null) {
    returnUrl += "+and+date>%3D" + checkDate;
  }
  returnUrl += "&output=json&api_key=guest";
  return returnUrl;
}
