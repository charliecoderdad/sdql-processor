var query = "http://sportsdatabase.com/nfl/query?output=default&sdql=day%3DThursday+and+HF"

var match = query.match(/\/\w*\/query/)

console.log("New Query: " + match);
