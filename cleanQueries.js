var fs = require('fs');
var argv = require('yargs')
    .usage('Usage: node $0 [options]')
    .option('file', { alias: 'f', describe: 'File that contains the original queries', demandOption: true })
    .help()
    .argv;

var queries = fs.readFileSync(argv.file).toString().split("\n");
if (queries[queries.length-1].toString().length === 0) {
  queries.pop();
}

var file = argv.file;
fs.writeFileSync(file, "");
queries.forEach(function(query) {
  query = query.trim();
  console.log("Query: |" + query + "|");
  if (query.indexOf('&submit=')) {
    query = query.substr(0, query.indexOf('&submit='));
    fs.appendFileSync(file, query + "\n");
  }
  console.log("Query: |" + query + "|");
});
