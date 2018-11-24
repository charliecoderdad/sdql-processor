var request = require('request');
var fs = require('fs');
var sleep = require('sleep-promise');
var nodemailer = require('nodemailer');
var argv = require('yargs')
    .usage('Usage: node $0 [options]')
    .option('file', { alias: 'f', describe: 'File that contains the original queries', default: 'ncaabb-all.qry'})
    .option('date', { alias: 'd', describe: 'Date that query should look to find teams (Format: YYYYMMDD)'})
    .option('delay', { alias: 's', describe: 'Delay between each REST api call in ms', default: 2500 })
    .option('mail', { alias: 'm', describe: 'Send email of picks to specified email address', default: null})
    .help('--help')
    .argv;

var date = argv.date;
var teamsToBet = { "picks": [] };
var myPromises = [];
var sportBeingAnalyzed = "";

// If no date specified as an option then set it to todays date
if (date === undefined) { date = getTodaysDate(); }

// Code to read queries from file and store the URLs into an array
var originalUrls = fs.readFileSync(argv.file).toString().split("\n");
// Remove last one if empty string (due to line feeds added to queries text file when saving)
if (originalUrls[originalUrls.length-1].length === 0) {
  originalUrls.pop();
}

for (var i = 0; i < originalUrls.length; i++) {

  var promise = new Promise(function(resolve, reject) {

    var betString = originalUrls[i].split('|');


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
      options.url = buildRequestUrl(betString[2], date);
      options.comments = betString[1];
    } else {
      options.theQuery = betString[1];
      options.url = buildRequestUrl(betString[1], date);
    }

    // console.log("URL: " + options.url);
    // console.log("Comments: "+ options.comments);

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

          if (jsonResponse.html) {
            console.log("Problem found retrieving the JSON results from the query");
            console.log(qNum + ". WARNING: Problem found with this query: " +options.theQuery);
            resolve("No records found");
            return;
          }

          // Look for the team and add it to the teams object
          // console.log("JSON Results: " + JSON.stringify(jsonResponse,0,3));
          var teamsArray = jsonResponse.groups[0].columns[0];
          var linesArray = jsonResponse.groups[0].columns[1];
          var opponentsArray = jsonResponse.groups[0].columns[2];
          var totalsArray = jsonResponse.groups[0].columns[3];
          console.log(qNum + ". Query found a bet to make: " + teamsArray + " " + options.theQuery);
          for (var j = 0; j < teamsArray.length; j++) {
            var picksEntry = {
              "team": teamsArray[j],
              "betType": betString[0],
              "line": linesArray[j],
              "total": totalsArray[j],
              "opponent": opponentsArray[j],
              "hits": 1,
              "matchedQuery": [qNum],
              "queryComments": [options.comments],
              "queryURL": [options.theQuery]
            }

            // Check if team already in array, if so add to hit, otherwise add new picks entry
            var foundExistingPick = false;
            for (var x = 0; x < teamsToBet.picks.length; x++) {
              if (teamsToBet.picks[x].team === teamsArray[j] && teamsToBet.picks[x].betType === betString[0]) {
                teamsToBet.picks[x].hits++;
                teamsToBet.picks[x].matchedQuery.push(qNum);
                teamsToBet.picks[x].queryURL.push(options.theQuery);
                foundExistingPick = true;
              }
            }
            if (!foundExistingPick) {
              teamsToBet.picks.push(picksEntry);
            }

          }
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
    console.log("");
    printTeamsToBet(teamsToBet);
    if (argv.mail != null) {
        emailTeamsToBet(teamsToBet);
    }
});

