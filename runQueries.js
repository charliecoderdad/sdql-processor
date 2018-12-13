// var request = require('request');
var helper = require('./runQueriesHelper.js');
var syncRequest = require('sync-request');
var fs = require('fs');
var sleep = require('sleep-promise');
var nodemailer = require('nodemailer');
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

var temp = originalUrls[0].split('|');
var sportBeingAnalyzed = helper.getSportBeingAnalysed(temp[temp.length-1]);

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
      console.log("   - Query #" + options.queryNumber + " performance: " + queryResults);
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
        "queryComments": "",
        "queryURL": [options.theQuery]
      }
      if (queryResults) {
        picksEntry.matchedQuery = ["#" + options.queryNumber + " " + queryResults];
      }
      if (options.comments !== null) {
        picksEntry.queryComments = ["#" + options.queryNumber + " " + options.comments];
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
                teamsToBet.picks[x].matchedQuery.push("#" + options.queryNumber + " " + queryResults)
              } else {
                teamsToBet.picks[x].matchedQuery.push(options.queryNumber);
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
              teamsToBet.picks[x].matchedQuery.push("#" + options.queryNumber + " " + queryResults)
            } else {
              teamsToBet.picks[x].matchedQuery.push(options.queryNumber);
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
printTeamsToBet(teamsToBet);
if (argv.mail != null) {
  emailTeamsToBet(teamsToBet);
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
        if (checkDate) {
          body += "<h3 style='color:grey'>Query performance based on last " + argv.checkFromdaysAgo + " days</h2>";
        }
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
            body += "Matched query " + teamsToBet.picks[i].matchedQuery[j];
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
  console.log("  /==============\\");
  console.log("  | Games to Bet |");
  console.log("  \\==============/");
  console.log();
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
    }
    if (teamsToBet.picks[i].betType.toUpperCase().includes('U')) {
      console.log(teamsToBet.picks[i].team.toUpperCase() + "/" + teamsToBet.picks[i].opponent + " UNDER the Total: " + teamsToBet.picks[i].total);
    }
    if (teamsToBet.picks[i].betType.toUpperCase().includes('O')) {
      console.log(teamsToBet.picks[i].team.toUpperCase() + "/" + teamsToBet.picks[i].opponent + " OVER the Total: " + teamsToBet.picks[i].total);
    }
    if (teamsToBet.picks[i].queryComments.toString().length !== 0) {
      console.log("Query notes: " + teamsToBet.picks[i].queryComments);
    }
    console.log("Matched queries: " + teamsToBet.picks[i].matchedQuery);
    console.log();
  }
}
