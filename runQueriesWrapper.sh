cd /home/charlie/github/ncaabb-sdql

LOGFILE=output.log
node runQueries.js -m ncsucharlie@gmail.com | tee $LOGFILE