// Converts original SDQL http URL into the API url that returns JSON
function buildRequestUrl(origUrl, date) {
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

// Build todays date and returns it formatted as YYYYMMDD
function getTodaysDate() {
    var date = new Date();
    var yyyymmdd = date.getFullYear().toString();
    var month = date.getMonth()+1;
    var day = date.getDate();
    if (month < 10) { month = '0' + month; }
    if (day < 10) { day = '0' + day; }
    yyyymmdd += month.toString() + day.toString();
    return yyyymmdd;
}

function emailTeamsToBet(teamsToBet) {
    console.log("Sending email to: " + argv.mail);
    var transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: 'charles.fun.svt',
            pass: 'il0vesvt'
        }
    });
    // Get todays date in mm/dd/yyyy format to use in the email
    var date = new Date();
    date = date.getMonth() + 1 + "/" + date.getDate() + "/" + date.getFullYear();
    var body, mySubject = "";
    var emailTo = argv.mail;

    // Create the body & subject of the email
    var mySubject = null;
    var body = null;
    if (teamsToBet.picks.length === 0) {
        mySubject = "There are NO " + sportBeingAnalyzed + " sdql games to bet for " + date;
        body = "No games found for betting today.";
    } else {
        mySubject = date + ": " + sportBeingAnalyzed + " sdql games found to bet!!!";
        body = "<h1>Games to Bet for " + date + "</h1>";

        for (var i = 0; i < teamsToBet.picks.length; i++) {
          // Collision check inner loop
          for (var j = 0; j < teamsToBet.picks.length; j++) {
            var pick1betType = teamsToBet.picks[i].betType.toUpperCase();
            var pick2betType = teamsToBet.picks[j].betType.toUpperCase();
            // OU collision check
            if ((i != j) && (pick1betType.includes('U') || pick1betType.includes('O'))) {
              if ((teamsToBet.picks[i].team === teamsToBet.picks[j].opponent) || (teamsToBet.picks[i].team === teamsToBet.picks[j].team)) {
                if ((pick1betType.includes('O') && pick2betType.includes('U')) || (pick1betType.includes('U') && pick2betType.includes('O'))) {
                  body += "<span style=\"color:red\"><b>Over/Under Collision detected: </b></span>";
                  break;
                }
              }
            } // END of OU collision check
            // ATS collision check
            if (i!=j && teamsToBet.picks[i].betType.toUpperCase()==='A' && teamsToBet.picks[j].betType.toUpperCase()==='A') {
              //TODO: Test this somehow.. don't think it's right
              if (teamsToBet.picks[i].team === teamsToBet.picks[j].opponent) {
                body += "<span style=\"color:red\"><b>ATS Collision detected: </b></span>";
                break;
              }
            } // END OF ATS collision Check
          } //END OF INNER FOR LOOP for collision check

          // If no collision print the pick
          var starString = getStarsString(teamsToBet.picks[i].hits);
          if (teamsToBet.picks[i].hits > 1) {
            body +="<span style=\"color:#04a314\"><b>" + starString;
          }
          //ATS picks
          if (teamsToBet.picks[i].betType.toUpperCase().includes('A')) {
            body += "ATS: " + teamsToBet.picks[i].team.toUpperCase() + " (" + teamsToBet.picks[i].line + ") vs. " + teamsToBet.picks[i].opponent.toLowerCase();
          }
          if (teamsToBet.picks[i].betType.toUpperCase().includes('U')) {
            body += "UNDER: (" + teamsToBet.picks[i].total + ") " + teamsToBet.picks[i].team.toUpperCase() + "/" + teamsToBet.picks[i].opponent + "";
          }
          if (teamsToBet.picks[i].betType.toUpperCase().includes('O')) {
            body += "OVER: (" + teamsToBet.picks[i].total + ") " + teamsToBet.picks[i].team.toUpperCase() + "/" + teamsToBet.picks[i].opponent + "";
          }

          if (teamsToBet.picks[i].hits>1) { body+=starString+"</b></span>"; }
          body += "<br>";
          if (teamsToBet.picks[i].queryComments.toString().length > 0) {
            body += "Query notes: " + teamsToBet.picks[i].queryComments + "<br>";
          }
          for (var j = 0; j < teamsToBet.picks[i].queryURL.length; j++) {
            body += "Matched query #" + teamsToBet.picks[i].matchedQuery[j];
            body += " (<a href=" + teamsToBet.picks[i].queryURL[j] + ">" + teamsToBet.picks[i].queryURL[j] + "</a>)<br>";
          }
          body += "<br>";
        }

    }
    // setup e-mail data
    var mailOptions = {
        from: 'charlieplex', // sender address
        to: emailTo, // list of receivers
        subject: mySubject, // Subject line
        text: body, // plaintext body
        html: body // html body
    };
    // send mail with defined transport object
    transporter.sendMail(mailOptions, function (error, info) {
        if (error) {
            console.log("ERROR: There was an error sending the summary email");
            return console.log(error);
        }
    });
}

