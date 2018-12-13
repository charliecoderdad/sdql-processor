var nodemailer = require('nodemailer');
var helper = require('./runQueriesHelper.js');

module.exports = {

  // Prints out teams to bet in descending order by how many times found by queries
  printTeamsToBet: function(teamsToBet) {
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
        if (i != j && teamsToBet.picks[i].betType.toUpperCase() === 'A' && teamsToBet.picks[j].betType.toUpperCase() === 'A') {
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
  },

  emailTeamsToBet: function(teamsToBet, properties) {
    console.log("Sending email to: " + properties.emailAddress);
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

    // Create the body & subject of the email
    var mySubject = null;
    var body = null;
    if (teamsToBet.picks.length === 0) {
      mySubject = "There are NO " + properties.sportBeingAnalyzed + " sdql games to bet for " + date;
      body = "No games found for betting today.";
    } else {
      mySubject = date + ": " + properties.sportBeingAnalyzed + " sdql games found to bet!!!";
      body = "<h1>Games to Bet for " + date + "</h1>";
      if (properties.checkDate) {
        body += "<h3 style='color:grey'>Query performance based on last " + properties.checkFromdaysAgo + " days</h2>";
      }
      for (var i = 0; i < teamsToBet.picks.length; i++) {
        body += "<style>";
        body += "table, td, th { border-collapse: collapse; border: 1px solid black; color: white }";
        body += "td { padding-left: 8px; padding-right: 8px }";
        body += "a, a:visited { color: white }";
        body += "</style>";
        body += "<table>";
        body += "<tr><td style='color:black' colspan=3>";
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
          if (i != j && teamsToBet.picks[i].betType.toUpperCase() === 'A' && teamsToBet.picks[j].betType.toUpperCase() === 'A') {
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
          body += "<span style=\"color:#04a314\"><b>" + starString;
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

        if (teamsToBet.picks[i].hits > 1) {
          body += starString + "</b></span>";
        }
        body += "</td></tr>"; // END OF MAIN HEADER TABLE ROW
        for (var j = 0; j < teamsToBet.picks[i].queryURL.length; j++) {
          var rowColor = getRowColor(teamsToBet.picks[i].queryResults[j].winPercent);
          body += "<tr style='background-color: " + rowColor + "'><td><a href=" + teamsToBet.picks[i].queryURL[j] + ">Matched query " + teamsToBet.picks[i].matchedQuery[j] + "</a></td>";
          body += "<td>" + teamsToBet.picks[i].queryResults[j].perfString + "</td>";
          body += "<td>";
          if (teamsToBet.picks[i].queryComments[j] && teamsToBet.picks[i].queryComments.toString().length > 0) {
            body += teamsToBet.picks[i].queryComments[j];
          } else {
            body += "No query notes."
          }
          body += "</td></tr>";
        }
        body += "</table>";
        body += "<br>";
      }
    }
    // setup e-mail data
    var mailOptions = {
      from: 'charlieplex', // sender address
      to: properties.emailAddress, // list of receivers
      subject: mySubject, // Subject line
      text: body, // plaintext body
      html: body // html body
    };
    // send mail with defined transport object
    transporter.sendMail(mailOptions, function(error, info) {
      if (error) {
        console.log("ERROR: There was an error sending the summary email");
        return console.log(error);
      }
    });
  }
}

function getRowColor(percent) {
  var colorCodes = {
    bad: "#c92a07",
    good: "#99ff99",
    better: "#009900",
    best: "#0000e6"
  }
  if (percent < 52.38) {
    return colorCodes.bad;
  }
  if (percent >52.38 && percent <= 55) {
    return colorCodes.good;
  }
  if (percent > 55 && percent < 60) {
    return colorCodes.better;
  }
  return colorCodes.best;
}

function getStarsString(num) {
  var thestring = "";
  for (var i = 0; i < num; i++) {
    thestring += "☆";
  }
  return thestring;
}
