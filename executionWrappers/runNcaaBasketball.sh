#!/bin/bash
SDQL_HOME_DIR=/home/charlie/github/sdql-processor
QUERY_FILE=$SDQL_HOME_DIR/queries/queries-ncaabb-all.txt
LOGFILE=$SDQL_HOME_DIR/logs/ncaabb-output.log
EMAIL_ADDY=ncsucharlie@gmail.com

mkdir -p $SDQL_HOME_DIR/logs

echo `date` > $LOGFILE

cd $SDQL_HOME_DIR
node runQueries.js -f $QUERY_FILE -m $EMAIL_ADDY | tee -a $LOGFILE
