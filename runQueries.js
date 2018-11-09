var request = require('request');
var fs = require('fs');
var sleep = require('sleep-promise');
var argv = require('yargs')
    .usage('Usage: node $0 [options]')
    .option('date', { alias: 'd', describe: 'Date that query should look to find teams (Format: YYYYMMDD)'})
    .option('file', { alias: 'f', describe: 'File that contains the original queries', default: 'queries-all.txt'})
    .option('delay', { alias: 's', describe: 'Delay between each REST api call in ms', default: 2500 })
    .option('debug', { describe: 'Use this to display extra information during the run', default: false })
    .option('showCollisions', { alias: 'c', describe: 'Will print picks where opponents also matched a query', default: true })
    .option('mail', { alias: 'm', describe: 'Send email of picks to specified email address', default: null})
    .help('--help')
    .argv;

var date = argv.date;
var teamsToBet = { "picks": [] };
var myPromises = [];

var nodemailer = require('nodemailer');
var transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: 'charles.fun.svt',
        pass: 'il0vesvt'
    }
});

// If no date specified as an option then set it to todays date
if (date === undefined) { date = getTodaysDate(); }
if (argv.debug) { console.log("Using date: " + date); }

// Code to read queries from file and store the URLs into an array
var originalUrls = fs.readFileSync(argv.file).toString().split("\n");
// Remove last one if empty string (due to line feeds added to queries text file when saving)
if (originalUrls[originalUrls.length-1].length === 0) {
  originalUrls.pop();
}

for (var i = 0; i < originalUrls.length; i++) {

  var promise = new Promise(function(resolve, reject) {

    var betString = originalUrls[i].split(',');
    var options = {
      queryNumber: i,
      theQuery: betString[1],
      url: buildRequestUrl(betString[1], date),
      port: 80,
      method: 'GET'
    };

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

          if (argv.debug) {
            console.log("");
            console.log("JSON Response: " + JSON.stringify(jsonResponse,0,3));
            console.log("API Request: " + options.url);
            console.log("");
          }

          // Look for the team and add it to the teams object
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
              "queryURL": [options.theQuery]
            }
            // teamsToBet.picks[matchedQuery].push(qNum);
            // picksEntry[matchedQuery].push(qNum);
            if (argv.debug) {
              console.log(" Picks entry JSON: " + JSON.stringify(picksEntry,0,3));
            }

            // Check if team already in array, if so add to hit, otherwise add new picks entry
            var foundExistingPick = false;
            for (var x = 0; x < teamsToBet.picks.length; x++) {
              if (teamsToBet.picks[x].team === teamsArray[j]) {
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
function buildRequestUrl(orignalUrl, date) {
    var query = orignalUrl.substr(orignalUrl.indexOf("&sdql=")+6, orignalUrl.length);

    var returnUrl = " http://api.sportsdatabase.com/ncaabb/query.json?sdql=team%2Cline%2Co%3Ateam%2Ctotal%40";
    returnUrl+=query;
    // TODO: REMOVE TIHS date declaration LATER, using for debugging
    // date="20171129";
    returnUrl+="+and+date%3D" + date;
    returnUrl+="&output=json&api_key=guest";
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
    // Get todays date in mm/dd/yyyy format to use in the email
    var date = new Date();
    date = date.getMonth() + 1 + "/" + date.getDate() + "/" + date.getFullYear();
    var body, mySubject = "";
    var emailTo = argv.mail;

    // Create the body & subject of the email
    var mySubject = null;
    var body = null;
    if (teamsToBet.picks.length === 0) {
        mySubject = "There are NO sdql games to bet for " + date;
        body = "No games found for betting today.";
    } else {
        mySubject = date + ": NCAA Hoops sdql games found to bet!!!";
        body = "<h1>Games to Bet for " + date + "</h1>";
        for (var i = 0; i < teamsToBet.picks.length; i++) {
            // this for loop is to cylce through opponents to be sure not to print any collisions
            var collision = false;
            for (var j = 0; j < teamsToBet.picks.length; j++) {
                if (teamsToBet.picks[i].team === teamsToBet.picks[j].opponent) {
                    collision = true;
                    if (argv.debug || argv.showCollisions) { body += "<span style=\"color:red\"><b>Collision detected: </b></span>"; }
                }
            }
            // If no collision print the pick
            if (!collision || argv.showCollisions) {
                var starString = getStarsString(teamsToBet.picks[i].queryURL.length);
                if (teamsToBet.picks[i].queryURL.length>1) { body +="<span style=\"color:#04a314\"><b>" + starString; }
                body += teamsToBet.picks[i].team.toUpperCase() + " (" + teamsToBet.picks[i].line + ") vs. " + teamsToBet.picks[i].opponent + "";
                if (teamsToBet.picks[i].queryURL.length>1) { body+=starString+"</b></span>"; }
                body += "<br>";
                for (var j = 0; j < teamsToBet.picks[i].queryURL.length; j++) {
                    body += "Matched query #" + teamsToBet.picks[i].matchedQuery[j];
                    body += " (<a href=" + teamsToBet.picks[i].queryURL[j] + ">" + teamsToBet.picks[i].queryURL[j] + "</a>)<br>";
                }
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
    if (argv.debug) { console.log("GamesToBet JSON: " + JSON.stringify(teamsToBet,0,3)); }
    console.log("Games to Bet");
    console.log("============");
    for (var i = 0; i < teamsToBet.picks.length; i++) {
        // this for loop is to cylce through opponents to be sure not to print any collisions
        var collision = false;
        for (var j = 0; j < teamsToBet.picks.length; j++) {
          if (teamsToBet.picks[i].betType.toUpperCase()==='A' && teamsToBet.picks[j].betType.toUpperCase()==='A')
            if (teamsToBet.picks[i].team === teamsToBet.picks[j].opponent) {
                collision = true;
                if (argv.debug || argv.showCollisions) { console.log("Collision detected with team: " + teamsToBet.picks[i].team); }
            }
        }
        // If no collision print the pick
        if (!collision || argv.showCollisions) {
          if (teamsToBet.picks[i].betType.toUpperCase() === 'A') {
            console.log("Against the Spread Bet:");
            console.log(teamsToBet.picks[i].team.toUpperCase() + " (" + teamsToBet.picks[i].line + ") vs. " + teamsToBet.picks[i].opponent);
            console.log("Matched queries: " + teamsToBet.picks[i].matchedQuery);
            console.log("");
          }
          if (teamsToBet.picks[i].betType.toUpperCase() === 'U') {
            console.log(teamsToBet.picks[i].team.toUpperCase() + "/" + teamsToBet.picks[i].opponent + " UNDER the Total: " + teamsToBet.picks[i].total);
            console.log();
          }
          if (teamsToBet.picks[i].betType.toUpperCase() === 'O') {
            console.log(teamsToBet.picks[i].team.toUpperCase() + "/" + teamsToBet.picks[i].opponent + " OVER the Total: " + teamsToBet.picks[i].total);
            console.log();
          }
        }
    }

}