function getStarsString(num) {
    var thestring = "";
    for (var i = 0; i<num; i++) {
        thestring += "☆";
    }
    return thestring;
}

// Prints out teams to bet in descending order by how many times found by queries
function printTeamsToBet(teamsToBet) {
  console.log("Games to Bet");
  console.log("============");
  //FOR LOOP TO CHECK FOR COLLISIONS BASED ON BET TYPE
  for (var i = 0; i < teamsToBet.picks.length; i++) {
    var pick1betType = teamsToBet.picks[i].betType.toUpperCase();
    // this for loop is to cylce through opponents to be sure not to print any collisions
    for (var j = 0; j < teamsToBet.picks.length; j++) {

      var pick2betType = teamsToBet.picks[j].betType.toUpperCase();
      // OU collision check
      if ((i != j) && (pick1betType.includes('U') || pick1betType.includes('O'))) {
        if ((teamsToBet.picks[i].team === teamsToBet.picks[j].opponent) || (teamsToBet.picks[i].team === teamsToBet.picks[j].team)) {
          if ((pick1betType.includes('O') && pick2betType.includes('U')) || (pick1betType.includes('U') && pick2betType.includes('O'))) {
            // console.log("Pick 1 betType:" + pick1betType);
            // console.log("Pick 2 betType:" + pick2betType);
            // console.log("I team/opponnet: " + teamsToBet.picks[i].team + " / " + teamsToBet.picks[i].opponent);
            // console.log("J team/opponent: " + teamsToBet.picks[j].team + " / " + teamsToBet.picks[j].opponent);
            console.log("OU Collision detected with game: " + teamsToBet.picks[i].team + "/" + teamsToBet.picks[j].opponent);
            break;
          }
        }
      } // END of OU collision check

      // ATS collision check
      if (i!=j && teamsToBet.picks[i].betType.toUpperCase()==='A' && teamsToBet.picks[j].betType.toUpperCase()==='A') {
        //TODO: Test this somehow.. don't think it's right
        if (teamsToBet.picks[i].team === teamsToBet.picks[j].opponent) {
            console.log("ATS Collision detected with team: " + teamsToBet.picks[i].team);
        }
      } // END OF ATS collision Check
    } //END OF INNER FOR LOOP

    if (teamsToBet.picks[i].betType.toUpperCase().includes('A')) {
      console.log("Against the Spread Bet:");
      console.log(teamsToBet.picks[i].team.toUpperCase() + " (" + teamsToBet.picks[i].line + ") vs. " + teamsToBet.picks[i].opponent);
      if (teamsToBet.picks[i].queryComments != null) {
        console.log("Query notes: " + teamsToBet.picks[i].queryComments);
      }
      console.log("Matched queries: " + teamsToBet.picks[i].matchedQuery);
      console.log("");
    }
    if (teamsToBet.picks[i].betType.toUpperCase().includes('U')) {
      console.log(teamsToBet.picks[i].team.toUpperCase() + "/" + teamsToBet.picks[i].opponent + " UNDER the Total: " + teamsToBet.picks[i].total);
      console.log("Matched queries: " + teamsToBet.picks[i].matchedQuery);
      console.log();
    }
    if (teamsToBet.picks[i].betType.toUpperCase().includes('O')) {
      console.log(teamsToBet.picks[i].team.toUpperCase() + "/" + teamsToBet.picks[i].opponent + " OVER the Total: " + teamsToBet.picks[i].total);
      console.log("Matched queries: " + teamsToBet.picks[i].matchedQuery);
      console.log();
    }

  }
}
