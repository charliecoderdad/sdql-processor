var request = require('request');
var fs = require('fs');
var sleep = require('sleep-promise');
var argv = require('yargs')
    .usage('Usage: node $0 [options]')
    .option('season', { alias: 's', describe: 'Check a specific season', default: null})
    .option('month', { alias: 'm', describe: 'Check a specific month', default: null})
    .option('date', { alias: 'd', describe: 'Check a specific date (YYYYMMDD)', default: null})
    .option('custom', { alias: 'c', describe: 'Add custom string (%3D is "=", + is "space", i.e. "+and+season>2014")', default: null})
    .option('file', { alias: 'f', describe: 'File that contains the original queries', default: 'queries-2018-selection.txt'})
    .option('delay', { describe: 'Delay between each REST api call in ms', default: 2500 })
    .option('debug', { describe: 'Use this to display extra information during the run', default: false })
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

// Code to read queries from file and story the URLs into an array
var originalUrls = fs.readFileSync(argv.file).toString().split("\n");
for (var i = 0; i < originalUrls.length; i++) {

    var promise = new Promise(function (resolve, reject) {
        var options = {
            queryNumber: i,
            theQuery: originalUrls[i],
            url: buildRequestUrl(originalUrls[i]),
            port: 80,
            method: 'GET'
        };
        sleep(i * argv.delay).then(function () {
            request(options, function (error, response, body) {
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
                        console.log("JSON Response: " + JSON.stringify(jsonResponse));
                    }

                    // Look for the team and add it to the teams object
                    var atsWins = 0;
                    var atsLosses = 0
                    var atsPushes = 0;
                    var pointsForArray = jsonResponse.groups[0].columns[0];
                    var pointsAgainstArray = jsonResponse.groups[0].columns[1];
                    var linesArray = jsonResponse.groups[0].columns[2];
                    // console.log(qNum + ". Query found teams to bet: " + teamsArray + " " + options.theQuery);
                    for (var j = 0; j < pointsForArray.length; j++) {
                        var margin = pointsForArray[j] - pointsAgainstArray[j];
                        var line = linesArray[j];
                        if (pointsForArray[j] !== null) {
                            if (margin + line > 0) {
                                atsWins++;
                                overallWins++;
                            } else if (margin + line < 0) {
                                atsLosses++;
                                overallLosses++;
                            } else {
                                atsPushes++;
                                overallPushes++;
                            }
                        }

                    }
                    var winPercent = (atsWins / (atsWins + atsLosses))*100;
                    console.log(qNum + ". Win percent: " + Number(winPercent).toFixed(1) + "% (" + atsWins + "-" + atsLosses + "-" + atsPushes + ")");
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
function buildRequestUrl(orignalUrl) {
    var query = orignalUrl.substr(orignalUrl.indexOf("&sdql=")+6, orignalUrl.length);
    query = query.substr(0, query.indexOf("&submit"));
    var returnUrl = " http://api.sportsdatabase.com/nba/query.json?sdql=points%2Co%3Apoints%2Cline%40";
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

    if (argv.debug) {
        console.log("Built query: " + returnUrl);
    }
    return returnUrl;
}
